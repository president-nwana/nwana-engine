// Registry summary layer (cabinet read-path fix, 2026-10-19; round 2
// the same day: single-pass rebuild + incremental loader deltas).
//
// Contracts under test:
//  1. refreshRegistrySummary populates registry_summary with totals
//     computed by real filtering over a small fixture world (and is
//     idempotent: a second refresh rewrites the same 13 metric rows).
//     These expectations are the cd6d628 (round-1) outputs on this
//     fixture world — the round-2 single-pass aggregates must
//     reproduce them EXACTLY (equivalence is additionally proven on
//     the volume replica, REPORT-ROUND2.md).
//  2. The rebuild is structurally single-pass: exactly one scan
//     statement per big table (asserted over the prepared SQL).
//  3. Cabinet views READ the summary: with an empty summary they render
//     the honest "not computed yet" state (zeros + registry_summary
//     meta 'missing') instead of rescanning the registry, and after a
//     refresh they report the fixture totals with meta 'ok'.
//  4. applyRegistryDelta (the loader path) lands exactly where a full
//     rebuild of the extended world lands.

import { describe, expect, it } from "vitest";
import {
	applyRegistryDelta,
	mergeRegistryDelta,
	refreshRegistrySummary,
	getRegistrySummaryStatus,
	type RegistryDelta,
} from "../src/registry-summary";
import {
	getCabinetView,
	getFundingPipeline,
	getGroupsRegistryView,
	getPeopleView,
	getTerritoryBudgets,
} from "../src/operating-center-cabinet";

const FL_FRAGMENT = "IN (SELECT territory_id FROM territories WHERE territory_id = 'terr-st-12' OR state_fips = '12')";

interface TerrRow {
	territory_id: string;
	type: string;
	state_fips: string | null;
}

const TERRITORIES: TerrRow[] = [
	{ territory_id: "terr-continental-nwana", type: "CONTINENTAL", state_fips: null },
	{ territory_id: "terr-us", type: "NATIONAL", state_fips: null },
	{ territory_id: "terr-st-12", type: "STATE", state_fips: "12" },
	{ territory_id: "terr-county-fl-1", type: "COUNTY", state_fips: "12" },
	{ territory_id: "terr-city-fl-1", type: "CITY", state_fips: "12" },
	{ territory_id: "terr-st-06", type: "STATE", state_fips: "06" },
];
const GROUPS = [
	{ territory_id: "terr-city-fl-1", status: "FORMING", is_default: 1 },
	{ territory_id: "terr-county-fl-1", status: "FORMING", is_default: 1 },
	{ territory_id: "terr-st-06", status: "ACTIVE", is_default: 0 },
];
const TEMPLATES: Record<string, { title: string; scope_type: string }> = {
	president: { title: "President", scope_type: "CONTINENTAL" },
	state_coordinator: { title: "State Coordinator", scope_type: "STATE" },
	group_director: { title: "Group Director", scope_type: "GROUP" },
};
const ROLES = [
	{ territory_id: "terr-continental-nwana", template_id: "president", status: "PLANNED" },
	{ territory_id: "terr-st-12", template_id: "state_coordinator", status: "PLANNED" },
	{ territory_id: "terr-city-fl-1", template_id: "group_director", status: "PLANNED" },
	{ territory_id: "terr-st-06", template_id: "state_coordinator", status: "ASSIGNED" },
];
const PROSPECTS = [
	{ id: 1, territory_id: "terr-city-fl-1", track: "sponsor-kilometers", contact_level: "A1", sequence_enrolled_at: "2026-10-13T00:00:00Z" },
	{ id: 2, territory_id: "terr-st-06", track: "instructor-training", contact_level: "B", sequence_enrolled_at: null as string | null },
];
const SENDS = [{ prospect_id: 1 }];
const REPLIES = [{ prospect_id: 1 }];
const MONEY = [
	{ event_type: "donation_received", funding_lane: "donation", gross_status: "VERIFIED", gross_cents: 500, territory_id: "terr-city-fl-1" },
	{ event_type: "fundraiser_received", funding_lane: "fundraising", gross_status: "VERIFIED", gross_cents: 300, territory_id: "terr-city-fl-1" },
];

const inFlSubtree = (territories: TerrRow[], territoryId: string): boolean => {
	if (territoryId === "terr-st-12") return true;
	return territories.find((t) => t.territory_id === territoryId)?.state_fips === "12";
};

interface FixtureWorld {
	territories: TerrRow[];
	groups: typeof GROUPS;
	roles: typeof ROLES;
	prospects: typeof PROSPECTS;
	sends: typeof SENDS;
	replies: typeof REPLIES;
	money: typeof MONEY;
}

const BASE_WORLD: FixtureWorld = {
	territories: TERRITORIES,
	groups: GROUPS,
	roles: ROLES,
	prospects: PROSPECTS,
	sends: SENDS,
	replies: REPLIES,
	money: MONEY,
};

function groupCount<T>(rows: T[], key: (r: T) => string): Array<{ k: string; n: number }> {
	const map = new Map<string, number>();
	for (const r of rows) map.set(key(r), (map.get(key(r)) ?? 0) + 1);
	return [...map.entries()].map(([k, n]) => ({ k, n })).sort((a, b) => (a.k < b.k ? -1 : 1));
}

function makeDb(world: FixtureWorld = BASE_WORLD) {
	const store = new Map<string, { scope: string; metric: string; payload: string; computed_at: string }>();
	const prepared: string[] = [];
	const T = world.territories;
	const G = world.groups;
	const R = world.roles;
	const P = world.prospects;
	const S = world.sends;
	const RP = world.replies;
	const M = world.money;
	const inFl = (territoryId: string): boolean => inFlSubtree(T, territoryId);

	const first = (sql: string, binds: unknown[]): unknown => {
		if (sql.includes("AS replies")) {
			// Round-2 refresh: sent/replies distinct counts in ONE statement.
			const flProspects = new Set(P.filter((p) => inFl(p.territory_id)).map((p) => p.id));
			return {
				sent: new Set(S.filter((s) => flProspects.has(s.prospect_id)).map((s) => s.prospect_id)).size,
				replies: new Set(RP.filter((r) => flProspects.has(r.prospect_id)).map((r) => r.prospect_id)).size,
			};
		}
		if (sql.includes("COUNT(DISTINCT s.prospect_id)")) {
			return { n: new Set(S.filter((s) => inFl(P.find((p) => p.id === s.prospect_id)!.territory_id)).map((s) => s.prospect_id)).size };
		}
		if (sql.includes("COUNT(DISTINCT r.prospect_id)")) {
			return { n: new Set(RP.filter((r) => inFl(P.find((p) => p.id === r.prospect_id)!.territory_id)).map((r) => r.prospect_id)).size };
		}
		if (sql.includes("FROM role_instances")) {
			let rows = R;
			if (sql.includes("status = 'PLANNED'")) rows = rows.filter((r) => r.status === "PLANNED");
			if (sql.includes(FL_FRAGMENT)) rows = rows.filter((r) => inFl(r.territory_id));
			else if (binds.length) rows = rows.filter((r) => binds.includes(r.territory_id));
			return { n: rows.length };
		}
		if (sql.includes("FROM outreach_prospects")) {
			let rows = P;
			if (sql.includes("contact_level IN ('A1', 'A2')")) rows = rows.filter((p) => p.contact_level === "A1" || p.contact_level === "A2");
			if (sql.includes("sequence_enrolled_at IS NOT NULL")) {
				rows = rows.filter((p) => p.sequence_enrolled_at !== null);
				if (sql.includes("NOT IN (SELECT prospect_id FROM outreach_sends")) {
					rows = rows.filter((p) => !S.some((s) => s.prospect_id === p.id));
				}
			}
			if (sql.includes(FL_FRAGMENT)) rows = rows.filter((p) => inFl(p.territory_id));
			return { n: rows.length };
		}
		return null;
	};

	const all = (sql: string, binds: unknown[]): unknown[] => {
		if (sql.includes("FROM registry_summary")) return [...store.values()];
		// --- Round-2 single-pass refresh statements (real filtering) ---
		if (sql.includes("GROUP_CONCAT")) {
			// Territories: one GROUP BY type scan (national + FL + roots).
			return groupCount(T, (t) => t.type).map((g) => {
				const ofType = T.filter((t) => t.type === g.k);
				return {
					k: g.k,
					n: g.n,
					fl_n: ofType.filter((t) => inFl(t.territory_id)).length,
					root_ids:
						g.k === "CONTINENTAL" || g.k === "NATIONAL"
							? ofType.map((t) => t.territory_id).join(",")
							: null,
				};
			});
		}
		if (sql.includes("FROM role_templates")) {
			return Object.entries(TEMPLATES).map(([template_id, t]) => ({
				template_id,
				title: t.title,
				scope_type: t.scope_type,
			}));
		}
		if (sql.includes("FROM nw_groups") && sql.includes("LEFT JOIN fl")) {
			return groupCount(G, (g) => g.status).map((g) => {
				const ofStatus = G.filter((x) => x.status === g.k);
				return {
					k: g.k,
					n: g.n,
					defaults: ofStatus.filter((x) => x.is_default === 1).length,
					fl_n: ofStatus.filter((x) => inFl(x.territory_id)).length,
					fl_defaults: ofStatus.filter((x) => x.is_default === 1 && inFl(x.territory_id)).length,
				};
			});
		}
		if (sql.includes("FROM role_instances") && sql.includes("GROUP BY r.template_id, r.status")) {
			const map = new Map<string, { template_id: string; status: string; n: number; fl_n: number; hq_n: number }>();
			for (const r of R) {
				const key = `${r.template_id}|${r.status}`;
				const cur = map.get(key) ?? { template_id: r.template_id, status: r.status, n: 0, fl_n: 0, hq_n: 0 };
				cur.n += 1;
				if (inFl(r.territory_id)) cur.fl_n += 1;
				if (binds.includes(r.territory_id)) cur.hq_n += 1;
				map.set(key, cur);
			}
			return [...map.values()];
		}
		if (sql.includes("FROM outreach_prospects") && sql.includes("contact_level AS k")) {
			return groupCount(P, (p) => p.contact_level).map((g) => ({
				k: g.k,
				n: g.n,
				enrolled: P.filter((p) => p.contact_level === g.k && p.sequence_enrolled_at !== null).length,
			}));
		}
		if (sql.includes("FROM outreach_prospects") && sql.includes("track AS k")) {
			const rows = P.filter((p) => inFl(p.territory_id));
			return groupCount(rows, (p) => p.track).map((g) => ({
				k: g.k,
				n: g.n,
				qualified: rows.filter((p) => p.track === g.k && (p.contact_level === "A1" || p.contact_level === "A2")).length,
			}));
		}
		// --- View-path statements (unchanged shapes) ---
		if (sql.startsWith("SELECT type, COUNT(*) AS n FROM territories")) {
			const rows = sql.includes("state_fips = '12'") ? T.filter((t) => inFl(t.territory_id)) : T;
			return groupCount(rows, (t) => t.type).map((g) => ({ type: g.k, n: g.n }));
		}
		if (sql.includes("FROM territories WHERE type IN") || sql.includes("OR type IN ('CONTINENTAL', 'NATIONAL')")) {
			return T.filter((t) => t.type === "CONTINENTAL" || t.type === "NATIONAL").map((t) => ({
				territory_id: t.territory_id,
				type: t.type,
			}));
		}
		if (sql.includes("FROM territories WHERE type = 'STATE'")) {
			return T.filter((t) => t.type === "STATE").map((t) => ({ territory_id: t.territory_id }));
		}
		if (sql.includes("FROM nw_groups") && sql.includes("GROUP BY status")) {
			const rows = sql.includes(FL_FRAGMENT) ? G.filter((g) => inFl(g.territory_id)) : G;
			return groupCount(rows, (g) => g.status).map((g) => ({
				status: g.k,
				n: g.n,
				defaults: rows.filter((r) => r.status === g.k && r.is_default === 1).length,
			}));
		}
		if (sql.includes("FROM role_instances") && sql.includes("GROUP BY status")) {
			return groupCount(R, (r) => r.status).map((g) => ({ status: g.k, n: g.n }));
		}
		if (sql.includes("FROM role_instances") && sql.includes("GROUP BY r.template_id, t.title, t.scope_type")) {
			// HQ by-template (checked first: its fragment extends the FL one).
			const rows = R.filter((r) => binds.includes(r.territory_id));
			return groupCount(rows, (r) => r.template_id).map((g) => ({
				template_id: g.k,
				title: TEMPLATES[g.k].title,
				scope_type: TEMPLATES[g.k].scope_type,
				n: g.n,
			}));
		}
		if (sql.includes("FROM role_instances") && sql.includes("GROUP BY r.template_id, t.title")) {
			// Florida by-template (LEFT JOIN in the refresh SQL).
			const rows = R.filter((r) => inFl(r.territory_id));
			return groupCount(rows, (r) => r.template_id).map((g) => ({
				template_id: g.k,
				title: TEMPLATES[g.k]?.title ?? null,
				n: g.n,
			}));
		}
		if (sql.includes("FROM role_instances") && sql.includes("GROUP BY t.scope_type")) {
			let rows = R;
			if (sql.includes("r.status = 'PLANNED'")) rows = rows.filter((r) => r.status === "PLANNED");
			if (sql.includes("r.territory_id IN (SELECT territory_id FROM territories")) rows = rows.filter((r) => inFl(r.territory_id));
			if (binds.length) rows = rows.filter((r) => binds.includes(r.territory_id));
			return groupCount(rows, (r) => TEMPLATES[r.template_id].scope_type).map((g) => ({ scope_type: g.k, n: g.n }));
		}
		if (sql.includes("FROM outreach_prospects") && sql.includes("GROUP BY contact_level")) {
			return groupCount(P, (p) => p.contact_level).map((g) => ({ contact_level: g.k, n: g.n }));
		}
		if (sql.includes("FROM outreach_prospects") && sql.includes("GROUP BY track")) {
			const rows = P.filter((p) => inFl(p.territory_id));
			return groupCount(rows, (p) => p.track).map((g) => ({ track: g.k, n: g.n }));
		}
		if (sql.includes("FROM money_events") && sql.includes("GROUP BY event_type, funding_lane")) {
			let rows = M.filter((m) => binds.includes(m.event_type));
			if (sql.includes("gross_status = 'VERIFIED'")) rows = rows.filter((m) => m.gross_status === "VERIFIED");
			if (sql.includes(FL_FRAGMENT)) rows = rows.filter((m) => m.territory_id !== null && inFl(m.territory_id));
			else if (binds.some((b) => typeof b === "string" && String(b).startsWith("terr-"))) {
				rows = rows.filter((m) => binds.includes(m.territory_id));
			}
			const map = new Map<string, { event_type: string; funding_lane: string | null; events: number; cents: number }>();
			for (const m of rows) {
				const key = `${m.event_type}|${m.funding_lane}`;
				const cur = map.get(key) ?? { event_type: m.event_type, funding_lane: m.funding_lane, events: 0, cents: 0 };
				cur.events += 1;
				cur.cents += m.gross_cents;
				map.set(key, cur);
			}
			return [...map.values()];
		}
		return [];
	};

	const makeStmt = (sql: string, binds: unknown[] = []) => ({
		bind: (...b: unknown[]) => makeStmt(sql, b),
		first: async () => first(sql, binds),
		all: async () => ({ results: all(sql, binds) }),
		run: async () => {
			if (sql.startsWith("INSERT INTO registry_summary")) {
				const [scope, metric, payload, computed_at] = binds as [string, string, string, string];
				store.set(`${scope}:${metric}`, { scope, metric, payload, computed_at });
			}
			return { success: true };
		},
	});
	const db = {
		prepare: (sql: string) => {
			prepared.push(sql);
			return makeStmt(sql);
		},
		batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
			const out: unknown[] = [];
			for (const s of stmts) out.push(await s.run());
			return out;
		},
	} as unknown as D1Database;
	return { db, store, prepared };
}

describe("registry summary refresh", () => {
	it("populates every metric with fixture-true totals and is idempotent", async () => {
		const { db, store } = makeDb();
		const result = await refreshRegistrySummary(db, "2026-10-19T05:00:00.000Z");
		expect(result.ok).toBe(true);
		expect(result.operation).toBe("emergency_recount");
		expect(result.pass_counts).toEqual({ territories: 1, nw_groups: 1, role_instances: 1 });
		expect(result.rows_examined_estimate).toBeGreaterThan(0);
		expect(result.metrics_written).toBe(13);
		expect(store.size).toBe(13);

		const payload = (key: string) => JSON.parse(store.get(key)!.payload);
		expect(payload("national:territories_by_type")).toEqual({
			total: 6,
			by_type: { CITY: 1, CONTINENTAL: 1, COUNTY: 1, NATIONAL: 1, STATE: 2 },
		});
		expect(payload("florida:territories_by_type").total).toBe(3);
		expect(payload("national:groups_by_status")).toEqual({
			total: 3,
			by_status: { ACTIVE: 1, FORMING: 2 },
			defaults: 2,
			forming: 2,
			active: 1,
		});
		expect(payload("florida:groups_by_status").total).toBe(2);
		expect(payload("national:roles")).toEqual({
			total: 4,
			by_status: { ASSIGNED: 1, PLANNED: 3 },
			by_scope: { CONTINENTAL: 1, GROUP: 1, STATE: 2 },
		});
		expect(payload("florida:roles").total).toBe(2);
		expect(payload("florida:roles").by_scope).toEqual({ GROUP: 1, STATE: 1 });
		expect(payload("hq:roles").by_template).toEqual([
			{ template_id: "president", title: "President", scope_type: "CONTINENTAL", n: 1 },
		]);
		expect(payload("national:roles_planned")).toEqual({ roles_planned: 3, by_scope: { CONTINENTAL: 1, GROUP: 1, STATE: 1 } });
		expect(payload("florida:roles_planned").roles_planned).toBe(2);
		expect(payload("hq:roles_planned").roles_planned).toBe(1);
		expect(payload("national:outreach")).toEqual({
			prospects_total: 2,
			prospects_by_tier: { A1: 1, B: 1 },
			prospects_enrolled: 1,
		});
		expect(payload("florida:outreach")).toEqual({
			prospects_total: 1,
			prospects_by_track: { "sponsor-kilometers": 1 },
			prospects_sent: 1,
			prospects_replies: 1,
			prospects_qualified: 1,
		});
		expect(payload("florida:received_by_lane")).toEqual({ lanes: [{ lane: "donation", events: 1, cents: 500 }] });

		const status = await getRegistrySummaryStatus(db);
		expect(status.metrics).toHaveLength(13);
		expect(status.computed_at).toBe("2026-10-19T05:00:00.000Z");

		const again = await refreshRegistrySummary(db, "2026-10-19T06:00:00.000Z");
		expect(again.metrics_written).toBe(13);
		expect(store.size).toBe(13);
		expect(store.get("national:roles")!.computed_at).toBe("2026-10-19T06:00:00.000Z");
	});

	it("rebuild is structurally single-pass: one scan statement per big table", async () => {
		const { db, prepared } = makeDb();
		await refreshRegistrySummary(db, "2026-10-19T05:00:00.000Z");
		// role_instances: exactly one statement scans it (the grouped
		// template/status pass); nw_groups likewise; territories are
		// scanned once by the GROUP_CONCAT statement (the other
		// mentions are the shared MATERIALIZED subtree CTE).
		expect(prepared.filter((s) => s.includes("FROM role_instances r"))).toHaveLength(1);
		expect(prepared.filter((s) => s.includes("FROM nw_groups g"))).toHaveLength(1);
		expect(prepared.filter((s) => s.includes("GROUP_CONCAT"))).toHaveLength(1);
		const selects = prepared.filter((s) => !s.startsWith("INSERT INTO registry_summary"));
		expect(selects).toHaveLength(8);
	});
});

describe("cabinet views on the summary path", () => {
	it("render the honest missing state (zeros + meta) when the summary is empty", async () => {
		const { db } = makeDb();
		const people = await getPeopleView(db);
		expect(people.roles.total).toBe(0);
		expect(people.florida_roles.total).toBe(0);
		expect(people.registry_summary.status).toBe("missing");
		expect(people.registry_summary.note).toContain("registry-summary/refresh");

		const groups = await getGroupsRegistryView(db);
		expect(groups.territories_total).toBe(0);
		expect(groups.groups.total).toBe(0);
		expect(groups.florida.groups_total).toBe(0);
		expect(groups.registry_summary.status).toBe("missing");

		const budgets = await getTerritoryBudgets(db);
		for (const scope of budgets.scopes) expect(scope.need.roles_planned).toBe(0);
		expect(budgets.registry_summary.status).toBe("missing");

		const cabinet = await getCabinetView(db);
		expect(cabinet.florida.territories_total).toBe(0);
		expect(cabinet.national.prospects_total).toBe(0);
		expect(cabinet.registry_summary.status).toBe("missing");
	});

	it("report fixture totals after a refresh, with meta ok", async () => {
		const { db } = makeDb();
		await refreshRegistrySummary(db, "2026-10-19T05:00:00.000Z");

		const people = await getPeopleView(db);
		expect(people.roles.total).toBe(4);
		expect(people.roles.by_status).toEqual({ ASSIGNED: 1, PLANNED: 3 });
		expect(people.florida_roles.total).toBe(2);
		expect(people.florida_roles.by_template.map((t) => t.template_id)).toEqual(["group_director", "state_coordinator"]);
		expect(people.hq_roles).toHaveLength(1);
		expect(people.registry_summary.status).toBe("ok");
		expect(people.registry_summary.computed_at).toBe("2026-10-19T05:00:00.000Z");

		const groups = await getGroupsRegistryView(db);
		expect(groups.territories_total).toBe(6);
		expect(groups.florida.territories_total).toBe(3);
		expect(groups.groups.total).toBe(3);
		expect(groups.florida.groups_total).toBe(2);
		expect(groups.registry_summary.status).toBe("ok");

		const budgets = await getTerritoryBudgets(db);
		const byKey = Object.fromEntries(budgets.scopes.map((s) => [s.key, s]));
		expect(byKey.florida.need.roles_planned).toBe(2);
		expect(byKey.headquarters.need.roles_planned).toBe(1);
		expect(byKey.national.need.roles_planned).toBe(3);
		expect(byKey.florida.coverage.total_cents).toBe(500);
		expect(budgets.registry_summary.status).toBe("ok");

		const cabinet = await getCabinetView(db);
		expect(cabinet.florida.territories_total).toBe(3);
		expect(cabinet.national.territories_total).toBe(6);
		expect(cabinet.florida.prospects.total).toBe(1);
		expect(cabinet.florida.roles_planned).toBe(2);
		expect(cabinet.national.prospects_total).toBe(2);
		expect(cabinet.national.tiers.A1).toBe(1);
		expect(cabinet.registry_summary.status).toBe("ok");

		const funding = await getFundingPipeline(db);
		const fl = Object.fromEntries(funding.florida_stages.map((s) => [s.key, s.n]));
		expect(fl.found).toBe(1);
		expect(fl.qualified).toBe(1);
		expect(fl.sent).toBe(1);
		expect(fl.dialogue).toBe(1);
		expect(funding.florida_stages.find((s) => s.key === "received")!.by_lane).toEqual({
			donation: { events: 1, gross_cents: 500 },
		});
		expect(funding.registry_summary.status).toBe("ok");
	});
});

describe("registry delta (incremental loader path)", () => {
	// A synthetic controlled load: one new Florida city territory, its
	// default FORMING group, and two PLANNED roles inside Florida.
	const delta: RegistryDelta = {
		territories: { by_type: { CITY: 1 }, florida_by_type: { CITY: 1 } },
		groups: {
			by_status: { FORMING: 1 },
			florida_by_status: { FORMING: 1 },
			defaults: 1,
			florida_defaults: 1,
		},
		roles_by_status: { PLANNED: 2 },
		roles_by_scope: { GROUP: 1, STATE: 1 },
		roles_florida_total: 2,
		roles_florida_by_scope: { GROUP: 1, STATE: 1 },
		roles_florida_by_template: { group_director: 1, state_coordinator: 1 },
		planned: {
			total: 2,
			florida_total: 2,
			hq_total: 0,
			by_scope: { GROUP: 1, STATE: 1 },
			florida_by_scope: { GROUP: 1, STATE: 1 },
			hq_by_scope: {},
		},
	};
	const extendedWorld: FixtureWorld = {
		...BASE_WORLD,
		territories: [...TERRITORIES, { territory_id: "terr-city-fl-2", type: "CITY", state_fips: "12" }],
		groups: [...GROUPS, { territory_id: "terr-city-fl-2", status: "FORMING", is_default: 1 }],
		roles: [
			...ROLES,
			{ territory_id: "terr-city-fl-2", template_id: "group_director", status: "PLANNED" },
			{ territory_id: "terr-st-12", template_id: "state_coordinator", status: "PLANNED" },
		],
	};

	it("applyRegistryDelta lands exactly where a full rebuild of the extended world lands", async () => {
		const a = makeDb();
		await refreshRegistrySummary(a.db, "2026-10-19T05:00:00.000Z");
		const res = await applyRegistryDelta(a.db, delta, "2026-10-19T07:00:00.000Z");
		expect(res.operation).toBe("incremental_delta");
		expect(res.metrics_written).toBe(13);

		const b = makeDb(extendedWorld);
		await refreshRegistrySummary(b.db, "2026-10-19T07:00:00.000Z");

		expect(a.store.size).toBe(13);
		for (const key of [...b.store.keys()]) {
			expect(JSON.parse(a.store.get(key)!.payload), key).toEqual(
				JSON.parse(b.store.get(key)!.payload),
			);
		}
		const roles = JSON.parse(a.store.get("national:roles")!.payload);
		expect(roles.total).toBe(6);
		expect(roles.by_status).toEqual({ ASSIGNED: 1, PLANNED: 5 });
		const flRoles = JSON.parse(a.store.get("florida:roles")!.payload);
		expect(flRoles.total).toBe(4);
		expect(flRoles.by_template).toEqual([
			{ template_id: "group_director", title: "Group Director", n: 2 },
			{ template_id: "state_coordinator", title: "State Coordinator", n: 2 },
		]);
	});

	it("mergeRegistryDelta is pure and carries untouched metrics over", () => {
		const current = new Map<string, unknown>([
			["national:territories_by_type", { total: 1, by_type: { CITY: 1 } }],
			["florida:outreach", { prospects_total: 1 }],
		]);
		const merged = mergeRegistryDelta(current, { territories: { by_type: { CITY: 2 } } });
		expect(merged.get("national:territories_by_type")).toEqual({
			total: 3,
			by_type: { CITY: 3 },
		});
		expect(merged.get("florida:outreach")).toEqual({ prospects_total: 1 });
		// Input map is not mutated.
		expect(current.get("national:territories_by_type")).toEqual({
			total: 1,
			by_type: { CITY: 1 },
		});
	});
});
