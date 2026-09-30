/**
 * Canonical monetary model — Revenue Engine v1, Phase 1.
 *
 * Source-agnostic by construction: every function is parameterized by
 * `source_system`. RunSignup is the first source adapter, not the architecture.
 *
 * Identity rules (deterministic, stable across repeated sync runs):
 * - transaction identity: `source_system + source_transaction_id`
 *   (transaction_key = `${source_system}:${source_transaction_id}`)
 * - event identity: `${source_system}:evt:${event_type}:${stable_source_ref}`
 *   where the source supplies no unique event id, the stable ref is derived
 *   from the source record's own stable identifiers and the normalized
 *   monetary snapshot hash — so the same source fact always maps to the same
 *   event_key, and INSERT OR IGNORE on that key makes ingestion idempotent.
 *
 * Money semantics: gross / fee / net / refund are tracked independently as
 * (cents, status) pairs. A status is VERIFIED only when the source supplied
 * the value; otherwise cents is NULL and status is UNKNOWN. Unknown amounts
 * never block ingestion of verified amounts, and derived values are never
 * silently presented as source truth.
 */

export const MONEY_EVENT_TYPES = [
	"donation_received",
	"registration_paid",
	"license_purchased",
	"license_renewed",
	"course_purchased",
	"fundraiser_created",
	"fundraiser_donation_received",
	"transaction_refunded",
	"transaction_partially_refunded",
	"transaction_reversed",
	"transaction_chargeback",
] as const;
export type MoneyEventType = (typeof MONEY_EVENT_TYPES)[number];

export const AMOUNT_VERIFIED = "VERIFIED" as const;
export const AMOUNT_UNKNOWN = "UNKNOWN" as const;
export type AmountStatus = typeof AMOUNT_VERIFIED | typeof AMOUNT_UNKNOWN;

export const ATTRIBUTION_UNKNOWN = "ATTRIBUTION_UNKNOWN";

export const LIFECYCLE_STATES = [
	"ACTIVE",
	"REFUNDED",
	"PARTIALLY_REFUNDED",
	"REVERSED",
	"CHARGEBACK",
] as const;
export type MoneyLifecycleState = (typeof LIFECYCLE_STATES)[number];

export interface MoneyAmounts {
	grossCents: number | null;
	grossStatus: AmountStatus;
	feeCents: number | null;
	feeStatus: AmountStatus;
	netCents: number | null;
	netStatus: AmountStatus;
	refundCents: number | null;
	refundStatus: AmountStatus;
}

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/** Canonical transaction identity: source_system + source_transaction_id. */
export function transactionKey(sourceSystem: string, sourceTransactionId: string): string {
	return `${sourceSystem}:${sourceTransactionId}`;
}

/** Idempotency key for the initial receipt of a source monetary record. */
export function receiptEventKey(
	sourceSystem: string,
	eventType: MoneyEventType,
	sourceTransactionId: string,
): string {
	return `${sourceSystem}:evt:${eventType}:${sourceTransactionId}`;
}

/**
 * Deterministic fallback event identity for lifecycle events where the
 * source provides no unique event id. `stateHash` is the hash of the
 * normalized monetary snapshot that triggered the event, so the same source
 * state always yields the same key across repeated sync runs.
 */
export function lifecycleEventKey(
	sourceSystem: string,
	eventType: MoneyEventType,
	sourceTransactionId: string,
	stateHash: string,
): string {
	return `${sourceSystem}:evt:${eventType}:${sourceTransactionId}:${stateHash}`;
}

// ---------------------------------------------------------------------------
// Deterministic hashing (sync; no crypto.subtle needed in the hot path)
// ---------------------------------------------------------------------------

/** cyrb53 — deterministic 53-bit hash, hex-encoded. Stable across runs. */
export function stableHash(input: string): string {
	let h1 = 0xdeadbeef ^ 0;
	let h2 = 0x41c6ce57 ^ 0;
	for (let i = 0; i < input.length; i++) {
		const ch = input.charCodeAt(i);
		h1 = Math.imul(h1 ^ ch, 2654435761);
		h2 = Math.imul(h2 ^ ch, 1597334677);
	}
	h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
	h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
	const hi = (h2 >>> 0).toString(16).padStart(8, "0");
	const lo = (h1 >>> 0).toString(16).padStart(8, "0");
	// 53 significant bits: drop the top 11 bits of the 64-bit concatenation.
	return (hi + lo).slice(3);
}

/** Stable hash of a normalized monetary snapshot for change detection. */
export function snapshotHash(parts: Record<string, unknown>): string {
	const keys = Object.keys(parts).sort();
	const canonical = keys.map((k) => `${k}=${JSON.stringify(parts[k] ?? null)}`).join("|");
	return stableHash(canonical);
}

// ---------------------------------------------------------------------------
// Amount normalization
// ---------------------------------------------------------------------------

/** Dollars (or dollar string) -> integer cents. Null when not a finite number. */
export function toCents(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const n = typeof value === "number" ? value : Number(String(value).replace(/[$,]/g, ""));
	if (!Number.isFinite(n)) return null;
	return Math.round(n * 100);
}

export function normalizeAmount(value: unknown): { cents: number | null; status: AmountStatus } {
	const cents = toCents(value);
	return cents === null
		? { cents: null, status: AMOUNT_UNKNOWN }
		: { cents, status: AMOUNT_VERIFIED };
}

// ---------------------------------------------------------------------------
// RunSignup donation normalization (first source adapter)
// ---------------------------------------------------------------------------

export const RUNSIGNUP_SOURCE_SYSTEM = "runsignup";
export const RUNSIGNUP_DONATION_RACE_ID = 212466;
export const MONEY_SYNC_SOURCE_KEY = `runsignup:donations:race:${RUNSIGNUP_DONATION_RACE_ID}`;

export interface NormalizedRunSignupDonation {
	sourceSystem: typeof RUNSIGNUP_SOURCE_SYSTEM;
	donationId: string;
	/** Canonical transaction id for a RunSignup donation: the donation record
	 *  itself is the stable monetary fact, so the transaction is keyed by it. */
	sourceTransactionId: string;
	transactionKey: string;
	eventKey: string;
	occurredAt: string | null;
	currency: string;
	amounts: MoneyAmounts;
	fundraiserId: string | null;
	fundraiserEventKey: string | null;
	sourceRef: string;
	/** Normalized snapshot used for lifecycle change detection. */
	snapshot: Record<string, unknown>;
	snapshotHash: string;
}

function pickFirst(record: Record<string, unknown>, ...keys: string[]): unknown {
	for (const k of keys) {
		const v = record[k];
		if (v !== null && v !== undefined && v !== "") return v;
	}
	return null;
}

function normalizeOccurredAt(value: unknown): string | null {
	if (value === null || value === undefined || value === "") return null;
	if (typeof value === "number" && Number.isFinite(value)) {
		const ms = value < 1e12 ? value * 1000 : value;
		const d = new Date(ms);
		return Number.isNaN(d.getTime()) ? null : d.toISOString();
	}
	const s = String(value).trim();
	if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}(:\d{2})?$/.test(s)) {
		// RunSignup datetime without zone: keep naive (no invented zone).
		return s.replace(" ", "T");
	}
	const d = new Date(s);
	return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Normalize one RunSignup donation record into canonical form.
 * Returns null when the record carries no stable donation identifier
 * (it cannot be given a stable identity, so it is skipped, not guessed).
 *
 * Field names are defensive: the production source currently holds zero
 * donations, so exact record field names are unverified and will be
 * confirmed against the first real donation. No PII is extracted.
 */
export function normalizeRunSignupDonation(
	record: Record<string, unknown>,
	raceId: number = RUNSIGNUP_DONATION_RACE_ID,
): NormalizedRunSignupDonation | null {
	const donationIdRaw = pickFirst(record, "donation_id", "donationId");
	if (donationIdRaw === null || donationIdRaw === undefined) return null;
	const donationId = String(donationIdRaw);

	const sourceTransactionId = `donation:${donationId}`;
	const occurredAt = normalizeOccurredAt(
		pickFirst(record, "donation_date", "donationDate", "donation_date_ts", "donationDateTs"),
	);
	const gross = normalizeAmount(pickFirst(record, "donation_amount", "donationAmount"));
	const fee = normalizeAmount(pickFirst(record, "processing_fee", "processingFee"));
	// net is VERIFIED only when the source states it; never derived silently.
	const net = normalizeAmount(pickFirst(record, "amount_paid", "amountPaid"));
	const refund = normalizeAmount(
		pickFirst(record, "refund_amount", "refundAmount", "refunded_amount", "refundedAmount"),
	);
	const currencyRaw = pickFirst(record, "currency");
	const currency =
		typeof currencyRaw === "string" && currencyRaw.trim() !== ""
			? currencyRaw.trim().toUpperCase()
			: "USD";
	const fundraiserRaw = pickFirst(record, "fundraiser_id", "fundraiserId");
	const fundraiserId =
		fundraiserRaw === null || fundraiserRaw === undefined ? null : String(fundraiserRaw);

	const amounts: MoneyAmounts = {
		grossCents: gross.cents,
		grossStatus: gross.status,
		feeCents: fee.cents,
		feeStatus: fee.status,
		netCents: net.cents,
		netStatus: net.status,
		refundCents: refund.cents,
		refundStatus: refund.status,
	};

	const snapshot: Record<string, unknown> = {
		donation_id: donationId,
		occurred_at: occurredAt,
		currency,
		gross_cents: amounts.grossCents,
		gross_status: amounts.grossStatus,
		fee_cents: amounts.feeCents,
		fee_status: amounts.feeStatus,
		net_cents: amounts.netCents,
		net_status: amounts.netStatus,
		refund_cents: amounts.refundCents,
		refund_status: amounts.refundStatus,
		fundraiser_id: fundraiserId,
	};

	return {
		sourceSystem: RUNSIGNUP_SOURCE_SYSTEM,
		donationId,
		sourceTransactionId,
		transactionKey: transactionKey(RUNSIGNUP_SOURCE_SYSTEM, sourceTransactionId),
		eventKey: receiptEventKey(RUNSIGNUP_SOURCE_SYSTEM, "donation_received", sourceTransactionId),
		occurredAt,
		currency,
		amounts,
		fundraiserId,
		fundraiserEventKey:
			fundraiserId === null
				? null
				: receiptEventKey(RUNSIGNUP_SOURCE_SYSTEM, "fundraiser_donation_received", sourceTransactionId),
		sourceRef: `race:${raceId}/donation:${donationId}`,
		snapshot,
		snapshotHash: snapshotHash(snapshot),
	};
}

/**
 * Derive the lifecycle event for a changed monetary snapshot, or null when
 * the change does not map to a known lifecycle transition.
 * Detection is field-driven: only transitions the source actually expresses
 * produce events; anything else is a snapshot update without an event.
 */
export function deriveLifecycleEvent(
	oldSnapshot: Record<string, unknown>,
	next: NormalizedRunSignupDonation,
): { eventType: MoneyEventType; lifecycleState: MoneyLifecycleState; refundCents: number | null } | null {
	const oldRefund = typeof oldSnapshot["refund_cents"] === "number" ? oldSnapshot["refund_cents"] : 0;
	const newRefund = next.amounts.refundCents ?? 0;
	const refundKnown = next.amounts.refundStatus === AMOUNT_VERIFIED;

	if (refundKnown && newRefund > oldRefund && newRefund > 0) {
		const gross = next.amounts.grossCents;
		const full = gross !== null && gross > 0 && newRefund >= gross;
		return {
			eventType: full ? "transaction_refunded" : "transaction_partially_refunded",
			lifecycleState: full ? "REFUNDED" : "PARTIALLY_REFUNDED",
			refundCents: newRefund,
		};
	}
	// Reversal / chargeback: the donations/list source exposes no fields for
	// these; the event types exist in the model and fire when a source
	// adapter can observe them. Not derivable here -> null.
	return null;
}
