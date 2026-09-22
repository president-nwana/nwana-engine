import { describe, expect, it } from "vitest";
import {
	SPONSORSHIP_ASSET_STAGES,
	SPONSORSHIP_ASSET_STAGE_LABELS,
	advanceSponsorshipAsset,
	allowedSponsorshipAssetTransitions,
	buildSponsorshipAssetPackage,
	generateSponsorshipAsset,
	getSponsorshipAssetsView,
	isSponsorshipAssetStage,
	sponsorshipAssetNextAction,
	transitionSponsorshipAsset,
	type SponsorshipAssetRecord,
} from "../src/sponsorship-asset";

// Minimal stateful D1 stub: tables sponsorship_assets and funds, keyed SQL
// matching the exact statements issued by src/sponsorship-asset.ts.
function makeDb() {
	const assets: SponsorshipAssetRecord[] = [];
	const funds = [
		{
			id: "fund-50k-bridge-sprint",
			name: "$50K Manhattan HQ Bridge Sprint",
			description: "Founding capital to build the NWANA federation machine.",
			goal_amount: 50000,
			currency: "USD",
			status: "active",
		},
	];
	const db = {
		prepare(sql: string) {
			let args: unknown[] = [];
			return {
				bind(...params: unknown[]) {
					args = params;
					return this;
				},
				async first() {
					if (sql.startsWith("SELECT * FROM sponsorship_assets WHERE id = ?")) {
						return assets.find((a) => a.id === args[0]) ?? null;
					}
					if (sql.startsWith("SELECT stage FROM sponsorship_assets WHERE id = ?")) {
						const row = assets.find((a) => a.id === args[0]);
						return row ? { stage: row.stage } : null;
					}
					if (sql.startsWith("SELECT id, name, description, goal_amount, currency, status FROM funds WHERE id = ?")) {
						return funds.find((f) => f.id === args[0]) ?? null;
					}
					throw new Error(`unexpected first(): ${sql}`);
				},
				async all() {
					if (sql.startsWith("SELECT * FROM sponsorship_assets ORDER BY created_at")) {
						return { results: [...assets] };
					}
					throw new Error(`unexpected all(): ${sql}`);
				},
				async run() {
					if (sql.startsWith("INSERT INTO sponsorship_assets")) {
						const [
							id, object_type, object_id, title, description, audience,
							delivers, reference_pricing, stage_updated_at, created_at, updated_at,
						] = args as string[];
						assets.push({
							id, object_type, object_id, title, description, audience,
							delivers, reference_pricing, stage: "draft",
							stage_updated_at, created_at, updated_at,
						});
						return {};
					}
					if (sql.startsWith("UPDATE sponsorship_assets SET stage = ?")) {
						const [stage, stage_updated_at, updated_at, id] = args as string[];
						const row = assets.find((a) => a.id === id);
						if (row) {
							row.stage = stage;
							row.stage_updated_at = stage_updated_at;
							row.updated_at = updated_at;
						}
						return {};
					}
					throw new Error(`unexpected run(): ${sql}`);
				},
			};
		},
	};
	return db as unknown as D1Database;
}

describe("sponsorship asset lifecycle", () => {
	it("has seven stages with labels", () => {
		expect(SPONSORSHIP_ASSET_STAGES).toEqual([
			"draft",
			"packaged",
			"offered",
			"negotiating",
			"committed",
			"fulfilled",
			"renewal",
		]);
		for (const s of SPONSORSHIP_ASSET_STAGES) {
			expect(SPONSORSHIP_ASSET_STAGE_LABELS[s]).toBeTruthy();
		}
	});

	it("walks the full forward path", () => {
		const path: Array<[string, string]> = [
			["draft", "packaged"],
			["packaged", "offered"],
			["offered", "negotiating"],
			["negotiating", "committed"],
			["committed", "fulfilled"],
			["fulfilled", "renewal"],
		];
		for (const [from, to] of path) {
			const r = transitionSponsorshipAsset(from, to);
			expect(r.ok).toBe(true);
			expect(r.to).toBe(to);
		}
	});

	it("allows one-step corrections backward", () => {
		expect(transitionSponsorshipAsset("packaged", "draft").ok).toBe(true);
		expect(transitionSponsorshipAsset("offered", "packaged").ok).toBe(true);
		expect(transitionSponsorshipAsset("fulfilled", "committed").ok).toBe(true);
	});

	it("rejects stage skips with the allowed moves", () => {
		const r = transitionSponsorshipAsset("draft", "offered");
		expect(r.ok).toBe(false);
		expect(r.reason).toContain("packaged");
	});

	it("treats renewal as terminal", () => {
		expect(allowedSponsorshipAssetTransitions("renewal")).toEqual([]);
		expect(transitionSponsorshipAsset("renewal", "draft").ok).toBe(false);
	});

	it("rejects unknown stages", () => {
		expect(transitionSponsorshipAsset("draft", "sold").ok).toBe(false);
		expect(transitionSponsorshipAsset("nope", "draft").ok).toBe(false);
		expect(isSponsorshipAssetStage("sold")).toBe(false);
	});

	it("accepts a no-op transition", () => {
		const r = transitionSponsorshipAsset("offered", "offered");
		expect(r.ok).toBe(true);
		expect(r.to).toBe("offered");
	});

	it("has a next action for every stage", () => {
		for (const s of SPONSORSHIP_ASSET_STAGES) {
			expect(sponsorshipAssetNextAction(s).length).toBeGreaterThan(0);
		}
	});
});

describe("package builder", () => {
	it("builds the Series 2026 package from verified facts", () => {
		const pkg = buildSponsorshipAssetPackage({
			object_type: "series",
			object_id: "SERIES_2026",
			name: "NWANA Series 2026",
			description: "The NWANA virtual race series.",
		});
		expect(pkg.title).toContain("NWANA Series 2026");
		expect(pkg.description).toContain("The NWANA virtual race series.");
		expect(pkg.audience.length).toBeGreaterThan(0);
		expect(pkg.delivers).toContain("Distance Partner");
		expect(pkg.reference_pricing).toContain("Reference");
		expect(pkg.reference_pricing).toContain("$25,000");
		expect(pkg.reference_pricing).toContain("$3,000");
		expect(pkg.reference_pricing).toContain("2026-12-31");
	});

	it("builds the Fund package with TBD pricing, never invented numbers", () => {
		const pkg = buildSponsorshipAssetPackage({
			object_type: "fund",
			object_id: "fund-50k-bridge-sprint",
			name: "$50K Manhattan HQ Bridge Sprint",
			description: "Founding capital to build the NWANA federation machine.",
		});
		expect(pkg.title).toContain("$50K Manhattan HQ Bridge Sprint");
		expect(pkg.reference_pricing).toContain("TBD");
		expect(pkg.reference_pricing).not.toContain("$25,000");
		expect(pkg.delivers).toContain("Social-impact");
	});
});

describe("generateSponsorshipAsset", () => {
	it("rejects unknown object types without guessing", async () => {
		const r = await generateSponsorshipAsset(makeDb(), "challenge", "x1");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toContain("Unknown object type");
	});

	it("rejects unknown series", async () => {
		const r = await generateSponsorshipAsset(makeDb(), "series", "SERIES_2027");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toContain("SERIES_2026");
	});

	it("rejects a missing fund", async () => {
		const r = await generateSponsorshipAsset(makeDb(), "fund", "fund-nope");
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.error).toContain("not found");
	});

	it("requires object_type and object_id", async () => {
		const r = await generateSponsorshipAsset(makeDb(), "", "");
		expect(r.ok).toBe(false);
	});

	it("generates a fund asset once and returns it on repeat", async () => {
		const db = makeDb();
		const first = await generateSponsorshipAsset(db, "fund", "fund-50k-bridge-sprint");
		expect(first.ok).toBe(true);
		if (!first.ok) throw new Error("expected ok");
		expect(first.generated).toBe(true);
		expect(first.asset.stage).toBe("draft");
		expect(first.asset.title).toContain("$50K Manhattan HQ Bridge Sprint");
		expect(first.asset.reference_pricing).toContain("TBD");

		const second = await generateSponsorshipAsset(db, "fund", "fund-50k-bridge-sprint");
		expect(second.ok).toBe(true);
		if (!second.ok) throw new Error("expected ok");
		expect(second.generated).toBe(false);
		expect(second.asset.id).toBe(first.asset.id);

		const view = await getSponsorshipAssetsView(db);
		expect(view.assets).toHaveLength(1);
		expect(view.assets[0].next_action.length).toBeGreaterThan(0);
	});

	it("generates the Series 2026 asset with the reference grid", async () => {
		const db = makeDb();
		const r = await generateSponsorshipAsset(db, "series", "SERIES_2026");
		expect(r.ok).toBe(true);
		if (!r.ok) throw new Error("expected ok");
		expect(r.generated).toBe(true);
		expect(r.asset.reference_pricing).toContain("$25,000");
	});
});

describe("advanceSponsorshipAsset", () => {
	it("advances along the allowed path and rejects skips", async () => {
		const db = makeDb();
		const g = await generateSponsorshipAsset(db, "fund", "fund-50k-bridge-sprint");
		if (!g.ok) throw new Error("expected ok");
		const id = g.asset.id;

		const bad = await advanceSponsorshipAsset(db, id, "offered");
		expect(bad.ok).toBe(false);
		if (!bad.ok) expect(bad.error).toContain("packaged");

		const good = await advanceSponsorshipAsset(db, id, "packaged");
		expect(good.ok).toBe(true);
		if (!good.ok) throw new Error("expected ok");
		expect(good.asset.stage).toBe("packaged");
	});

	it("walks to renewal and stops there", async () => {
		const db = makeDb();
		const g = await generateSponsorshipAsset(db, "series", "SERIES_2026");
		if (!g.ok) throw new Error("expected ok");
		const id = g.asset.id;
		for (const s of ["packaged", "offered", "negotiating", "committed", "fulfilled", "renewal"]) {
			const r = await advanceSponsorshipAsset(db, id, s);
			expect(r.ok).toBe(true);
		}
		const stuck = await advanceSponsorshipAsset(db, id, "draft");
		expect(stuck.ok).toBe(false);
	});

	it("rejects an unknown asset", async () => {
		const r = await advanceSponsorshipAsset(makeDb(), "sasset-fund-nope", "packaged");
		expect(r.ok).toBe(false);
	});
});
