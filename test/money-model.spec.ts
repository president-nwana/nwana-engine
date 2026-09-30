// Canonical monetary model tests: identity determinism/stability, amount
// normalization (VERIFIED vs UNKNOWN), RunSignup donation normalization,
// lifecycle derivation.

import { describe, expect, it } from "vitest";
import {
	AMOUNT_UNKNOWN,
	AMOUNT_VERIFIED,
	ATTRIBUTION_UNKNOWN,
	deriveLifecycleEvent,
	lifecycleEventKey,
	normalizeAmount,
	normalizeRunSignupDonation,
	receiptEventKey,
	snapshotHash,
	stableHash,
	toCents,
	transactionKey,
} from "../src/lib/money-model";

describe("transaction identity", () => {
	it("is source_system + source_transaction_id", () => {
		expect(transactionKey("runsignup", "donation:123")).toBe("runsignup:donation:123");
	});
});

describe("event identity", () => {
	it("receipt keys are deterministic per source fact", () => {
		const a = receiptEventKey("runsignup", "donation_received", "donation:123");
		const b = receiptEventKey("runsignup", "donation_received", "donation:123");
		expect(a).toBe(b);
		expect(a).toBe("runsignup:evt:donation_received:donation:123");
	});

	it("lifecycle fallback keys are stable for the same source state", () => {
		const h = snapshotHash({ donation_id: "9", refund_cents: 500 });
		const a = lifecycleEventKey("runsignup", "transaction_partially_refunded", "donation:9", h);
		const b = lifecycleEventKey("runsignup", "transaction_partially_refunded", "donation:9", h);
		expect(a).toBe(b);
		expect(a).toContain("transaction_partially_refunded");
	});

	it("different source states produce different lifecycle keys", () => {
		const h1 = snapshotHash({ refund_cents: 500 });
		const h2 = snapshotHash({ refund_cents: 1000 });
		expect(
			lifecycleEventKey("runsignup", "transaction_partially_refunded", "donation:9", h1),
		).not.toBe(
			lifecycleEventKey("runsignup", "transaction_partially_refunded", "donation:9", h2),
		);
	});
});

describe("stableHash", () => {
	it("is deterministic and order-independent via snapshotHash", () => {
		expect(stableHash("abc")).toBe(stableHash("abc"));
		expect(snapshotHash({ a: 1, b: 2 })).toBe(snapshotHash({ b: 2, a: 1 }));
		expect(snapshotHash({ a: 1 })).not.toBe(snapshotHash({ a: 2 }));
	});
});

describe("amount normalization", () => {
	it("converts dollars to integer cents", () => {
		expect(toCents(25)).toBe(2500);
		expect(toCents("10.99")).toBe(1099);
		expect(toCents("$1,234.56")).toBe(123456);
	});

	it("marks missing amounts UNKNOWN without blocking", () => {
		expect(normalizeAmount(null)).toEqual({ cents: null, status: AMOUNT_UNKNOWN });
		expect(normalizeAmount(undefined)).toEqual({ cents: null, status: AMOUNT_UNKNOWN });
		expect(normalizeAmount("")).toEqual({ cents: null, status: AMOUNT_UNKNOWN });
		expect(normalizeAmount("not-a-number")).toEqual({ cents: null, status: AMOUNT_UNKNOWN });
	});

	it("marks supplied amounts VERIFIED", () => {
		expect(normalizeAmount(50)).toEqual({ cents: 5000, status: AMOUNT_VERIFIED });
		expect(normalizeAmount(0)).toEqual({ cents: 0, status: AMOUNT_VERIFIED });
	});
});

describe("normalizeRunSignupDonation", () => {
	it("normalizes a full donation record", () => {
		const n = normalizeRunSignupDonation({
			donation_id: 42,
			donation_amount: 100,
			processing_fee: 3.2,
			amount_paid: 96.8,
			donation_date: "2026-09-01 12:00:00",
		});
		expect(n).not.toBeNull();
		expect(n!.donationId).toBe("42");
		expect(n!.sourceTransactionId).toBe("donation:42");
		expect(n!.transactionKey).toBe("runsignup:donation:42");
		expect(n!.eventKey).toBe("runsignup:evt:donation_received:donation:42");
		expect(n!.amounts.grossCents).toBe(10000);
		expect(n!.amounts.grossStatus).toBe(AMOUNT_VERIFIED);
		expect(n!.amounts.feeCents).toBe(320);
		expect(n!.amounts.netCents).toBe(9680);
		expect(n!.amounts.netStatus).toBe(AMOUNT_VERIFIED);
		expect(n!.amounts.refundStatus).toBe(AMOUNT_UNKNOWN);
		expect(n!.fundraiserId).toBeNull();
		expect(n!.fundraiserEventKey).toBeNull();
		expect(n!.sourceRef).toBe("race:212466/donation:42");
	});

	it("keeps unknown amounts UNKNOWN while ingesting verified gross", () => {
		const n = normalizeRunSignupDonation({ donation_id: 7, donation_amount: 25 });
		expect(n!.amounts.grossStatus).toBe(AMOUNT_VERIFIED);
		expect(n!.amounts.feeStatus).toBe(AMOUNT_UNKNOWN);
		expect(n!.amounts.netStatus).toBe(AMOUNT_UNKNOWN);
		expect(n!.amounts.netCents).toBeNull();
	});

	it("never derives net silently", () => {
		const n = normalizeRunSignupDonation({
			donation_id: 7,
			donation_amount: 25,
			processing_fee: 1,
		});
		expect(n!.amounts.netStatus).toBe(AMOUNT_UNKNOWN);
	});

	it("returns null when the record has no stable donation id", () => {
		expect(normalizeRunSignupDonation({ donation_amount: 25 })).toBeNull();
		expect(normalizeRunSignupDonation({})).toBeNull();
	});

	it("emits a fundraiser event key when the record carries a fundraiser", () => {
		const n = normalizeRunSignupDonation({ donation_id: 7, donation_amount: 25, fundraiser_id: 99 });
		expect(n!.fundraiserId).toBe("99");
		expect(n!.fundraiserEventKey).toBe(
			"runsignup:evt:fundraiser_donation_received:donation:7",
		);
	});

	it("normalizes unix timestamps to ISO", () => {
		const n = normalizeRunSignupDonation({ donation_id: 7, donation_date_ts: 1756680000 });
		expect(n!.occurredAt).toBe(new Date(1756680000 * 1000).toISOString());
	});

	it("is stable: same record normalizes to the same snapshot hash", () => {
		const rec = { donation_id: 7, donation_amount: 25, donation_date: "2026-09-01 12:00:00" };
		expect(normalizeRunSignupDonation(rec)!.snapshotHash).toBe(
			normalizeRunSignupDonation({ ...rec })!.snapshotHash,
		);
	});

	it("attribution defaults to ATTRIBUTION_UNKNOWN", () => {
		expect(ATTRIBUTION_UNKNOWN).toBe("ATTRIBUTION_UNKNOWN");
	});
});

describe("deriveLifecycleEvent", () => {
	const base = (over: Record<string, unknown> = {}) =>
		normalizeRunSignupDonation({ donation_id: 9, donation_amount: 100, ...over })!;

	it("detects a partial refund", () => {
		const e = deriveLifecycleEvent(
			{ refund_cents: 0 },
			base({ refund_amount: 25 }),
		);
		expect(e).toEqual({
			eventType: "transaction_partially_refunded",
			lifecycleState: "PARTIALLY_REFUNDED",
			refundCents: 2500,
		});
	});

	it("detects a full refund", () => {
		const e = deriveLifecycleEvent(
			{ refund_cents: 0 },
			base({ refund_amount: 100 }),
		);
		expect(e!.eventType).toBe("transaction_refunded");
		expect(e!.lifecycleState).toBe("REFUNDED");
	});

	it("returns null when nothing lifecycle-relevant changed", () => {
		expect(deriveLifecycleEvent({ refund_cents: 0 }, base())).toBeNull();
		// Same refund as before: no new event.
		expect(
			deriveLifecycleEvent({ refund_cents: 2500 }, base({ refund_amount: 25 })),
		).toBeNull();
	});

	it("returns null when refund fields are absent (UNKNOWN)", () => {
		expect(deriveLifecycleEvent({ refund_cents: 0 }, base({ donation_amount: 120 }))).toBeNull();
	});
});
