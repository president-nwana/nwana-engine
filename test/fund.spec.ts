import { describe, expect, it } from "vitest";
import {
	BRIDGE_SPRINT_FUND,
	BRIDGE_SPRINT_PROSPECTS,
	FUND_STAGES,
	FUND_STAGE_LABELS,
	advanceFundProspect,
	allowedFundTransitions,
	fundProspectNextAction,
	getFundView,
	isFundStage,
	seedBridgeSprintFund,
	transitionFundProspect,
	type FundProspectRecord,
	type FundRecord,
} from "../src/fund";

// Minimal stateful D1 stub: two tables, keyed SQL matching the exact
// statements issued by src/fund.ts.
function makeFundDb() {
	const funds: FundRecord[] = [];
	const prospects: FundProspectRecord[] = [];
	const db = {
		prepare(sql: string) {
			let args: unknown[] = [];
			return {
				bind(...params: unknown[]) {
					args = params;
					return this;
				},
				async first() {
					if (sql.startsWith("SELECT id FROM funds WHERE slug = ?")) {
						const row = funds.find((f) => f.slug === args[0]);
						return row ? { id: row.id } : null;
					}
					if (sql.startsWith("SELECT COUNT(*) AS n FROM fund_prospects WHERE fund_id = ?")) {
						return { n: prospects.filter((p) => p.fund_id === args[0]).length };
					}
					if (sql.startsWith("SELECT stage FROM fund_prospects WHERE id = ?")) {
						const row = prospects.find((p) => p.id === args[0]);
						return row ? { stage: row.stage } : null;
					}
					if (sql.startsWith("SELECT * FROM fund_prospects WHERE id = ?")) {
						return prospects.find((p) => p.id === args[0]) ?? null;
					}
					throw new Error(`unexpected first(): ${sql}`);
				},
				async all() {
					if (sql.startsWith("SELECT * FROM funds ORDER BY created_at")) {
						return { results: [...funds] };
					}
					if (sql.startsWith("SELECT * FROM fund_prospects ORDER BY name")) {
						return { results: [...prospects].sort((a, b) => a.name.localeCompare(b.name)) };
					}
					throw new Error(`unexpected all(): ${sql}`);
				},
				async run() {
					if (sql.startsWith("INSERT INTO funds")) {
						const [id, name, slug, goal_amount, raised_amount, currency, status, description, created_at, updated_at] = args as [string, string, string, number, number, string, string, string, string, string];
						funds.push({ id, name, slug, goal_amount, raised_amount, currency, status, description, created_at, updated_at });
						return { success: true };
					}
					if (sql.startsWith("INSERT INTO fund_prospects")) {
						const [id, fund_id, name, email, stage, ask_amount, ask_tier, subject, one_pager_version, sent_at, stage_updated_at, notes] = args as [string, string, string, string, string, number, string, string, string, string, string, string];
						prospects.push({ id, fund_id, name, email, stage: stage as FundProspectRecord["stage"], ask_amount, ask_tier, subject, one_pager_version, sent_at, stage_updated_at, notes });
						return { success: true };
					}
					if (sql.startsWith("UPDATE fund_prospects SET stage = ?")) {
						const row = prospects.find((p) => p.id === args[2]);
						if (row) {
							row.stage = args[0] as FundProspectRecord["stage"];
							row.stage_updated_at = args[1] as string;
						}
						return { success: true };
					}
					throw new Error(`unexpected run(): ${sql}`);
				},
			};
		},
	};
	return { db: db as unknown as D1Database, funds, prospects };
}

describe("Fund lifecycle stages (ADR-0015)", () => {
	it("defines the full prospect -> recognition chain in order", () => {
		expect(FUND_STAGES).toEqual([
			"prospect",
			"verified",
			"drafted",
			"sent",
			"follow_up",
			"committed",
			"stewardship",
			"recognition",
		]);
	});

	it("labels every stage in English", () => {
		for (const stage of FUND_STAGES) {
			expect(FUND_STAGE_LABELS[stage]).toBeTruthy();
			expect(isFundStage(stage)).toBe(true);
		}
		expect(isFundStage("mailed")).toBe(false);
	});

	it("allows the full forward chain", () => {
		const chain: Array<[string, string]> = [
			["prospect", "verified"],
			["verified", "drafted"],
			["drafted", "sent"],
			["sent", "follow_up"],
			["follow_up", "committed"],
			["committed", "stewardship"],
			["stewardship", "recognition"],
		];
		for (const [from, to] of chain) {
			const result = transitionFundProspect(from, to);
			expect(result).toEqual({ ok: true, to, reason: null });
		}
	});

	it("allows a direct sent -> committed commit without a follow-up", () => {
		expect(transitionFundProspect("sent", "committed")).toEqual({
			ok: true,
			to: "committed",
			reason: null,
		});
	});

	it("allows one-step corrections backward", () => {
		expect(transitionFundProspect("drafted", "verified").ok).toBe(true);
		expect(transitionFundProspect("sent", "drafted").ok).toBe(true);
		expect(transitionFundProspect("committed", "follow_up").ok).toBe(true);
	});

	it("rejects skipping stages forward", () => {
		const result = transitionFundProspect("prospect", "sent");
		expect(result.ok).toBe(false);
		expect(result.reason).toContain("cannot move");
	});

	it("treats recognition as terminal", () => {
		expect(allowedFundTransitions("recognition")).toEqual([]);
		const result = transitionFundProspect("recognition", "prospect");
		expect(result.ok).toBe(false);
	});

	it("rejects unknown stages on either side", () => {
		expect(transitionFundProspect("sent", "mailed").ok).toBe(false);
		expect(transitionFundProspect("mailed", "sent").ok).toBe(false);
	});

	it("surfaces an English next action for every stage", () => {
		for (const stage of FUND_STAGES) {
			const action = fundProspectNextAction(stage);
			expect(action.length).toBeGreaterThan(10);
		}
		// Sends stay manual: the machine never claims to send.
		expect(fundProspectNextAction("drafted")).toContain("presses Send");
	});
});

describe("Bridge sprint seed (factual Pool 4)", () => {
	it("carries the $50K goal as the first live fund object", () => {
		expect(BRIDGE_SPRINT_FUND.goal_amount).toBe(50000);
		expect(BRIDGE_SPRINT_FUND.slug).toBe("50k-manhattan-hq-bridge-sprint");
	});

	it("seeds exactly the 15 Pool 4 prospects, all at sent", () => {
		expect(BRIDGE_SPRINT_PROSPECTS).toHaveLength(15);
		const ids = BRIDGE_SPRINT_PROSPECTS.map((p) => p.id);
		expect(new Set(ids).size).toBe(15);
		for (const p of BRIDGE_SPRINT_PROSPECTS) {
			expect(p.stage).toBe("sent");
			expect(p.sent_at).toBe("2026-09-22T14:19:00.000Z");
			expect(p.one_pager_version).toBe("v5");
			expect(p.ask_amount).toBeGreaterThan(0);
		}
	});

	it("includes the $25K HQ Founder ask for Federer", () => {
		const federer = BRIDGE_SPRINT_PROSPECTS.find((p) => p.name === "Roger Federer");
		expect(federer?.ask_amount).toBe(25000);
		expect(federer?.ask_tier).toBe("$25K HQ Founder");
	});
});

describe("Fund D1 operations", () => {
	it("seeds idempotently: second call changes nothing", async () => {
		const { db, funds, prospects } = makeFundDb();
		const first = await seedBridgeSprintFund(db);
		expect(first).toMatchObject({ ok: true, seeded: true, prospects: 15 });
		const second = await seedBridgeSprintFund(db);
		expect(second).toMatchObject({ ok: true, seeded: false, prospects: 15 });
		expect(funds).toHaveLength(1);
		expect(prospects).toHaveLength(15);
	});

	it("reads the fund view with stage counts and next actions", async () => {
		const { db } = makeFundDb();
		await seedBridgeSprintFund(db);
		const view = await getFundView(db);
		expect(view.ok).toBe(true);
		expect(view.funds).toHaveLength(1);
		const fund = view.funds[0];
		expect(fund.fund.goal_amount).toBe(50000);
		expect(fund.stage_counts.sent).toBe(15);
		expect(fund.stage_counts.committed).toBe(0);
		expect(fund.prospects).toHaveLength(15);
		expect(fund.prospects[0].next_action.length).toBeGreaterThan(10);
	});

	it("advances a prospect through a legal transition", async () => {
		const { db } = makeFundDb();
		await seedBridgeSprintFund(db);
		const id = BRIDGE_SPRINT_PROSPECTS[0].id;
		const moved = await advanceFundProspect(db, id, "follow_up");
		expect(moved.ok).toBe(true);
		if (moved.ok) expect(moved.prospect.stage).toBe("follow_up");
		const view = await getFundView(db);
		expect(view.funds[0].stage_counts.sent).toBe(14);
		expect(view.funds[0].stage_counts.follow_up).toBe(1);
	});

	it("rejects an illegal transition without touching the row", async () => {
		const { db } = makeFundDb();
		await seedBridgeSprintFund(db);
		const id = BRIDGE_SPRINT_PROSPECTS[0].id;
		const rejected = await advanceFundProspect(db, id, "recognition");
		expect(rejected.ok).toBe(false);
		if (!rejected.ok) expect(rejected.error).toContain("cannot move");
		const view = await getFundView(db);
		expect(view.funds[0].stage_counts.sent).toBe(15);
	});

	it("returns an empty view before any fund exists", async () => {
		const { db } = makeFundDb();
		const view = await getFundView(db);
		expect(view.funds).toHaveLength(0);
	});
});
