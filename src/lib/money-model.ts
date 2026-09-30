/**
 * Canonical monetary model — Revenue Engine v1, Phase 1.
 *
 * Source-agnostic by construction: every function is parameterized by
 * `source_system`. RunSignup is the first source adapter, not the architecture.
 *
 * Identity rules (deterministic, stable across repeated sync runs):
 * - transaction identity: `source_system + source_transaction_id`, where the
 *   source_transaction_id is the source's true transaction identifier when
 *   the payload provides one (for RunSignup donations: `rsu_transaction_id`,
 *   falling back to `transaction_id`), and only otherwise the deterministic
 *   `donation:{donation_id}` fallback.
 *   (transaction_key = `${source_system}:${source_transaction_id}`)
 * - event identity: `${source_system}:evt:${event_type}:donation:${donation_id}`.
 *   The donation record is the stable monetary fact, so event keys stay
 *   donation-record based even when the transaction identity uses the true
 *   source transaction id. Where the source supplies no unique event id, the
 *   stable ref is derived from the source record's own stable identifiers and
 *   the normalized monetary snapshot hash — so the same source fact always
 *   maps to the same event_key, and INSERT OR IGNORE on that key makes
 *   ingestion idempotent.
 *
 * Money semantics: gross / fee / amount_paid / net / refund are tracked
 * independently as (cents, status) pairs. A status is VERIFIED only when the
 * source supplied the value; otherwise cents is NULL and status is UNKNOWN.
 * Unknown amounts never block ingestion of verified amounts, and derived
 * values are never silently presented as source truth.
 *
 * CRITICAL: `amount_paid` (RunSignup) is the total charged to the donor. It
 * is NOT net revenue retained by NWANA. It is preserved verbatim in the
 * correctly named `amount_paid_cents` field. `net_cents` means verified
 * settlement / net-retained cash and stays NULL / UNKNOWN until a source
 * provides verified settlement truth. Never derive it, never relabel
 * amount_paid as net.
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
	/**
	 * Total charged to the donor, exactly as the source stated it
	 * (RunSignup `amount_paid`). This is NOT net revenue retained by NWANA.
	 */
	amountPaidCents: number | null;
	amountPaidStatus: AmountStatus;
	/**
	 * Verified settlement / net-retained cash. NULL + UNKNOWN until a source
	 * provides verified settlement truth. Never derived from amount_paid.
	 */
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

export type DonationIdentitySource =
	| "rsu_transaction_id"
	| "transaction_id"
	| "donation_id_fallback";

export interface NormalizedRunSignupDonation {
	sourceSystem: typeof RUNSIGNUP_SOURCE_SYSTEM;
	donationId: string;
	/**
	 * Canonical transaction id. The source's true transaction identifier when
	 * the payload provides one (`rsu_transaction:{id}`, else
	 * `transaction:{id}`); the deterministic `donation:{donation_id}`
	 * fallback only when the payload carries no transaction identifier.
	 */
	sourceTransactionId: string;
	/** Which source field supplied the transaction identity (verified fact). */
	identitySource: DonationIdentitySource;
	transactionKey: string;
	/**
	 * Donation-record based event identity. Stays `donation:{donation_id}`
	 * even when the transaction identity uses the true source transaction
	 * id, so event keys (the idempotency proof) never move.
	 */
	donationRef: string;
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
 * Verified production field names (race 212466, real donation 11291415,
 * 2026-09-30): donation_id, donation_date_ts, donation_amount,
 * processing_fee, amount_paid, rsu_transaction_id, transaction_id,
 * fundraiser_id. No PII is extracted (the record's `user` object is never
 * read).
 */
export function normalizeRunSignupDonation(
	record: Record<string, unknown>,
	raceId: number = RUNSIGNUP_DONATION_RACE_ID,
): NormalizedRunSignupDonation | null {
	const donationIdRaw = pickFirst(record, "donation_id", "donationId");
	if (donationIdRaw === null || donationIdRaw === undefined) return null;
	const donationId = String(donationIdRaw);
	const donationRef = `donation:${donationId}`;

	// Transaction identity: the source's true transaction identifier when
	// the payload provides one. rsu_transaction_id is RunSignup's own
	// transaction record id (preferred); transaction_id is the payment
	// gateway reference (accepted when rsu_transaction_id is absent). Only
	// when the payload carries neither do we fall back to the donation
	// record itself — deterministic and documented, never guessed.
	const rsuTxnRaw = pickFirst(record, "rsu_transaction_id", "rsuTransactionId");
	const txnRaw = pickFirst(record, "transaction_id", "transactionId");
	let sourceTransactionId: string;
	let identitySource: DonationIdentitySource;
	if (rsuTxnRaw !== null && rsuTxnRaw !== undefined && String(rsuTxnRaw) !== "") {
		sourceTransactionId = `rsu_transaction:${String(rsuTxnRaw)}`;
		identitySource = "rsu_transaction_id";
	} else if (txnRaw !== null && txnRaw !== undefined && String(txnRaw) !== "") {
		sourceTransactionId = `transaction:${String(txnRaw)}`;
		identitySource = "transaction_id";
	} else {
		sourceTransactionId = donationRef;
		identitySource = "donation_id_fallback";
	}

	const occurredAt = normalizeOccurredAt(
		pickFirst(record, "donation_date", "donationDate", "donation_date_ts", "donationDateTs"),
	);
	const gross = normalizeAmount(pickFirst(record, "donation_amount", "donationAmount"));
	const fee = normalizeAmount(pickFirst(record, "processing_fee", "processingFee"));
	// amount_paid is the total charged to the donor — preserved verbatim in
	// its own correctly named field. It is NOT net revenue.
	const amountPaid = normalizeAmount(pickFirst(record, "amount_paid", "amountPaid"));
	// net (settlement / net-retained cash): the donations/list source
	// provides no settlement truth, so this stays NULL / UNKNOWN by
	// construction. Never derived from amount_paid.
	const net = { cents: null as number | null, status: AMOUNT_UNKNOWN };
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
		amountPaidCents: amountPaid.cents,
		amountPaidStatus: amountPaid.status,
		netCents: net.cents,
		netStatus: net.status,
		refundCents: refund.cents,
		refundStatus: refund.status,
	};

	const snapshot: Record<string, unknown> = {
		donation_id: donationId,
		identity_source: identitySource,
		occurred_at: occurredAt,
		currency,
		gross_cents: amounts.grossCents,
		gross_status: amounts.grossStatus,
		fee_cents: amounts.feeCents,
		fee_status: amounts.feeStatus,
		amount_paid_cents: amounts.amountPaidCents,
		amount_paid_status: amounts.amountPaidStatus,
		refund_cents: amounts.refundCents,
		refund_status: amounts.refundStatus,
		fundraiser_id: fundraiserId,
	};

	return {
		sourceSystem: RUNSIGNUP_SOURCE_SYSTEM,
		donationId,
		sourceTransactionId,
		identitySource,
		transactionKey: transactionKey(RUNSIGNUP_SOURCE_SYSTEM, sourceTransactionId),
		donationRef,
		eventKey: receiptEventKey(RUNSIGNUP_SOURCE_SYSTEM, "donation_received", donationRef),
		occurredAt,
		currency,
		amounts,
		fundraiserId,
		fundraiserEventKey:
			fundraiserId === null
				? null
				: receiptEventKey(RUNSIGNUP_SOURCE_SYSTEM, "fundraiser_donation_received", donationRef),
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
