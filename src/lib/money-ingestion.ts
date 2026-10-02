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
	normalizeRunSignupRegistration,
	RACE_EVENT_IDS,
	type NormalizedMoneyRecord,
	type NormalizedRunSignupDonation,
	RUNSIGNUP_DONATION_RACE_ID,
	RUNSIGNUP_SOURCE_SYSTEM,
} from "./money-model";

/**
 * Phase 4 — Fund attribution (owner decision 2026-09-30).
 *
 * All verified donation_received on race 212466 are automatically credited
 * to fund-50k-bridge-sprint. This is the REAL next automated revenue action:
 * updating the fund's financial state (raised_amount) from canonical money
 * truth.
 *
 * Design: fund_id is set on money_transactions at ingest. funds.raised_amount
 * is RECALCULATED (not incremented) as:
 *   SUM(gross_cents) - SUM(COALESCE(refund_cents, 0)) / 100.0
 * for all transactions attributed to the fund.
 *
 * This is idempotent: re-running after a sync retry yields the same total.
 * Refunds, partial refunds, reversals, and chargebacks automatically reduce
 * the total because they update refund_cents / lifecycle_state on the
 * canonical transaction.
 */
export const FUND_ID_BRIDGE_SPRINT = "fund-50k-bridge-sprint";
/** Maps RunSignup race ID → fund ID for automatic crediting. */
const RACE_TO_FUND_ID = new Map<number, string>([
	[RUNSIGNUP_DONATION_RACE_ID, FUND_ID_BRIDGE_SPRINT],
]);

/**
 * Recalculates funds.raised_amount from canonical money truth.
 * Idempotent: safe to call after any sync, retry, or lifecycle update.
 */
export async function recalculateFundRaised(
	db: D1Database,
	fundId: string,
): Promise<number> {
	const row = await db
		.prepare(
			`SELECT
				COALESCE(SUM(gross_cents), 0) AS total_gross,
				COALESCE(SUM(COALESCE(refund_cents, 0)), 0) AS total_refund
			 FROM money_transactions
			 WHERE fund_id = ?`,
		)
		.bind(fundId)
		.first<{ total_gross: number; total_refund: number }>();
	const raisedDollars = ((row?.total_gross ?? 0) - (row?.total_refund ?? 0)) / 100.0;
	await db
		.prepare(
			`UPDATE funds SET raised_amount = ?, updated_at = datetime('now') WHERE id = ?`,
		)
		.bind(raisedDollars, fundId)
		.run();
	return raisedDollars;
}

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
	/** Fund ID if new transactions were credited to a fund (Phase 4). */
	fundCredited?: string | null;
	/** Recalculated fund raised_amount in dollars (Phase 4). */
	fundRaised?: number | null;
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
	/** Recalculated fund raised_amount in dollars after lifecycle updates (Phase 4). */
	fundRaised?: number | null;
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
	normalizer: (record: Record<string, unknown>, raceId: number) => NormalizedMoneyRecord | null,
	filter?: (n: NormalizedMoneyRecord) => boolean,
): { normalized: NormalizedMoneyRecord[]; skippedNoIdentity: number; skippedFiltered: number; fetched: number } {
	const normalized: NormalizedMoneyRecord[] = [];
	let skippedNoIdentity = 0;
	let skippedFiltered = 0;
	let fetched = 0;
	for (const p of pages) {
		for (const r of p.records) {
			fetched++;
			const n = normalizer(r, raceId);
			if (!n) {
				skippedNoIdentity++;
				continue;
			}
			if (filter && !filter(n)) {
				skippedFiltered++;
				continue;
			}
			normalized.push(n);
		}
	}
	return { normalized, skippedNoIdentity, skippedFiltered, fetched };
}

/** Only paid registrations are monetary (amount_paid > 0). */
function isPaidRegistration(n: NormalizedMoneyRecord): boolean {
	return (n.amounts.amountPaidCents ?? 0) > 0;
}

interface IngestOutcome {
	transactionsNew: number;
	eventsAttempted: number;
	eventsIngested: number;
	lifecycleEvents: number;
	identityUpgrades: Array<{ from: string; to: string }>;
	maxRecordId: number;
}

/**
 * Shared ingestion core: normalized monetary records -> canonical D1 writes,
 * in one atomic batch. Used by incremental syncs, explicit reconciliation,
 * and historical backfills across all source kinds (donations, registrations).
 * Returns the statements (without the checkpoint) plus the outcome stats.
 */
async function buildIngestBatch(
	db: D1Database,
	normalized: NormalizedMoneyRecord[],
	opts?: { fundId?: string | null },
): Promise<{
	statements: D1PreparedStatement[];
	eventInsertIndexes: number[];
	outcome: IngestOutcome;
	fundCredited: boolean;
}> {
	const statements: D1PreparedStatement[] = [];
	const eventInsertIndexes: number[] = [];
	const outcome: IngestOutcome = {
		transactionsNew: 0,
		eventsAttempted: 0,
		eventsIngested: 0,
		lifecycleEvents: 0,
		identityUpgrades: [],
		maxRecordId: 0,
	};
	// True if at least one NEW transaction was attributed to a fund.
	let fundCredited = false;
	const fundId = opts?.fundId ?? null;

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
		n: NormalizedMoneyRecord,
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
		if (n.numericId > outcome.maxRecordId) {
			outcome.maxRecordId = n.numericId;
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
			// Phase 4 fund attribution: credit to the fund if this race maps to one.
			// The fund_id is set here; the funds.raised_amount is recalculated
			// (not incremented) after the batch commits, ensuring idempotency.
			if (fundId) fundCredited = true;
			statements.push(
				db
					.prepare(
						`INSERT INTO money_transactions (
							transaction_key, source_system, source_transaction_id, first_event_key,
							currency, gross_cents, gross_status, fee_cents, fee_status,
							amount_paid_cents, amount_paid_status,
							net_cents, net_status, refund_cents, refund_status,
							lifecycle_state, attribution, source_ref, source_payload_hash,
							fund_id
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?)`,
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
						fundId,
					),
			);
			insertEvent(n.eventKey, n.eventType, n);
			if (n.secondaryEventKey && n.secondaryEventType) {
				insertEvent(n.secondaryEventKey, n.secondaryEventType, n);
			}
			// Phase 4: post-donation automated action. A newly ingested
			// donation on the Phase 4 funnel object automatically records
			// the next revenue action in the canonical Revenue Inventory.
			// Append-only: one action record per donation; the object's
			// next_revenue_action points at the latest donation.
			// Donations only — registrations and other kinds never trigger it.
			if (n.eventType === "donation_received") {
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
						`Donation ${n.recordId} ingested: gross ${n.amounts.grossCents}¢ ${n.amounts.grossStatus}, fee ${n.amounts.feeCents}¢ ${n.amounts.feeStatus}, amount_paid ${n.amounts.amountPaidCents}¢ ${n.amounts.amountPaidStatus}, net ${n.amounts.netStatus}. Attribution: ${ATTRIBUTION_UNKNOWN}.`,
					),
			);
			}
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
				n.recordRef,
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

	return { statements, eventInsertIndexes, outcome, fundCredited };
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
	// A completed historical backfill seeds the cursor (handoff, not merge):
	// the backfill never writes the incremental cursor itself.
	const prevState = await getMoneySyncState(db, sourceKey);
	const prevCursor =
		typeof prevState?.["cursor"] === "string" && prevState["cursor"] !== ""
			? String(prevState["cursor"])
			: null;
	let effectiveCursor = prevCursor;
	if (!effectiveCursor) {
		effectiveCursor = await seedCursorFromBackfill(db, sourceKey);
	}
	const incremental = effectiveCursor !== null;

	const fetched = await fetchDonationPages(
		runSignupToken,
		raceId,
		pageSize,
		maxPages,
		effectiveCursor,
	);
	if (!fetched.ok) {
		return fail(fetched.error, fetched.failureInterpretation);
	}

	// --- Normalize ----------------------------------------------------------
	const { normalized, skippedNoIdentity, fetched: fetchedCount } = normalizeRecords(
		fetched.pages,
		raceId,
		normalizeRunSignupDonation,
	);

	// --- Ingest (shared core) ------------------------------------------------
	// Phase 4 fund attribution: race 212466 donations are credited to
	// fund-50k-bridge-sprint (owner decision 2026-09-30).
	const fundId = RACE_TO_FUND_ID.get(raceId) ?? null;
	const { statements, eventInsertIndexes, outcome, fundCredited } =
		await buildIngestBatch(db, normalized, { fundId });

	// --- Checkpoint IN THE SAME BATCH: advances iff canonical state commits.
	// An incremental sync that finds nothing new keeps the previous cursor —
	// it is never nulled by an empty read.
	const nextCursor =
		outcome.maxRecordId > 0 ? String(outcome.maxRecordId) : prevCursor;
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

	// Phase 4: real next automated revenue action. The fund projection is
	// recalculated from canonical D1 truth on EVERY sync completion for a
	// fund-mapped race, including invocations with no new donation. This
	// makes the projection self-healing: if a recalculation fails after
	// the canonical state commits, the next invocation repairs it from
	// the committed truth. Idempotent: safe on retry.
	let fundRaised: number | null = null;
	if (fundId) {
		fundRaised = await recalculateFundRaised(db, fundId);
	}

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
		fundCredited: fundCredited ? fundId : null,
		fundRaised,
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
		normalizeRunSignupDonation,
	);
	void skippedNoIdentity;

	// Phase 4 fund attribution: same fund mapping as normal sync.
	const fundId = RACE_TO_FUND_ID.get(raceId) ?? null;
	const { statements, eventInsertIndexes, outcome, fundCredited } =
		await buildIngestBatch(db, normalized, { fundId });
	// NOTE: no checkpoint write — reconciliation never advances the sync cursor.
	const eventsIngested = await executeBatch(db, statements, eventInsertIndexes);

	// Phase 4: recalculate fund total from canonical D1 truth on EVERY
	// reconcile completion for a fund-mapped race, including invocations
	// with no new lifecycle event. This makes the projection self-healing:
	// if a recalculation fails after canonical state commits, the next
	// invocation repairs it. Idempotent.
	let fundRaised: number | null = null;
	if (fundId) {
		fundRaised = await recalculateFundRaised(db, fundId);
	}

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
		fundRaised,
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

// ---------------------------------------------------------------------------
// Multi-source monetary coverage: paid race registrations (RunSignup).
//
// Source: GET /rest/race/{race_id}/participants (documented; requires
// event_id). Incremental cursor: after_registration_id (documented).
// Only PAID registrations (amount_paid > 0) are monetary and ingested.
// No fund attribution: the owner decision covers race 212466 donations only.
// ---------------------------------------------------------------------------

const REGISTRATIONS_PAGE_SIZE = 100;
const REGISTRATIONS_MAX_PAGES = 25;

export function registrationsSourceKey(raceId: number): string {
	return `runsignup:registrations:race:${raceId}`;
}

export function donationsSourceKey(raceId: number): string {
	return `runsignup:donations:race:${raceId}`;
}

function registrationsUrl(
	raceId: number,
	eventIds: number[],
	page: number,
	pageSize: number,
	afterRegistrationId?: string | null,
): string {
	let url =
		`https://api.runsignup.com/rest/race/${raceId}/participants` +
		`?format=json&results_per_page=${pageSize}&page=${page}&sort=registration_id%20ASC` +
		`&include_memberships=T&event_id=${encodeURIComponent(eventIds.join(","))}`;
	if (afterRegistrationId) url += `&after_registration_id=${encodeURIComponent(afterRegistrationId)}`;
	return url;
}

/** Flatten the participants response (top-level array of per-event wrappers). */
function extractParticipantRecords(data: unknown): Record<string, unknown>[] {
	const out: Record<string, unknown>[] = [];
	const arr = Array.isArray(data) ? data : [data];
	for (const el of arr) {
		if (!el || typeof el !== "object" || Array.isArray(el)) continue;
		const d = el as Record<string, unknown>;
		const direct = d["participants"];
		if (Array.isArray(direct)) out.push(...(direct as Record<string, unknown>[]));
		const ev = d["event"];
		if (ev && typeof ev === "object" && !Array.isArray(ev)) {
			const nested = (ev as Record<string, unknown>)["participants"];
			if (Array.isArray(nested)) out.push(...(nested as Record<string, unknown>[]));
		}
	}
	return out;
}

async function fetchRegistrationPages(
	runSignupToken: string,
	raceId: number,
	eventIds: number[],
	pageSize: number,
	maxPages: number,
	afterRegistrationId: string | null,
): Promise<{ ok: true; pages: FetchPage[] } | { ok: false; error: string; failureInterpretation: string }> {
	const pages: FetchPage[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const result = await runSignupGetJson<unknown>(
			registrationsUrl(raceId, eventIds, page, pageSize, afterRegistrationId),
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
					`RunSignup participants read failed (race ${raceId} page ${page}): ` +
					`http=${result.http_status ?? "?"} api_error=${result.api_error_code ?? "-"} ` +
					`${result.api_error_msg ?? ""}`.trim(),
				failureInterpretation: interpretation,
			};
		}
		const records = extractParticipantRecords(result.data);
		pages.push({ records });
		if (records.length < pageSize) break; // last page
	}
	return { ok: true, pages };
}

/** Seed an incremental cursor from a completed backfill (handoff, not merge). */
async function seedCursorFromBackfill(
	db: D1Database,
	sourceKey: string,
): Promise<string | null> {
	const bf = await getMoneySyncState(db, `${sourceKey}:backfill`);
	if (!bf) return null;
	try {
		const parsed = JSON.parse(String(bf["last_sync_result"] ?? "{}")) as Record<string, unknown>;
		if (parsed["status"] === "complete" && parsed["max_id"] !== undefined) {
			return String(parsed["max_id"]);
		}
	} catch {
		// malformed backfill state: do not seed
	}
	return null;
}

/**
 * Incremental registration sync: strictly newer than the stored cursor via
 * the documented after_registration_id filter. Checkpoint advances in the
 * same atomic batch as the ingested events. Explicit owner trigger only.
 */
export async function syncRunSignupRegistrations(
	db: D1Database,
	runSignupToken: string,
	opts: { raceId: number; eventIds?: number[]; pageSize?: number; maxPages?: number },
): Promise<MoneySyncResult> {
	const raceId = opts.raceId;
	const eventIds = opts.eventIds ?? RACE_EVENT_IDS[raceId] ?? [];
	const pageSize = opts.pageSize ?? REGISTRATIONS_PAGE_SIZE;
	const maxPages = opts.maxPages ?? REGISTRATIONS_MAX_PAGES;
	const sourceKey = registrationsSourceKey(raceId);
	const nowIso = new Date().toISOString();

	const fail = async (error: string, failureInterpretation?: string): Promise<MoneySyncResult> => {
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
			ok: false, sourceKey, incremental: false, fetched: 0,
			skippedNoIdentity: 0, transactionsNew: 0, eventsIngested: 0,
			eventsDuplicate: 0, lifecycleEvents: 0, identityUpgrades: [],
			cursor: null, lastSyncAt: nowIso, error, failureInterpretation,
		};
	};

	if (!runSignupToken) return fail("RunSignup access token is not configured", "TOKEN_INVALID");
	if (!Number.isInteger(raceId) || raceId <= 0) return fail(`invalid raceId: ${raceId}`, "INVALID_INPUT");
	if (eventIds.length === 0) return fail(`no event IDs known for race ${raceId}`, "INVALID_INPUT");

	const prevState = await getMoneySyncState(db, sourceKey);
	const prevCursor =
		typeof prevState?.["cursor"] === "string" && prevState["cursor"] !== ""
			? String(prevState["cursor"])
			: null;
	let effectiveCursor = prevCursor;
	let seeded = false;
	if (!effectiveCursor) {
		const seededCursor = await seedCursorFromBackfill(db, sourceKey);
		if (seededCursor) {
			effectiveCursor = seededCursor;
			seeded = true;
		}
	}
	const incremental = effectiveCursor !== null;

	const fetched = await fetchRegistrationPages(
		runSignupToken, raceId, eventIds, pageSize, maxPages, effectiveCursor,
	);
	if (!fetched.ok) return fail(fetched.error, fetched.failureInterpretation);

	const { normalized, skippedNoIdentity, skippedFiltered, fetched: fetchedCount } =
		normalizeRecords(fetched.pages, raceId, normalizeRunSignupRegistration, isPaidRegistration);

	const { statements, eventInsertIndexes, outcome } = await buildIngestBatch(db, normalized, {});

	const nextCursor =
		outcome.maxRecordId > 0 ? String(outcome.maxRecordId) : effectiveCursor;
	const resultJson = JSON.stringify({
		incremental, seededFromBackfill: seeded, prevCursor,
		fetched: fetchedCount, skippedNoIdentity, skippedFree: skippedFiltered,
		transactionsNew: outcome.transactionsNew,
		eventsAttempted: outcome.eventsAttempted,
		lifecycleEvents: outcome.lifecycleEvents,
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
		ok: true, sourceKey, incremental, fetched: fetchedCount,
		skippedNoIdentity, transactionsNew: outcome.transactionsNew,
		eventsIngested, eventsDuplicate: outcome.eventsAttempted - eventsIngested,
		lifecycleEvents: outcome.lifecycleEvents, identityUpgrades: outcome.identityUpgrades,
		cursor: nextCursor, lastSyncAt: nowIso,
	};
}

// ---------------------------------------------------------------------------
// Historical backfill: controlled, resumable, separate from incremental
// cursors. Pages full history (bounded), ingests idempotently, tracks
// progress under {sourceKey}:backfill. Never writes the incremental cursor;
// the incremental sync seeds from a COMPLETED backfill only.
// ---------------------------------------------------------------------------

export interface MoneyBackfillResult {
	ok: boolean;
	sourceKey: string;
	backfillKey: string;
	kind: "donations" | "registrations";
	raceId: number;
	pagesDone: number;
	fetched: number;
	transactionsNew: number;
	eventsIngested: number;
	eventsDuplicate: number;
	/** Source-side totals observed during this backfill (for verification). */
	sourceCount: number;
	sourceGrossCents: number;
	maxId: number;
	complete: boolean;
	lastSyncAt: string;
	error?: string;
	failureInterpretation?: string;
}

const BACKFILL_PAGE_SIZE = 100;
const BACKFILL_MAX_PAGES = 25;

async function runBackfill(
	db: D1Database,
	runSignupToken: string,
	kind: "donations" | "registrations",
	raceId: number,
	eventIds: number[],
	opts?: { pageSize?: number; maxPages?: number },
): Promise<MoneyBackfillResult> {
	const pageSize = opts?.pageSize ?? BACKFILL_PAGE_SIZE;
	const maxPages = opts?.maxPages ?? BACKFILL_MAX_PAGES;
	const sourceKey = kind === "donations" ? donationsSourceKey(raceId) : registrationsSourceKey(raceId);
	const backfillKey = `${sourceKey}:backfill`;
	const nowIso = new Date().toISOString();

	const fail = (error: string, failureInterpretation?: string): MoneyBackfillResult => ({
		ok: false, sourceKey, backfillKey, kind, raceId,
		pagesDone: 0, fetched: 0, transactionsNew: 0, eventsIngested: 0,
		eventsDuplicate: 0, sourceCount: 0, sourceGrossCents: 0, maxId: 0,
		complete: false, lastSyncAt: nowIso, error, failureInterpretation,
	});

	if (!runSignupToken) return fail("RunSignup access token is not configured", "TOKEN_INVALID");
	if (!Number.isInteger(raceId) || raceId <= 0) return fail(`invalid raceId: ${raceId}`, "INVALID_INPUT");
	if (kind === "registrations" && eventIds.length === 0) {
		return fail(`no event IDs known for race ${raceId}`, "INVALID_INPUT");
	}

	// Resume from previous backfill progress, if any.
	const prevBf = await getMoneySyncState(db, backfillKey);
	let resumeCursor: string | null = null;
	let pagesDone = 0;
	let sourceCount = 0;
	let sourceGrossCents = 0;
	let maxId = 0;
	if (prevBf) {
		try {
			const parsed = JSON.parse(String(prevBf["last_sync_result"] ?? "{}")) as Record<string, unknown>;
			if (parsed["status"] === "complete") {
				return {
					ok: true, sourceKey, backfillKey, kind, raceId,
					pagesDone: Number(parsed["pages_done"] ?? 0),
					fetched: Number(parsed["source_count"] ?? 0),
					transactionsNew: 0, eventsIngested: 0, eventsDuplicate: 0,
					sourceCount: Number(parsed["source_count"] ?? 0),
					sourceGrossCents: Number(parsed["source_gross_cents"] ?? 0),
					maxId: Number(parsed["max_id"] ?? 0),
					complete: true, lastSyncAt: nowIso,
				};
			}
			resumeCursor = typeof prevBf["cursor"] === "string" ? prevBf["cursor"] : null;
			pagesDone = Number(parsed["pages_done"] ?? 0);
			sourceCount = Number(parsed["source_count"] ?? 0);
			sourceGrossCents = Number(parsed["source_gross_cents"] ?? 0);
			maxId = Number(parsed["max_id"] ?? 0);
		} catch {
			// malformed: start over
		}
	}

	const normalizer = kind === "donations" ? normalizeRunSignupDonation : normalizeRunSignupRegistration;
	const filter = kind === "donations" ? undefined : isPaidRegistration;
	let fetched: { ok: true; pages: FetchPage[] } | { ok: false; error: string; failureInterpretation: string };
	if (kind === "donations") {
		fetched = await fetchDonationPages(runSignupToken, raceId, pageSize, maxPages, resumeCursor);
	} else {
		fetched = await fetchRegistrationPages(runSignupToken, raceId, eventIds, pageSize, maxPages, resumeCursor);
	}
	if (!fetched.ok) return fail(fetched.error, fetched.failureInterpretation);

	const { normalized, fetched: fetchedCount } = normalizeRecords(fetched.pages, raceId, normalizer, filter);

	// Source-side totals for verification (single read, no redundant re-read).
	let windowCount = 0;
	let windowGross = 0;
	for (const n of normalized) {
		windowCount++;
		windowGross += n.amounts.grossCents ?? 0;
		if (n.numericId > maxId) maxId = n.numericId;
	}
	sourceCount += windowCount;
	sourceGrossCents += windowGross;
	pagesDone += fetched.pages.length;

	// Fund attribution only for the owner-decided race (donations).
	const fundId = kind === "donations" ? (RACE_TO_FUND_ID.get(raceId) ?? null) : null;
	const { statements, eventInsertIndexes, outcome } = await buildIngestBatch(db, normalized, { fundId });

	// A window is complete when the source returned fewer than a full page.
	const lastPage = fetched.pages[fetched.pages.length - 1];
	const complete = !lastPage || lastPage.records.length < pageSize;
	const backfillCursor = String(maxId);

	const resultJson = JSON.stringify({
		status: complete ? "complete" : "in_progress",
		kind, race_id: raceId,
		pages_done: pagesDone,
		source_count: sourceCount,
		source_gross_cents: sourceGrossCents,
		max_id: maxId,
		completed_at: complete ? nowIso : null,
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
			.bind(backfillKey, backfillCursor, nowIso, resultJson),
	);

	const eventsIngested = await executeBatch(db, statements, eventInsertIndexes);

	if (fundId) await recalculateFundRaised(db, fundId);

	return {
		ok: true, sourceKey, backfillKey, kind, raceId,
		pagesDone, fetched: fetchedCount,
		transactionsNew: outcome.transactionsNew,
		eventsIngested,
		eventsDuplicate: outcome.eventsAttempted - eventsIngested,
		sourceCount, sourceGrossCents, maxId,
		complete, lastSyncAt: nowIso,
	};
}

/** Controlled historical backfill for race donations (all races). */
export async function backfillRunSignupDonations(
	db: D1Database,
	runSignupToken: string,
	opts: { raceId: number; pageSize?: number; maxPages?: number },
): Promise<MoneyBackfillResult> {
	return runBackfill(db, runSignupToken, "donations", opts.raceId, [], opts);
}

/** Controlled historical backfill for paid race registrations. */
export async function backfillRunSignupRegistrations(
	db: D1Database,
	runSignupToken: string,
	opts: { raceId: number; eventIds?: number[]; pageSize?: number; maxPages?: number },
): Promise<MoneyBackfillResult> {
	const raceId = opts.raceId;
	const eventIds = opts.eventIds ?? RACE_EVENT_IDS[raceId] ?? [];
	return runBackfill(db, runSignupToken, "registrations", raceId, eventIds, opts);
}
