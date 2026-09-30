// Revenue inventory tests (Phase 2): canonical registry, money rollup
// derived from money_events (never duplicated), action transitions with
// append-only history, vocabulary enforcement.
//
// The D1 stub emulates exactly the statements issued by
// src/lib/revenue-inventory.ts.

import { beforeEach, describe, expect, it } from "vitest";

import {
	getRevenueObject,
	listRevenueObjects,
	recordRevenueAction,
} from "../src/lib/revenue-inventory";

interface StubStatement {
	sql: string;
	args: unknown[];
}

const OBJ_COLS = [
	"object_key", "object_type", "name", "source_platform", "source_object_id",
	"purchase_url", "price_structure", "active_status", "monetary_capabilities",
	"transaction_source", "conversion_event", "conversion_tracking",
	"automation_capabilities", "acquisition_eligibility",
	"acquisition_eligibility_reason", "next_revenue_action", "action_status",
	"attributable_acquisition_source", "revenue_system", "money_link",
	"evidence", "created_at", "updated_at",
];

function makeInventoryDb() {
	const objects = new Map<string, Record<string, unknown>>();
	const actions: Record<string, unknown>[] = [];
	const moneyEvents: Record<string, unknown>[] = [];
	let actionId = 0;

	const rowFrom = (cols: string[], args: unknown[]) => {
		const row: Record<string, unknown> = {};
		cols.forEach((c, i) => (row[c] = args[i]));
		return row;
	};

	const applyStatement = (st: StubStatement): number => {
		const sql = st.sql.replace(/\s+/g, " ").trim();
		if (sql.startsWith("UPDATE revenue_objects SET next_revenue_action")) {
			const obj = objects.get(String(st.args[2]));
			if (!obj) return 0;
			obj["next_revenue_action"] = st.args[0];
			obj["action_status"] = st.args[1];
			return 1;
		}
		if (sql.startsWith("INSERT INTO revenue_object_actions")) {
			actionId += 1;
			actions.push({
				id: actionId,
				object_key: st.args[0],
				action: st.args[1],
				status: st.args[2],
				note: st.args[3],
				created_at: "2026-09-30T00:00:00Z",
			});
			return 1;
		}
		throw new Error(`unexpected statement: ${sql.slice(0, 80)}`);
	};

	const runQuery = (st: StubStatement): Record<string, unknown>[] => {
		const sql = st.sql.replace(/\s+/g, " ").trim();
		if (sql.startsWith("SELECT object_key FROM revenue_objects WHERE object_key = ?")) {
			const obj = objects.get(String(st.args[0]));
			return obj ? [{ object_key: obj["object_key"] }] : [];
		}
		if (sql.startsWith("SELECT * FROM revenue_objects WHERE object_key = ?")) {
			const obj = objects.get(String(st.args[0]));
			return obj ? [obj] : [];
		}
		if (sql.startsWith("SELECT * FROM revenue_objects")) {
			let rows = [...objects.values()];
			if (sql.includes("object_type = ?")) {
				rows = rows.filter((r) => r["object_type"] === st.args[0]);
			}
			if (sql.includes("revenue_system = ?")) {
				const idx = sql.includes("object_type = ?") ? 1 : 0;
				rows = rows.filter((r) => r["revenue_system"] === st.args[idx]);
			}
			return rows;
		}
		if (sql.startsWith("SELECT * FROM revenue_object_actions")) {
			return actions
				.filter((a) => a["object_key"] === st.args[0])
				.sort((a, b) => Number(b["id"]) - Number(a["id"]))
				.slice(0, 50);
		}
		if (sql.includes("FROM money_events") && sql.includes("COUNT(DISTINCT transaction_key)")) {
			const types = st.args as string[];
			const evts = moneyEvents.filter((e) => types.includes(String(e["event_type"])));
			const txKeys = new Set(evts.map((e) => String(e["transaction_key"])));
			const sum = (pred: (e: Record<string, unknown>) => boolean, col: string) =>
				evts.filter(pred).reduce((s, e) => s + Number(e[col] ?? 0), 0);
			const verified = (e: Record<string, unknown>, col: string) =>
				e[`${col}_status`] === "VERIFIED";
			const netVals = evts
				.filter((e) => verified(e, "net"))
				.map((e) => Number(e["net_cents"]));
			return [
				{
					transaction_count: txKeys.size,
					gross_cents: sum((e) => verified(e, "gross"), "gross_cents"),
					refund_cents: sum((e) => verified(e, "refund"), "refund_cents"),
					// Honest NULL when no VERIFIED net exists.
					net_cents: netVals.length ? netVals.reduce((a, b) => a + b, 0) : null,
					revenue_7d_cents: 0,
					revenue_30d_cents: sum((e) => verified(e, "gross"), "gross_cents"),
					revenue_90d_cents: sum((e) => verified(e, "gross"), "gross_cents"),
				},
			];
		}
		throw new Error(`unexpected query: ${sql.slice(0, 80)}`);
	};

	const db = {
		prepare(sql: string) {
			const st: StubStatement = { sql, args: [] };
			const bound = {
				_st: st,
				bind(...args: unknown[]) {
					st.args = args;
					return bound;
				},
				all: async <T,>() => ({ results: runQuery(st) as T[] }),
				first: async <T,>() => {
					const rows = runQuery(st);
					return (rows[0] ?? null) as T | null;
				},
			};
			return bound;
		},
		batch(statements: { _st: StubStatement }[]) {
			return (async () => {
				const results: unknown[] = [];
				for (const s of statements) {
					results.push({ success: true, meta: { changes: applyStatement(s._st) } });
				}
				return results;
			})();
		},
	};

	// Seed helper: insert object rows directly.
	const seedObject = (overrides: Record<string, unknown>) => {
		const row: Record<string, unknown> = {};
		for (const c of OBJ_COLS) row[c] = null;
		Object.assign(row, overrides);
		objects.set(String(row["object_key"]), row);
	};
	const seedMoneyEvent = (overrides: Record<string, unknown>) => {
		moneyEvents.push(overrides);
	};

	return { db: db as unknown as D1Database, seedObject, seedMoneyEvent, objects, actions };
}

describe("revenue inventory", () => {
	let ctx: ReturnType<typeof makeInventoryDb>;
	beforeEach(() => {
		ctx = makeInventoryDb();
	});

	it("lists objects with money rollups derived from money_events", async () => {
		ctx.seedObject({
			object_key: "donation:runsignup:212466",
			object_type: "DONATION",
			name: "NWANA Nordic Walking SPORT",
			active_status: "active",
			conversion_tracking: "unknown",
			acquisition_eligibility: "eligible",
			action_status: "pending",
			revenue_system: "REVENUE_ENGINE",
			money_link: JSON.stringify({ event_types: ["donation_received"] }),
		});
		ctx.seedObject({
			object_key: "license:gap:discovery-2026-09-30",
			object_type: "LICENSE",
			name: "License (gap)",
			active_status: "unknown",
			conversion_tracking: "unavailable",
			acquisition_eligibility: "unknown",
			action_status: "none",
			revenue_system: "REVENUE_ENGINE",
			money_link: null,
		});
		ctx.seedMoneyEvent({
			event_key: "runsignup:evt:donation_received:donation:11291415",
			transaction_key: "runsignup:rsu_transaction:56992565",
			event_type: "donation_received",
			gross_cents: 500,
			gross_status: "VERIFIED",
			fee_cents: 20,
			fee_status: "VERIFIED",
			net_cents: null,
			net_status: "UNKNOWN",
			refund_cents: null,
			refund_status: "UNKNOWN",
			occurred_at: "2026-09-30T03:10:48Z",
		});

		const objs = await listRevenueObjects(ctx.db);
		expect(objs).toHaveLength(2);

		const donation = objs.find((o) => o.object_key === "donation:runsignup:212466");
		expect(donation?.money).toMatchObject({
			transaction_count: 1,
			gross_cents: 500,
			refund_cents: 0,
			// Net stays NULL: no settlement truth in the source.
			net_cents: null,
		});

		const gap = objs.find((o) => o.object_key.startsWith("license:gap:"));
		expect(gap?.money).toBeNull();
	});

	it("filters by revenue_system and keeps SPONSORSHIP_ENGINE separate", async () => {
		ctx.seedObject({
			object_key: "donation:runsignup:212466",
			object_type: "DONATION",
			name: "d",
			active_status: "active",
			conversion_tracking: "unknown",
			acquisition_eligibility: "eligible",
			action_status: "pending",
			revenue_system: "REVENUE_ENGINE",
		});
		ctx.seedObject({
			object_key: "partnership:engine:aarp",
			object_type: "PARTNERSHIP",
			name: "AARP",
			active_status: "unknown",
			conversion_tracking: "unknown",
			acquisition_eligibility: "unknown",
			action_status: "none",
			revenue_system: "SPONSORSHIP_ENGINE",
		});

		const engine = await listRevenueObjects(ctx.db, { revenue_system: "REVENUE_ENGINE" });
		expect(engine.map((o) => o.object_key)).toEqual(["donation:runsignup:212466"]);
		const sponsor = await listRevenueObjects(ctx.db, { revenue_system: "SPONSORSHIP_ENGINE" });
		expect(sponsor.map((o) => o.object_key)).toEqual(["partnership:engine:aarp"]);
	});

	it("records action transitions with append-only history", async () => {
		ctx.seedObject({
			object_key: "fundraiser:engine:fund-50k-bridge-sprint",
			object_type: "FUNDRAISER",
			name: "$50K Bridge Sprint",
			active_status: "active",
			conversion_tracking: "unavailable",
			acquisition_eligibility: "eligible",
			action_status: "pending",
			next_revenue_action: "Execute scheduled follow-ups",
			revenue_system: "REVENUE_ENGINE",
		});

		const updated = await recordRevenueAction(ctx.db, "fundraiser:engine:fund-50k-bridge-sprint", {
			action: "Execute scheduled follow-ups",
			status: "in_progress",
			note: "started 2026-10-06 batch",
		});
		expect(updated?.action_status).toBe("in_progress");
		expect(updated?.next_revenue_action).toBe("Execute scheduled follow-ups");

		const detail = await getRevenueObject(ctx.db, "fundraiser:engine:fund-50k-bridge-sprint");
		expect(detail?.actions).toHaveLength(1);
		expect(detail?.actions[0]).toMatchObject({
			action: "Execute scheduled follow-ups",
			status: "in_progress",
		});

		// Second transition appends, history grows.
		await recordRevenueAction(ctx.db, "fundraiser:engine:fund-50k-bridge-sprint", {
			action: "Execute scheduled follow-ups",
			status: "done",
		});
		const detail2 = await getRevenueObject(ctx.db, "fundraiser:engine:fund-50k-bridge-sprint");
		expect(detail2?.actions).toHaveLength(2);
		expect(detail2?.action_status).toBe("done");
	});

	it("rejects invalid action status and unknown object keys", async () => {
		ctx.seedObject({
			object_key: "donation:runsignup:212466",
			object_type: "DONATION",
			name: "d",
			active_status: "active",
			conversion_tracking: "unknown",
			acquisition_eligibility: "eligible",
			action_status: "pending",
			revenue_system: "REVENUE_ENGINE",
		});
		await expect(
			recordRevenueAction(ctx.db, "donation:runsignup:212466", {
				action: "x",
				status: "bogus" as never,
			}),
		).rejects.toThrow(/invalid action status/);
		expect(
			await recordRevenueAction(ctx.db, "nope:missing", { action: "x", status: "done" }),
		).toBeNull();
		expect(await getRevenueObject(ctx.db, "nope:missing")).toBeNull();
	});

	it("treats malformed money_link as no linkage (never crashes)", async () => {
		ctx.seedObject({
			object_key: "nw_group:runsignup:memberorg",
			object_type: "NW_GROUP",
			name: "NW Groups",
			active_status: "unknown",
			conversion_tracking: "unavailable",
			acquisition_eligibility: "blocked",
			action_status: "blocked",
			revenue_system: "REVENUE_ENGINE",
			money_link: "not-json{{{",
		});
		const objs = await listRevenueObjects(ctx.db);
		expect(objs[0]?.money).toBeNull();
	});
});
