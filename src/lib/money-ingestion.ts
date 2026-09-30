/**
 * Phase 1 Money Ingestion — Revenue Engine v1.
 *
 * RunSignup monetary source -> canonical Engine/D1 monetary truth.
 *
 * Source-boundary rules (ADR-0044):
 * - Normal ingestion is INCREMENTAL. The stored cursor (highest donation id
 *   durably committed) is sent as the source's verified `after_donation_id`
 *   filter, so already-canonicalized donations are never re-fetched merely
 *   to prove again that they still exist. A sync with no stored cursor (the
 *   very first) reads from page 1; every later sync reads strictly newer
 *   records only.
 * - Every downstream consumer reads D1 (money_events / money_transactions)
 *   and never re-reads RunSignup to reconfirm already-ingested monetary
 *   truth.
 * - No generic retry loop: a failed sync records the classified failure in
 *   money_sync_state and stops. Re-invocation is an explicit owner/Engine
 *   action, and idempotent ingestion makes it safe.
 * - Trigger rule (OPERATING_PLAN): no recurring-schedule polling of the
 *   source. Sync starts from an owner action in the operating center
 *   (POST /api/operating-center/money/sync) or an explicit Engine-internal
 *   action — never a cron "checking for changes".
 * - Reconciliation of already-canonicalized records (e.g. refund detection
 *   on old donations) is a SEPARATE, explicit, bounded owner action
 *   (POST /api/operating-center/money/reconcile with an explicit donation
 *   id list) — never part of normal ingestion.
 *
 * Correctness rules:
 * - Idempotent ingestion: every event carries a deterministic event_key
 *   (see money-model.ts); writes use INSERT OR IGNORE, so repeated syncs,
 *   retries and re-reads of unchanged source data create zero duplicates.
 * - Cursor/checkpoint advances if and only if the canonical monetary state
 *   was durably committed: the sync-state upsert rides in the SAME D1 batch
 *   as the event/transaction writes (atomic all-or-nothing). An incremental
 *   sync that finds nothing new keeps the previous cursor (never nulls it).
 * - Lifecycle: on re-read, the normalized snapshot hash is compared with the
 *   stored canonical snapshot. A changed snapshot derives a lifecycle event
 *   (refund / partial refund) with a deterministic fallback key; reversal and
 *   chargeback types exist in the model and fire when a source adapter can
 *   observe them (the donations/list source currently exposes no such fields).
 * - Transaction identity upgrade: if a donation already canonicalized under
 *   the `donation:{id}` fallback identity is re-observed with the source's
 *   true transaction identifier, its transaction row is remapped to the true
 *   identity (reported as identityUpgrades). Event keys are donation-record
 *   based and never move, so the idempotency proof is preserved.
 */

import { classifyRunSignupFailure, runSignupGetJson } from "../runsignup-client";
import {
	AMOUNT_VERIFIED,
	ATTRIBUTION_UNKNOWN,
	deriveLifecycleEvent,
	lifecycleEventKey,
	MONEY_EVENT_TYPES,
	type MoneyEventType,
	MONEY_SYNC_SOURCE_KEY,
	normalizeRunSignupDonation,
	type NormalizedRunSignupDonation,
	RUNSIGNUP_DONATION_RACE_ID,
	RUNSIGNUP_SOURCE_SYSTEM,
} from "./money-model";

/**
 * Phase 4 — Donation Acquisition Loop: post-donation automated action.
 *
 * When a NEW donation_received event is ingested for the Phase 4 funnel
 * object (donation:runsignup:212466), the Engine automatically records the
 * next revenue action in the canonical Revenue Inventory. This closes the
 * loop leg "Engine ingestion -> attribution state -> next automated revenue
 * action" using only the existing inventory machinery (no new tables,
 * no new email system, no new architecture).
 *
 * The action is `donation-received` / `pending`: the Engine has verified
 * the monetary event and the object is ready for its next revenue step.
 * Attribution stays ATTRIBUTION_UNKNOWN (honest: no acquisition link yet).
 */
const PHASE4_FUNNEL_OBJECT_KEY = "donation:runsignup:212466";
const PHASE4_POST_DONATION_ACTION = "donation-received";

const DONATIONS_PAGE_SIZE = 100;
const DONATIONS_MAX_PAGES = 20; // hard bound: 2,000 records per sync max
const RECONCILE_MAX_IDS = 25; // hard bound: explicit, bounded reconciliation

export interface MoneySyncResult {
	ok: boolean;
	sourceKey: string;
	/** True when the sync read incrementally via the stored cursor. */
	incremental: boolean;
	fetched: number;
	skippedNoIdentity: number;
	transactionsNew: number;
	eventsIngested: number;
	eventsDuplicate: number;
	lifecycleEvents: number;
	/** Transaction identity remaps applied (old_key -> new_key). */
	identityUpgrades: Array<{ from: string; to: string }>;
	cursor: string | null;
	lastSyncAt: string;
	error?: string;
	failureInterpretation?: string;
}

export interface MoneyReconcileResult {
	ok: boolean;
	sourceKey: string;
	requested: number;
	fetched: number;
	transactionsNew: number;
	eventsIngested: number;
	lifecycleEvents: number;
	identityUpgrades: Array<{ from: string; to: string }>;
	perDonation: Array<{ donationId: string; status: string }>;
	lastSyncAt: string;
	error?: string;
	failureInterpretation?: string;
}

export interface DonationRecordShape {
	ok: boolean;
	donationId: string;
	/** Top-level field names observed on the live record (shape only). */
	fieldNames: string[];
	identifiers: {
		donation_id: unknown;
		rsu_transaction_id: unknown;
		transaction_id: unknown;
		associated_registration_id: unknown;
		fundraiser_id: unknown;
	};
	amounts: {
		donation_amount: unknown;
		processing_fee: unknown;
		amount_paid: unknown;
	};
	timestamps: {
		donation_date_ts: unknown;
		donation_date: unknown;
	};
	error?: string;
}

interface StoredTransaction {
	transaction_key: string;
	source_payload_hash: string | null;
	lifecycle_state: string;
	refund_cents: number | null;
	refund_status: string | null;
}

/**
 * Verified RunSignup cursor mechanism (official Get Race Donations docs):
 * `after_donation_id` returns donations strictly greater than the provided
 * id; `sort_direction=ASC` orders by donation id ascending. This is the
 * incremental ingestion filter — never page-1 re-reads on later syncs.
 */
function donationsListUrl(
	raceId: number,
	page: number,
	pageSize: number,
	afterDonationId?: string | null,
): string {
	let url =
		`https://api.runsignup.com/rest/race/${raceId}/donations/list` +
		`?format=json&results_per_page=${pageSize}&page=${page}&sort_direction=ASC`;
	if (afterDonationId) url += `&after_donation_id=${encodeURIComponent(afterDonationId)}`;
	return url;
}

function extractDonationRecords(data: unknown): Record<string, unknown>[] {
	if (Array.isArray(data)) return data as Record<string, unknown>[];
	if (data && typeof data === "object") {
		const d = (data as Record<string, unknown>)["donations"];
		if (Array.isArray(d)) return d as Record<string, unknown>[];
	}
	return [];
}

function isKnownEventType(t: string): t is MoneyEventType {
	return (MONEY_EVENT_TYPES as readonly string[]).includes(t);
}

interface FetchPage {
	records: Record<string, unknown>[];
}

async function fetchDonationPages(
	runSignupToken: string,
	raceId: number,
	pageSize: number,
	maxPages: number,
	afterDonationId: string | null,
): Promise<{ ok: true; pages: FetchPage[] } | { ok: false; error: string; failureInterpretation: string }> {
	const pages: FetchPage[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const result = await runSignupGetJson<unknown>(
			donationsListUrl(raceId, page, pageSize, afterDonationId),
			runSignupToken,
		);
		if (!result.ok) {
			const interpretation = classifyRunSignupFailure(
				result.api_error_code,
				result.api_error_msg,
				result.http_status,
			);
			return {
				ok: false,
				error:
					`RunSignup donations/list read failed (page ${page}` +
					`${afterDonationId ? `, after_donation_id=${afterDonationId}` : ""}): ` +
					`http=${result.http_status ?? "?"} api_error=${result.api_error_code ?? "-"} ` +
					`${result.api_error_msg ?? ""}`.trim(),
				failureInterpretation: interpretation,
			};
		}
		const pageRecords = extractDonationRecords(result.data);
		pages.push({ records: pageRecords });
		if (pageRecords.length < pageSize) break; // last page
	}
	return { ok: true, pages };
}

function normalizeRecords(
	pages: FetchPage[],
	raceId: number,
): { normalized: NormalizedRunSignupDonation[]; skippedNoIdentity: number; fetched: number } {
	const normalized: NormalizedRunSignupDonation[] = [];
	let skippedNoIdentity = 0;
	let fetched = 0;
	for (const p of pages) {
		for (const r of p.records) {
			fetched++;
			const n = normalizeRunSignupDonation(r, raceId);
			if (!n) {
				skippedNoIdentity++;
				continue;
			}
			normalized.push(n);
		}
	}
	return { normalized, skippedNoIdentity, fetched };
}

interface IngestOutcome {
	transactionsNew: number;
	eventsAttempted: number;
	eventsIngested: number;
	lifecycleEvents: number;
	identityUpgrades: Array<{ from: string; to: string }>;
	maxDonationId: number;
}

/**
 * Shared ingestion core: normalized donations -> canonical D1 writes, in one
 * atomic batch. Used by both incremental sync and explicit reconciliation.
 * Returns the statements (without the checkpoint) plus the outcome stats.
 */
async function buildIngestBatch(
	db: D1Database,
	normalized: NormalizedRunSignupDonation[],
): Promise<{
	statements: D1PreparedStatement[];
	eventInsertIndexes: number[];
	outcome: IngestOutcome;
}> {
	const statements: D1PreparedStatement[] = [];
	const eventInsertIndexes: number[] = [];
	const outcome: IngestOutcome = {
		transactionsNew: 0,
		eventsAttempted: 0,
		eventsIngested: 0,
		lifecycleEvents: 0,
		identityUpgrades: [],
		maxDonationId: 0,
	};

	// --- Load existing canonical state for change detection ------------------
	const existing = new Map<string, StoredTransaction>();
	const receiptKeyToTxnKey = new Map<string, string>();
	if (normalized.length > 0) {
		const keys = [...new Set(normalized.map((n) => n.transactionKey))];
		const placeholders = keys.map(() => "?").join(",");
		const rows = await db
			.prepare(
				`SELECT transaction_key, source_payload_hash, lifecycle_state, refund_cents, refund_status
				 FROM money_transactions WHERE transaction_key IN (${placeholders})`,
			)
			.bind(...keys)
			.all<StoredTransaction>();
		for (const row of rows.results ?? []) existing.set(row.transaction_key, row);

		// Identity-upgrade detection: donation receipt events are
		// donation-record keyed and never move; if one exists under a
		// different transaction key, this donation was previously
		// canonicalized under the fallback identity.
		const receiptKeys = [...new Set(normalized.map((n) => n.eventKey))];
		const rqPlaceholders = receiptKeys.map(() => "?").join(",");
		const eventRows = await db
			.prepare(
				`SELECT event_key, transaction_key FROM money_events WHERE event_key IN (${rqPlaceholders})`,
			)
			.bind(...receiptKeys)
			.all<{ event_key: string; transaction_key: string }>();
		for (const row of eventRows.results ?? []) {
			receiptKeyToTxnKey.set(row.event_key, row.transaction_key);
		}

		// Identity-upgrade candidates: rows canonicalized under a previous
		// (fallback) transaction key also need their stored state loaded for
		// change detection after the remap.
		const missingOldKeys = [...new Set(receiptKeyToTxnKey.values())].filter(
			(k) => !existing.has(k),
		);
		if (missingOldKeys.length > 0) {
			const op = missingOldKeys.map(() => "?").join(",");
			const oldRows = await db
				.prepare(
					`SELECT transaction_key, source_payload_hash, lifecycle_state, refund_cents, refund_status
					 FROM money_transactions WHERE transaction_key IN (${op})`,
				)
				.bind(...missingOldKeys)
				.all<StoredTransaction>();
			for (const row of oldRows.results ?? []) existing.set(row.transaction_key, row);
		}
	}

	const insertEvent = (
		eventKey: string,
		eventType: MoneyEventType,
		n: NormalizedRunSignupDonation,
		amountOverrides?: { refundCents: number | null },
	) => {
		if (!isKnownEventType(eventType)) return; // defense in depth for the CHECK
		eventInsertIndexes.push(statements.length);
		outcome.eventsAttempted++;
		statements.push(
			db
				.prepare(
					`INSERT OR IGNORE INTO money_events (
						event_key, source_system, source_transaction_id, transaction_key,
						event_type, occurred_at, currency,
						gross_cents, gross_status, fee_cents, fee_status,
						amount_paid_cents, amount_paid_status,
						net_cents, net_status, refund_cents, refund_status,
						attribution, source_ref, source_payload_hash
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.bind(
					eventKey,
					n.sourceSystem,
					n.sourceTransactionId,
					n.transactionKey,
					eventType,
					n.occurredAt,
					n.currency,
					n.amounts.grossCents,
					n.amounts.grossStatus,
					n.amounts.feeCents,
					n.amounts.feeStatus,
					n.amounts.amountPaidCents,
					n.amounts.amountPaidStatus,
					n.amounts.netCents,
					n.amounts.netStatus,
					amountOverrides ? amountOverrides.refundCents : n.amounts.refundCents,
					amountOverrides ? AMOUNT_VERIFIED : n.amounts.refundStatus,
					ATTRIBUTION_UNKNOWN,
					n.sourceRef,
					n.snapshotHash,
				),
		);
	};

	for (const n of normalized) {
		const numericId = Number(n.donationId);
		if (Number.isFinite(numericId) && numericId > outcome.maxDonationId) {
			outcome.maxDonationId = numericId;
		}
		let prev = existing.get(n.transactionKey);

		if (!prev) {
			// Identity upgrade check: already canonicalized under the
			// fallback identity, now observed with the true transaction id.
			const oldTxnKey = receiptKeyToTxnKey.get(n.eventKey);
			if (oldTxnKey && oldTxnKey !== n.transactionKey) {
				const oldRow = existing.get(oldTxnKey);
				outcome.identityUpgrades.push({ from: oldTxnKey, to: n.transactionKey });
				statements.push(
					db
						.prepare(
							`UPDATE money_transactions SET transaction_key = ?, source_transaction_id = ?,
							 updated_at = datetime('now') WHERE transaction_key = ?`,
						)
						.bind(n.transactionKey, n.sourceTransactionId, oldTxnKey),
				);
				statements.push(
					db
						.prepare(
							`UPDATE money_events SET transaction_key = ?, source_transaction_id = ?
							 WHERE transaction_key = ?`,
						)
						.bind(n.transactionKey, n.sourceTransactionId, oldTxnKey),
				);
				if (oldRow) {
					prev = { ...oldRow, transaction_key: n.transactionKey };
					existing.set(n.transactionKey, prev);
				}
			}
		}

		if (!prev) {
			// New canonical transaction: current-state row + receipt event(s).
			outcome.transactionsNew++;
			statements.push(
				db
					.prepare(
						`INSERT INTO money_transactions (
							transaction_key, source_system, source_transaction_id, first_event_key,
							currency, gross_cents, gross_status, fee_cents, fee_status,
							amount_paid_cents, amount_paid_status,
							net_cents, net_status, refund_cents, refund_status,
							lifecycle_state, attribution, source_ref, source_payload_hash
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
					)
					.bind(
						n.transactionKey,
						n.sourceSystem,
						n.sourceTransactionId,
						n.eventKey,
						n.currency,
						n.amounts.grossCents,
						n.amounts.grossStatus,
						n.amounts.feeCents,
						n.amounts.feeStatus,
						n.amounts.amountPaidCents,
						n.amounts.amountPaidStatus,
						n.amounts.netCents,
						n.amounts.netStatus,
						n.amounts.refundCents,
						n.amounts.refundStatus,
						ATTRIBUTION_UNKNOWN,
						n.sourceRef,
						n.snapshotHash,
					),
			);
			insertEvent(n.eventKey, "donation_received", n);
			if (n.fundraiserEventKey) insertEvent(n.fundraiserEventKey, "fundraiser_donation_received", n);
			// Phase 4: post-donation automated action. A newly ingested
			// donation on the Phase 4 funnel object automatically records
			// the next revenue action in the canonical Revenue Inventory.
			// Append-only: one action record per donation; the object's
			// next_revenue_action points at the latest donation.
			statements.push(
				db
					.prepare(
						`UPDATE revenue_objects SET next_revenue_action = ?, action_status = ?, updated_at = datetime('now') WHERE object_key = ?`,
					)
					.bind(PHASE4_POST_DONATION_ACTION, "pending", PHASE4_FUNNEL_OBJECT_KEY),
			);
			statements.push(
				db
					.prepare(
						`INSERT INTO revenue_object_actions (object_key, action, status, note) VALUES (?, ?, ?, ?)`,
					)
					.bind(
						PHASE4_FUNNEL_OBJECT_KEY,
						PHASE4_POST_DONATION_ACTION,
						"pending",
						`Donation ${n.donationId} ingested: gross ${n.amounts.grossCents}¢ ${n.amounts.grossStatus}, fee ${n.amounts.feeCents}¢ ${n.amounts.feeStatus}, amount_paid ${n.amounts.amountPaidCents}¢ ${n.amounts.amountPaidStatus}, net ${n.amounts.netStatus}. Attribution: ${ATTRIBUTION_UNKNOWN}.`,
					),
			);
			continue;
		}

		if (prev.source_payload_hash === n.snapshotHash) continue; // unchanged: no-op

		// Changed snapshot: derive a lifecycle event when the change maps to
		// one; otherwise update the stored snapshot without an event.
		const oldSnapshot = { refund_cents: prev.refund_cents ?? 0 };
		const lifecycle = deriveLifecycleEvent(oldSnapshot, n);
		if (lifecycle) {
			outcome.lifecycleEvents++;
			const key = lifecycleEventKey(
				n.sourceSystem,
				lifecycle.eventType,
				n.donationRef,
				n.snapshotHash,
			);
			insertEvent(key, lifecycle.eventType, n, { refundCents: lifecycle.refundCents });
		}
		statements.push(
			db
				.prepare(
					`UPDATE money_transactions SET
						currency = ?, gross_cents = ?, gross_status = ?,
						fee_cents = ?, fee_status = ?,
						amount_paid_cents = ?, amount_paid_status = ?,
						net_cents = ?, net_status = ?,
						refund_cents = ?, refund_status = ?,
						lifecycle_state = ?, source_payload_hash = ?, updated_at = datetime('now')
					 WHERE transaction_key = ?`,
				)
				.bind(
					n.currency,
					n.amounts.grossCents,
					n.amounts.grossStatus,
					n.amounts.feeCents,
					n.amounts.feeStatus,
					n.amounts.amountPaidCents,
					n.amounts.amountPaidStatus,
					n.amounts.netCents,
					n.amounts.netStatus,
					lifecycle?.refundCents ?? n.amounts.refundCents,
					lifecycle ? AMOUNT_VERIFIED : n.amounts.refundStatus,
					lifecycle ? lifecycle.lifecycleState : prev.lifecycle_state,
					n.snapshotHash,
					n.transactionKey,
				),
		);
	}

	return { statements, eventInsertIndexes, outcome };
}

async function executeBatch(
	db: D1Database,
	statements: D1PreparedStatement[],
	eventInsertIndexes: number[],
): Promise<number> {
	if (statements.length === 0) return 0;
	const batchResults = await db.batch(statements);
	let eventsIngested = 0;
	for (const i of eventInsertIndexes) {
		eventsIngested += batchResults[i]?.meta?.changes ?? 0;
	}
	return eventsIngested;
}

/**
 * Incremental sync: read the stored cursor, fetch strictly newer donations
 * via the source's verified after_donation_id filter, ingest, and advance
 * the checkpoint in the same atomic batch. Already-canonicalized donations
 * are never re-fetched.
 */
export async function syncRunSignupDonations(
	db: D1Database,
	runSignupToken: string,
	opts?: { raceId?: number; pageSize?: number; maxPages?: number },
): Promise<MoneySyncResult> {
	const raceId = opts?.raceId ?? RUNSIGNUP_DONATION_RACE_ID;
	const pageSize = opts?.pageSize ?? DONATIONS_PAGE_SIZE;
	const maxPages = opts?.maxPages ?? DONATIONS_MAX_PAGES;
	const sourceKey = `runsignup:donations:race:${raceId}`;
	const nowIso = new Date().toISOString();

	const fail = async (error: string, failureInterpretation?: string): Promise<MoneySyncResult> => {
		// Failure checkpoint: records the error WITHOUT advancing any cursor.
		// No monetary state changed, so there is nothing to keep in sync.
		await db.batch([
			db
				.prepare(
					`INSERT INTO money_sync_state (source_key, last_sync_at, last_error)
					 VALUES (?, ?, ?)
					 ON CONFLICT(source_key) DO UPDATE SET
						last_sync_at = excluded.last_sync_at,
						last_error = excluded.last_error`,
				)
				.bind(sourceKey, nowIso, error),
		]);
		return {
			ok: false,
			sourceKey,
			incremental: false,
			fetched: 0,
			skippedNoIdentity: 0,
			transactionsNew: 0,
			eventsIngested: 0,
			eventsDuplicate: 0,
			lifecycleEvents: 0,
			identityUpgrades: [],
			cursor: null,
			lastSyncAt: nowIso,
			error,
			failureInterpretation,
		};
	};

	if (!runSignupToken) {
		return fail("RunSignup access token is not configured", "TOKEN_INVALID");
	}

	// --- Incremental source read: strictly newer than the stored cursor. ----
	const prevState = await getMoneySyncState(db, sourceKey);
	const prevCursor =
		typeof prevState?.["cursor"] === "string" && prevState["cursor"] !== ""
			? String(prevState["cursor"])
			: null;
	const incremental = prevCursor !== null;

	const fetched = await fetchDonationPages(
		runSignupToken,
		raceId,
		pageSize,
		maxPages,
		prevCursor,
	);
	if (!fetched.ok) {
		return fail(fetched.error, fetched.failureInterpretation);
	}

	// --- Normalize ----------------------------------------------------------
	const { normalized, skippedNoIdentity, fetched: fetchedCount } = normalizeRecords(
		fetched.pages,
		raceId,
	);

	// --- Ingest (shared core) ------------------------------------------------
	const { statements, eventInsertIndexes, outcome } = await buildIngestBatch(db, normalized);

	// --- Checkpoint IN THE SAME BATCH: advances iff canonical state commits.
	// An incremental sync that finds nothing new keeps the previous cursor —
	// it is never nulled by an empty read.
	const nextCursor =
		outcome.maxDonationId > 0 ? String(outcome.maxDonationId) : prevCursor;
	const resultJson = JSON.stringify({
		incremental,
		prevCursor,
		fetched: fetchedCount,
		skippedNoIdentity,
		transactionsNew: outcome.transactionsNew,
		eventsAttempted: outcome.eventsAttempted,
		lifecycleEvents: outcome.lifecycleEvents,
		identityUpgrades: outcome.identityUpgrades,
	});
	statements.push(
		db
			.prepare(
				`INSERT INTO money_sync_state (source_key, cursor, last_sync_at, last_sync_result, last_error)
				 VALUES (?, ?, ?, ?, NULL)
				 ON CONFLICT(source_key) DO UPDATE SET
					cursor = excluded.cursor,
					last_sync_at = excluded.last_sync_at,
					last_sync_result = excluded.last_sync_result,
					last_error = NULL`,
			)
			.bind(sourceKey, nextCursor, nowIso, resultJson),
	);

	const eventsIngested = await executeBatch(db, statements, eventInsertIndexes);

	return {
		ok: true,
		sourceKey,
		incremental,
		fetched: fetchedCount,
		skippedNoIdentity,
		transactionsNew: outcome.transactionsNew,
		eventsIngested,
		eventsDuplicate: outcome.eventsAttempted - eventsIngested,
		lifecycleEvents: outcome.lifecycleEvents,
		identityUpgrades: outcome.identityUpgrades,
		cursor: nextCursor,
		lastSyncAt: nowIso,
	};
}

/**
 * Explicit, bounded reconciliation of already-canonicalized donations.
 * Re-reads ONLY the listed donation ids (lifecycle changes such as refunds
 * on old donations are invisible to incremental ingestion by design).
 * This is separate from normal ingestion: it never advances the sync
 * cursor and never widens its own scope.
 */
export async function reconcileRunSignupDonations(
	db: D1Database,
	runSignupToken: string,
	opts: { raceId?: number; donationIds: Array<number | string>; reason?: string },
): Promise<MoneyReconcileResult> {
	const raceId = opts?.raceId ?? RUNSIGNUP_DONATION_RACE_ID;
	const sourceKey = `runsignup:donations:race:${raceId}`;
	const nowIso = new Date().toISOString();

	const fail = (error: string, failureInterpretation?: string): MoneyReconcileResult => ({
		ok: false,
		sourceKey,
		requested: opts.donationIds.length,
		fetched: 0,
		transactionsNew: 0,
		eventsIngested: 0,
		lifecycleEvents: 0,
		identityUpgrades: [],
		perDonation: [],
		lastSyncAt: nowIso,
		error,
		failureInterpretation,
	});

	if (!runSignupToken) {
		return fail("RunSignup access token is not configured", "TOKEN_INVALID");
	}
	const ids = [...new Set(opts.donationIds.map(String))].filter((s) => /^\d+$/.test(s));
	if (ids.length === 0) {
		return fail("reconcile requires at least one numeric donation id", "INVALID_INPUT");
	}
	if (ids.length > RECONCILE_MAX_IDS) {
		return fail(
			`reconcile is bounded to ${RECONCILE_MAX_IDS} donation ids per call (got ${ids.length})`,
			"INVALID_INPUT",
		);
	}

	// One bounded read per id: after_donation_id={id-1}, first page, ASC —
	// the wanted record is the first row when it exists.
	const perDonation: Array<{ donationId: string; status: string }> = [];
	const records: Record<string, unknown>[] = [];
	for (const id of ids) {
		const url =
			`https://api.runsignup.com/rest/race/${raceId}/donations/list` +
			`?format=json&results_per_page=1&page=1&sort_direction=ASC` +
			`&after_donation_id=${encodeURIComponent(String(Number(id) - 1))}`;
		const result = await runSignupGetJson<unknown>(url, runSignupToken);
		if (!result.ok) {
			const interpretation = classifyRunSignupFailure(
				result.api_error_code,
				result.api_error_msg,
				result.http_status,
			);
			return fail(
				`RunSignup donations/list read failed (donation ${id}): ` +
					`http=${result.http_status ?? "?"} api_error=${result.api_error_code ?? "-"} ` +
					`${result.api_error_msg ?? ""}`.trim(),
				interpretation,
			);
		}
		const match = extractDonationRecords(result.data).find(
			(r) => String(r["donation_id"]) === id,
		);
		if (match) {
			records.push(match);
			perDonation.push({ donationId: id, status: "fetched" });
		} else {
			perDonation.push({ donationId: id, status: "not_found_at_source" });
		}
	}

	const { normalized, skippedNoIdentity } = normalizeRecords(
		[{ records }],
		raceId,
	);
	void skippedNoIdentity;

	const { statements, eventInsertIndexes, outcome } = await buildIngestBatch(db, normalized);
	// NOTE: no checkpoint write — reconciliation never advances the sync cursor.
	const eventsIngested = await executeBatch(db, statements, eventInsertIndexes);

	return {
		ok: true,
		sourceKey,
		requested: ids.length,
		fetched: records.length,
		transactionsNew: outcome.transactionsNew,
		eventsIngested,
		lifecycleEvents: outcome.lifecycleEvents,
		identityUpgrades: outcome.identityUpgrades,
		perDonation,
		lastSyncAt: nowIso,
	};
}

/**
 * Diagnostic: inspect the live shape of a single donation record.
 * Returns field names plus allowlisted non-PII scalar fields only — the
 * record's `user` object (donor PII) is never read, returned, or logged.
 * Explicit, bounded (one record), owner-gated; used to verify source field
 * names and identifier fields against the actual production payload.
 */
export async function inspectDonationRecordShape(
	runSignupToken: string,
	donationId: number | string,
	raceId: number = RUNSIGNUP_DONATION_RACE_ID,
): Promise<DonationRecordShape> {
	const id = String(donationId);
	const base: DonationRecordShape = {
		ok: false,
		donationId: id,
		fieldNames: [],
		identifiers: {
			donation_id: null,
			rsu_transaction_id: null,
			transaction_id: null,
			associated_registration_id: null,
			fundraiser_id: null,
		},
		amounts: { donation_amount: null, processing_fee: null, amount_paid: null },
		timestamps: { donation_date_ts: null, donation_date: null },
	};
	if (!runSignupToken) {
		return { ...base, error: "RunSignup access token is not configured" };
	}
	if (!/^\d+$/.test(id)) {
		return { ...base, error: "donation_id must be numeric" };
	}
	const url =
		`https://api.runsignup.com/rest/race/${raceId}/donations/list` +
		`?format=json&results_per_page=5&page=1&sort_direction=ASC` +
		`&after_donation_id=${encodeURIComponent(String(Number(id) - 1))}`;
	const result = await runSignupGetJson<unknown>(url, runSignupToken);
	if (!result.ok) {
		return {
			...base,
			error:
				`RunSignup donations/list read failed: http=${result.http_status ?? "?"} ` +
				`api_error=${result.api_error_code ?? "-"} ${result.api_error_msg ?? ""}`.trim(),
		};
	}
	const record = extractDonationRecords(result.data).find(
		(r) => String(r["donation_id"]) === id,
	);
	if (!record) {
		return { ...base, error: `donation ${id} not found at source` };
	}
	const scalar = (v: unknown) =>
		v === null || v === undefined || typeof v === "object" ? null : v;
	return {
		ok: true,
		donationId: id,
		fieldNames: Object.keys(record).sort(),
		identifiers: {
			donation_id: scalar(record["donation_id"]),
			rsu_transaction_id: scalar(record["rsu_transaction_id"]),
			transaction_id: scalar(record["transaction_id"]),
			associated_registration_id: scalar(record["associated_registration_id"]),
			fundraiser_id: scalar(record["fundraiser_id"]),
		},
		amounts: {
			donation_amount: scalar(record["donation_amount"]),
			processing_fee: scalar(record["processing_fee"]),
			amount_paid: scalar(record["amount_paid"]),
		},
		timestamps: {
			donation_date_ts: scalar(record["donation_date_ts"]),
			donation_date: scalar(record["donation_date"]),
		},
	};
}

/** Canonical read path (ADR-0044): downstream reads D1, never the source. */
export async function listMoneyEvents(
	db: D1Database,
	opts?: { eventType?: string; limit?: number },
): Promise<Record<string, unknown>[]> {
	const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
	let sql =
		`SELECT event_key, source_system, source_transaction_id, transaction_key, event_type,
				occurred_at, ingested_at, currency,
				gross_cents, gross_status, fee_cents, fee_status,
				amount_paid_cents, amount_paid_status,
				net_cents, net_status, refund_cents, refund_status,
				attribution, source_ref
		 FROM money_events`;
	const binds: unknown[] = [];
	if (opts?.eventType && isKnownEventType(opts.eventType)) {
		sql += ` WHERE event_type = ?`;
		binds.push(opts.eventType);
	}
	sql += ` ORDER BY occurred_at DESC, ingested_at DESC LIMIT ?`;
	binds.push(limit);
	const rows = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
	return rows.results ?? [];
}

/** Canonical read path (ADR-0044): current state per transaction from D1. */
export async function listMoneyTransactions(
	db: D1Database,
	opts?: { lifecycleState?: string; limit?: number },
): Promise<Record<string, unknown>[]> {
	const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 200);
	let sql =
		`SELECT transaction_key, source_system, source_transaction_id, first_event_key,
				currency, gross_cents, gross_status, fee_cents, fee_status,
				amount_paid_cents, amount_paid_status,
				net_cents, net_status, refund_cents, refund_status,
				lifecycle_state, attribution, source_ref, first_seen_at, updated_at
		 FROM money_transactions`;
	const binds: unknown[] = [];
	if (opts?.lifecycleState) {
		sql += ` WHERE lifecycle_state = ?`;
		binds.push(opts.lifecycleState);
	}
	sql += ` ORDER BY updated_at DESC LIMIT ?`;
	binds.push(limit);
	const rows = await db.prepare(sql).bind(...binds).all<Record<string, unknown>>();
	return rows.results ?? [];
}

/** Canonical read path (ADR-0044): sync checkpoints from D1. */
export async function getMoneySyncState(
	db: D1Database,
	sourceKey: string = MONEY_SYNC_SOURCE_KEY,
): Promise<Record<string, unknown> | null> {
	const row = await db
		.prepare(`SELECT source_key, cursor, last_sync_at, last_sync_result, last_error FROM money_sync_state WHERE source_key = ?`)
		.bind(sourceKey)
		.first<Record<string, unknown>>();
	return row ?? null;
}
