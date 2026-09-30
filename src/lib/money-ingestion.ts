/**
 * Phase 1 Money Ingestion — Revenue Engine v1.
 *
 * RunSignup monetary source -> canonical Engine/D1 monetary truth.
 *
 * Source-boundary rules (ADR-0044):
 * - The source is read exactly once per sync. Every downstream consumer reads
 *   D1 (money_events / money_transactions) and never re-reads RunSignup to
 *   reconfirm already-ingested monetary truth.
 * - No generic retry loop: a failed sync records the classified failure in
 *   money_sync_state and stops. Re-invocation is an explicit owner/Engine
 *   action, and idempotent ingestion makes it safe.
 * - Trigger rule (OPERATING_PLAN): no recurring-schedule polling of the
 *   source. Sync starts from an owner action in the operating center
 *   (POST /api/operating-center/money/sync) or an explicit Engine-internal
 *   action — never a cron "checking for changes".
 *
 * Correctness rules:
 * - Idempotent ingestion: every event carries a deterministic event_key
 *   (see money-model.ts); writes use INSERT OR IGNORE, so repeated syncs,
 *   retries and re-reads of unchanged source data create zero duplicates.
 * - Cursor/checkpoint advances if and only if the canonical monetary state
 *   was durably committed: the sync-state upsert rides in the SAME D1 batch
 *   as the event/transaction writes (atomic all-or-nothing).
 * - Lifecycle: on re-read, the normalized snapshot hash is compared with the
 *   stored canonical snapshot. A changed snapshot derives a lifecycle event
 *   (refund / partial refund) with a deterministic fallback key; reversal and
 *   chargeback types exist in the model and fire when a source adapter can
 *   observe them (the donations/list source currently exposes no such fields).
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

const DONATIONS_PAGE_SIZE = 100;
const DONATIONS_MAX_PAGES = 20; // hard bound: 2,000 records per sync max

export interface MoneySyncResult {
	ok: boolean;
	sourceKey: string;
	fetched: number;
	skippedNoIdentity: number;
	transactionsNew: number;
	eventsIngested: number;
	eventsDuplicate: number;
	lifecycleEvents: number;
	cursor: string | null;
	lastSyncAt: string;
	error?: string;
	failureInterpretation?: string;
}

interface StoredTransaction {
	transaction_key: string;
	source_payload_hash: string | null;
	lifecycle_state: string;
	refund_cents: number | null;
	refund_status: string | null;
}

function donationsListUrl(raceId: number, page: number, pageSize: number): string {
	return (
		`https://api.runsignup.com/rest/race/${raceId}/donations/list` +
		`?format=json&results_per_page=${pageSize}&page=${page}`
	);
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

/**
 * Read the RunSignup donation source once and ingest it into canonical D1
 * monetary state. Safe to re-run: unchanged source data yields zero new
 * canonical events.
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
			fetched: 0,
			skippedNoIdentity: 0,
			transactionsNew: 0,
			eventsIngested: 0,
			eventsDuplicate: 0,
			lifecycleEvents: 0,
			cursor: null,
			lastSyncAt: nowIso,
			error,
			failureInterpretation,
		};
	};

	if (!runSignupToken) {
		return fail("RunSignup access token is not configured", "TOKEN_INVALID");
	}

	// --- Source boundary: read once, paginated, bounded. -------------------
	const records: Record<string, unknown>[] = [];
	for (let page = 1; page <= maxPages; page++) {
		const result = await runSignupGetJson<unknown>(donationsListUrl(raceId, page, pageSize), runSignupToken);
		if (!result.ok) {
			const interpretation = classifyRunSignupFailure(
				result.api_error_code,
				result.api_error_msg,
				result.http_status,
			);
			return fail(
				`RunSignup donations/list read failed (page ${page}): ` +
					`http=${result.http_status ?? "?"} api_error=${result.api_error_code ?? "-"} ` +
					`${result.api_error_msg ?? ""}`.trim(),
				interpretation,
			);
		}
		const pageRecords = extractDonationRecords(result.data);
		records.push(...pageRecords);
		if (pageRecords.length < pageSize) break; // last page
	}

	// --- Normalize ----------------------------------------------------------
	const normalized: NormalizedRunSignupDonation[] = [];
	let skippedNoIdentity = 0;
	for (const r of records) {
		const n = normalizeRunSignupDonation(r, raceId);
		if (!n) {
			skippedNoIdentity++;
			continue;
		}
		normalized.push(n);
	}

	// --- Load existing canonical state for change detection ------------------
	const existing = new Map<string, StoredTransaction>();
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
	}

	// --- Build the atomic write batch ---------------------------------------
	const statements: D1PreparedStatement[] = [];
	let transactionsNew = 0;
	let lifecycleEvents = 0;
	let eventsAttempted = 0;
	const eventInsertIndexes: number[] = [];
	let maxDonationId = 0;

	const insertEvent = (
		eventKey: string,
		eventType: MoneyEventType,
		n: NormalizedRunSignupDonation,
		amountOverrides?: { refundCents: number | null },
	) => {
		if (!isKnownEventType(eventType)) return; // defense in depth for the CHECK
		eventInsertIndexes.push(statements.length);
		eventsAttempted++;
		statements.push(
			db
				.prepare(
					`INSERT OR IGNORE INTO money_events (
						event_key, source_system, source_transaction_id, transaction_key,
						event_type, occurred_at, currency,
						gross_cents, gross_status, fee_cents, fee_status,
						net_cents, net_status, refund_cents, refund_status,
						attribution, source_ref, source_payload_hash
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
		if (Number.isFinite(numericId) && numericId > maxDonationId) maxDonationId = numericId;
		const prev = existing.get(n.transactionKey);

		if (!prev) {
			// New canonical transaction: current-state row + receipt event(s).
			transactionsNew++;
			statements.push(
				db
					.prepare(
						`INSERT INTO money_transactions (
							transaction_key, source_system, source_transaction_id, first_event_key,
							currency, gross_cents, gross_status, fee_cents, fee_status,
							net_cents, net_status, refund_cents, refund_status,
							lifecycle_state, attribution, source_ref, source_payload_hash
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`,
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
			continue;
		}

		if (prev.source_payload_hash === n.snapshotHash) continue; // unchanged: no-op

		// Changed snapshot: derive a lifecycle event when the change maps to
		// one; otherwise update the stored snapshot without an event.
		const oldSnapshot = { refund_cents: prev.refund_cents ?? 0 };
		const lifecycle = deriveLifecycleEvent(oldSnapshot, n);
		if (lifecycle) {
			lifecycleEvents++;
			const key = lifecycleEventKey(
				n.sourceSystem,
				lifecycle.eventType,
				n.sourceTransactionId,
				n.snapshotHash,
			);
			insertEvent(key, lifecycle.eventType, n, { refundCents: lifecycle.refundCents });
		}
		statements.push(
			db
				.prepare(
					`UPDATE money_transactions SET
						currency = ?, gross_cents = ?, gross_status = ?,
						fee_cents = ?, fee_status = ?, net_cents = ?, net_status = ?,
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

	// --- Checkpoint IN THE SAME BATCH: advances iff canonical state commits.
	const cursor = maxDonationId > 0 ? String(maxDonationId) : null;
	const resultJson = JSON.stringify({
		fetched: records.length,
		skippedNoIdentity,
		transactionsNew,
		eventsAttempted,
		lifecycleEvents,
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
			.bind(sourceKey, cursor, nowIso, resultJson),
	);

	const batchResults = await db.batch(statements);
	let eventsIngested = 0;
	for (const i of eventInsertIndexes) {
		eventsIngested += batchResults[i]?.meta?.changes ?? 0;
	}

	return {
		ok: true,
		sourceKey,
		fetched: records.length,
		skippedNoIdentity,
		transactionsNew,
		eventsIngested,
		eventsDuplicate: eventsAttempted - eventsIngested,
		lifecycleEvents,
		cursor,
		lastSyncAt: nowIso,
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
