import { describe, expect, it } from "vitest";
import {
	getLaneGates,
	pickGate,
	recordReceivedPayment,
	type LaneGate,
} from "../src/lib/money-receipts";
import { getMoneyCycle, laneForEventType } from "../src/operating-center-money";

// Minimal D1 stub for the receipts path: territories, lane gates,
// outreach prospects, and batch inserts with OR-IGNORE semantics keyed
// on the event_key (first bound value of the money_events insert).
const GATES: LaneGate[] = [
	{ lane: "donation", scope: "ALL", status: "CLOSED", basis: "no state gate passed", source: "TZ 8.2", updated_at: "2026-10-17" },
	{ lane: "donation", scope: "FL", status: "CLOSED", basis: "FDACS registration not approved", source: "Phase 1A memo", updated_at: "2026-10-17" },
	{ lane: "sponsorship", scope: "FL", status: "OPEN", basis: "own B2B gate", source: "Phase 1A memo", updated_at: "2026-10-17" },
	{ lane: "contract", scope: "FL", status: "OPEN", basis: "services, not solicitation", source: "Phase 1A memo", updated_at: "2026-10-17" },
	{ lane: "grant", scope: "ALL", status: "OWNER_STOP", basis: "owner stop order", source: "TZ 5.5", updated_at: "2026-10-17" },
];

const TERRITORIES: Record<string, { territory_id: string; type: string; usps: string | null; state_fips: string | null }> = {
	"terr-city-1253000": { territory_id: "terr-city-1253000", type: "CITY", usps: null, state_fips: "12" },
	"terr-st-12": { territory_id: "terr-st-12", type: "STATE", usps: "FL", state_fips: "12" },
	"terr-us": { territory_id: "terr-us", type: "NATIONAL", usps: null, state_fips: null },
};

function makeDb() {
	const insertedEvents = new Map<string, unknown[]>();
	const insertedTxns = new Map<string, unknown[]>();
	const makeStmt = (sql: string, binds: unknown[] = []) => ({
		bind: (...b: unknown[]) => makeStmt(sql, b),
		first: async () => {
			if (sql.includes("FROM territories WHERE territory_id = ?")) {
				return TERRITORIES[String(binds[0])] ?? null;
			}
			if (sql.includes("type = 'STATE' AND state_fips")) {
				return binds[0] === "12" ? { usps: "FL" } : null;
			}
			if (sql.includes("FROM outreach_prospects WHERE id = ?")) {
				return binds[0] === 12 ? { id: 12, track: "sponsor-kilometers" } : null;
			}
			return null;
		},
		all: async () => {
			if (sql.includes("FROM funding_lane_gates")) return { results: GATES };
			return { results: [] };
		},
		run: async () => ({ meta: { changes: 0 } }),
		_sql: sql,
		_binds: binds,
	});
	const db = {
		prepare: (sql: string) => makeStmt(sql),
		batch: async (stmts: Array<{ _sql: string; _binds: unknown[] }>) =>
			stmts.map((s) => {
				if (s._sql.includes("INSERT OR IGNORE INTO money_events")) {
					const key = String(s._binds[0]);
					if (insertedEvents.has(key)) return { meta: { changes: 0 } };
					insertedEvents.set(key, s._binds);
					return { meta: { changes: 1 } };
				}
				if (s._sql.includes("INSERT OR IGNORE INTO money_transactions")) {
					const key = String(s._binds[0]);
					if (insertedTxns.has(key)) return { meta: { changes: 0 } };
					insertedTxns.set(key, s._binds);
					return { meta: { changes: 1 } };
				}
				return { meta: { changes: 0 } };
			}),
		_insertedEvents: insertedEvents,
		_insertedTxns: insertedTxns,
	};
	return db as unknown as D1Database & { _insertedEvents: Map<string, unknown[]>; _insertedTxns: Map<string, unknown[]> };
}

const FL_RECEIPT = {
	lane: "sponsorship" as const,
	payment_ref: "ach-2026-0001",
	amount_cents: 250000,
	occurred_at: "2026-10-20T15:00:00Z",
	territory_id: "terr-city-1253000",
	source_prospect_id: 12,
	restriction: "territory" as const,
};

describe("recordReceivedPayment", () => {
	it("records a sponsorship receipt with source, territory and restriction attribution", async () => {
		const db = makeDb();
		const res = await recordReceivedPayment(db, FL_RECEIPT);
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		expect(res.recorded).toBe(true);
		expect(res.event_key).toBe("manual-b2b:evt:sponsorship_received:ach-2026-0001");
		const binds = db._insertedEvents.get(res.event_key) ?? [];
		expect(binds).toContain("outreach:sponsor-kilometers:prospect:12");
		expect(binds).toContain("terr-city-1253000");
		expect(binds).toContain("territory");
		expect(db._insertedTxns.size).toBe(1);
	});

	it("is idempotent by payment_ref: a repeat records nothing new", async () => {
		const db = makeDb();
		const first = await recordReceivedPayment(db, FL_RECEIPT);
		const second = await recordReceivedPayment(db, FL_RECEIPT);
		expect(first.ok && second.ok).toBe(true);
		if (!first.ok || !second.ok) return;
		expect(first.recorded).toBe(true);
		expect(second.recorded).toBe(false);
		expect(db._insertedEvents.size).toBe(1);
	});

	it("refuses a solicitation-sourced Florida donation while the gate is CLOSED", async () => {
		const db = makeDb();
		const res = await recordReceivedPayment(db, {
			lane: "donation",
			payment_ref: "chk-1",
			amount_cents: 5000,
			occurred_at: "2026-10-20T15:00:00Z",
			territory_id: "terr-st-12",
			solicitation: true,
		});
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.gate_status).toBe("CLOSED");
		expect(db._insertedEvents.size).toBe(0);
	});

	it("books a genuinely unsolicited Florida donation with the attestation recorded", async () => {
		const db = makeDb();
		const res = await recordReceivedPayment(db, {
			lane: "donation",
			payment_ref: "chk-2",
			amount_cents: 5000,
			occurred_at: "2026-10-20T15:00:00Z",
			territory_id: "terr-st-12",
			solicitation: false,
		});
		expect(res.ok).toBe(true);
		if (!res.ok) return;
		const binds = db._insertedEvents.get(res.event_key) ?? [];
		expect(binds.some((b) => typeof b === "string" && b.includes("unsolicited receipt"))).toBe(true);
	});

	it("refuses grant receipts while the owner stop stands", async () => {
		const db = makeDb();
		const res = await recordReceivedPayment(db, {
			lane: "grant",
			payment_ref: "gr-1",
			amount_cents: 1000,
			occurred_at: "2026-10-20T15:00:00Z",
			territory_id: "terr-us",
		});
		expect(res.ok).toBe(false);
		if (res.ok) return;
		expect(res.gate_status).toBe("OWNER_STOP");
	});

	it("rejects unknown territories, unknown prospects and non-positive amounts", async () => {
		const db = makeDb();
		const badTerritory = await recordReceivedPayment(db, { ...FL_RECEIPT, payment_ref: "x1", territory_id: "terr-nope" });
		expect(badTerritory.ok).toBe(false);
		const badProspect = await recordReceivedPayment(db, { ...FL_RECEIPT, payment_ref: "x2", source_prospect_id: 999 });
		expect(badProspect.ok).toBe(false);
		const badAmount = await recordReceivedPayment(db, { ...FL_RECEIPT, payment_ref: "x3", amount_cents: 0 });
		expect(badAmount.ok).toBe(false);
		const inKind = await recordReceivedPayment(db, { ...FL_RECEIPT, payment_ref: "x4", lane: "in-kind" });
		expect(inKind.ok).toBe(false);
	});
});

describe("lane gates", () => {
	it("pickGate prefers the state row over ALL", () => {
		expect(pickGate(GATES, "donation", "FL")?.scope).toBe("FL");
		expect(pickGate(GATES, "donation", "TX")?.scope).toBe("ALL");
		expect(pickGate(GATES, "sponsorship", "FL")?.status).toBe("OPEN");
	});

	it("getLaneGates returns the stored rows", async () => {
		const db = makeDb();
		const gates = await getLaneGates(db);
		expect(gates).toHaveLength(5);
	});
});

describe("money cycle view helpers", () => {
	it("laneForEventType maps stored types to lanes", () => {
		expect(laneForEventType("donation_received")).toBe("donation");
		expect(laneForEventType("fundraiser_donation_received")).toBe("donation");
		expect(laneForEventType("registration_paid")).toBe("registration");
		expect(laneForEventType("license_purchased")).toBe("license");
		expect(laneForEventType("sponsorship_received")).toBe("sponsorship");
		expect(laneForEventType("transaction_refunded")).toBe("other");
	});

	it("getMoneyCycle degrades to an honest empty section when every table is missing", async () => {
		const throwingDb = {
			prepare: () => {
				throw new Error("no such table");
			},
		} as unknown as D1Database;
		const section = await getMoneyCycle(throwingDb);
		expect(section.lane_gates).toBeNull();
		expect(section.lane_gates_note).toContain("0098");
		expect(section.receipts_registry).toEqual([]);
		expect(section.florida_cycle).toBeNull();
	});
});
