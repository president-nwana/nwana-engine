import { describe, expect, it } from "vitest";
import { getExecutiveMoneyView } from "../src/operating-center-money";
import { renderOperatingCenterHtml } from "../src/operating-center";
import type { FundProspectRecord, FundRecord } from "../src/fund";
import type { SponsorshipAssetRecord } from "../src/sponsorship-asset";

// Minimal stateful D1 stub keyed on the exact SELECTs issued by
// getFundView (src/fund.ts) and getSponsorshipAssetsView
// (src/sponsorship-asset.ts). Counts every run() call: the money view
// must never write.
function makeMoneyDb() {
	const funds: FundRecord[] = [
		{
			id: "fund-a",
			name: "Fund A",
			slug: "fund-a",
			goal_amount: 50000,
			raised_amount: 12000,
			currency: "USD",
			status: "active",
			description: null,
			created_at: "2026-09-01T00:00:00.000Z",
			updated_at: "2026-09-20T00:00:00.000Z",
		},
	];
	const prospects: FundProspectRecord[] = [
		{
			id: "p1", fund_id: "fund-a", name: "Alice", email: "a@example.com",
			stage: "committed", ask_amount: 5000, ask_tier: "gold",
			subject: "s", one_pager_version: null, sent_at: null,
			stage_updated_at: "2026-09-10T00:00:00.000Z", notes: null,
		},
		{
			id: "p2", fund_id: "fund-a", name: "Bob", email: "b@example.com",
			stage: "negotiating", ask_amount: 3000, ask_tier: "silver",
			subject: "s", one_pager_version: null, sent_at: null,
			stage_updated_at: "2026-09-11T00:00:00.000Z", notes: null,
		},
		{
			id: "p3", fund_id: "fund-a", name: "Cara", email: "c@example.com",
			stage: "committed", ask_amount: 2000, ask_tier: "silver",
			subject: "s", one_pager_version: null, sent_at: null,
			stage_updated_at: "2026-09-12T00:00:00.000Z", notes: null,
		},
	];
	const assets: SponsorshipAssetRecord[] = [
		{
			id: "sasset-1", object_type: "series", object_id: "series-2026",
			title: "Series 2026 title package", description: "d", audience: "a",
			delivers: "d", reference_pricing: "tier-1",
			stage: "committed", stage_updated_at: "2026-09-10T00:00:00.000Z",
			created_at: "2026-09-01T00:00:00.000Z", updated_at: "2026-09-10T00:00:00.000Z",
		},
		{
			id: "sasset-2", object_type: "event", object_id: "event-1",
			title: "Event banner package", description: "d", audience: "a",
			delivers: "d", reference_pricing: "tier-2",
			stage: "offered", stage_updated_at: "2026-09-11T00:00:00.000Z",
			created_at: "2026-09-02T00:00:00.000Z", updated_at: "2026-09-11T00:00:00.000Z",
		},
	];
	let runs = 0;
	const db = {
		prepare(sql: string) {
			return {
				bind() {
					return this;
				},
				async all() {
					if (sql.startsWith("SELECT * FROM funds ORDER BY created_at")) {
						return { results: [...funds] };
					}
					if (sql.startsWith("SELECT * FROM fund_prospects ORDER BY name")) {
						return { results: [...prospects] };
					}
					if (sql.startsWith("SELECT * FROM sponsorship_assets ORDER BY created_at")) {
						return { results: [...assets] };
					}
					throw new Error(`unexpected all(): ${sql}`);
				},
				async run() {
					runs += 1;
					return { success: true };
				},
			};
		},
	} as unknown as D1Database;
	return { db, funds, prospects, assets, runCount: () => runs };
}

describe("executive money view", () => {
	it("aggregates fundraising numbers from existing fund data", async () => {
		const { db } = makeMoneyDb();
		const view = await getExecutiveMoneyView(db);
		expect(view.ok).toBe(true);
		const fund = view.fundraising.funds[0];
		expect(fund.goal_amount).toBe(50000);
		expect(fund.raised_amount).toBe(12000);
		expect(fund.committed_ask_total).toBe(7000);
		expect(fund.ask_by_stage["committed"]).toBe(7000);
		expect(fund.ask_by_stage["negotiating"]).toBe(3000);
		expect(view.fundraising.totals.goal_amount).toBe(50000);
		expect(view.fundraising.totals.raised_amount).toBe(12000);
		expect(view.fundraising.totals.committed_ask_total).toBe(7000);
	});

	it("reports donations as unavailable and sponsorship values as not recorded", async () => {
		const { db } = makeMoneyDb();
		const view = await getExecutiveMoneyView(db);
		expect(view.donations.available).toBe(false);
		expect(view.donations.reason).toMatch(/not connected/);
		// Sponsorship carries stages and counts only — no invented revenue.
		expect(view.sponsorship.stage_counts["committed"]).toBe(1);
		expect(view.sponsorship.stage_counts["offered"]).toBe(1);
		expect(view.sponsorship.committed_count).toBe(1);
		expect(view.sponsorship.note).toMatch(/not recorded/);
		expect("revenue" in view.sponsorship).toBe(false);
	});

	it("keeps fundraising and sponsorship lifecycles separate", async () => {
		const ctx = makeMoneyDb();
		const before = await getExecutiveMoneyView(ctx.db);
		// Move a sponsorship asset to another stage: fundraising numbers
		// must not change.
		ctx.assets[0].stage = "fulfilled";
		const after = await getExecutiveMoneyView(ctx.db);
		expect(after.fundraising.totals).toEqual(before.fundraising.totals);
		expect(after.sponsorship.stage_counts["fulfilled"]).toBe(1);
		expect(after.sponsorship.stage_counts["committed"] ?? 0).toBe(0);
	});

	it("never writes to D1", async () => {
		const { db, runCount } = makeMoneyDb();
		await getExecutiveMoneyView(db);
		expect(runCount()).toBe(0);
	});

	it("renders the money panel on the overview page with valid JS", () => {
		const html = renderOperatingCenterHtml();
		expect(html).toContain('id="money-summary"');
		expect(html).toContain("/operating-center/funds");
		expect(html).toContain("/operating-center/sponsorship");
		const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
		expect(scripts.length).toBeGreaterThan(0);
		for (const body of scripts) {
			expect(() => new Function(body)).not.toThrow();
		}
	});
});
