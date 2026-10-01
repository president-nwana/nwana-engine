// Multi-tenant layer tests: tenant/business-unit creation, tenant
// isolation, money derivation honesty (no synthetic data).
//
// The D1 stub emulates exactly the statements issued by
// src/lib/tenants.ts and the two revenue-inventory reads it reuses
// (getRevenueObject + its money rollup), same approach as
// test/money-ingestion.spec.ts.

import { describe, expect, it } from "vitest";

import {
	createBusinessUnit,
	createTenant,
	getBusinessUnit,
	getBusinessUnitDetail,
	getTenant,
	listBusinessUnits,
	listTenants,
} from "../src/lib/tenants";
import type { RevenueMoneyRollup } from "../src/lib/revenue-inventory";

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();

const TENANT_COLS = [
	"tenant_id", "legal_name", "display_name", "organization_type", "sport_domain",
	"status", "branding", "owner_admin", "external_systems",
	"plan_license_status", "enabled_modules", "license_start", "license_end",
	"billing_model", "white_label",
];
const UNIT_COLS = [
	"business_unit_id", "tenant_id", "unit_type", "name",
	"operating_status", "legal_entity_status", "owner_legal_ref", "revenue_model",
	"connected_assets", "connected_integrations", "next_actions",
];

function makeDb() {
	const tenants = new Map<string, Record<string, unknown>>();
	const units = new Map<string, Record<string, unknown>>();
	// object_key -> revenue_objects row (only fields getRevenueObject needs).
	const revenueObjects = new Map<string, Record<string, unknown>>();
	// sorted event_types join(",") -> canned money rollup.
	const moneyByEvents = new Map<string, RevenueMoneyRollup | null>();
	let seriesRegistrations = 0;

	const rowFrom = (cols: string[], args: unknown[]) => {
		const row: Record<string, unknown> = {};
		cols.forEach((c, i) => (row[c] = args[i]));
		row.created_at = "2026-10-01T00:00:00Z";
		row.updated_at = "2026-10-01T00:00:00Z";
		return row;
	};

	const db = {
		prepare(sql: string) {
			const s = norm(sql);
			const bound = (args: unknown[]) => {
				return {
					first: async <T>() => {
							if (s.startsWith("SELECT * FROM tenants WHERE tenant_id = ?")) {
								return (tenants.get(String(args[0])) ?? null) as T | null;
							}
							if (s.startsWith("SELECT tenant_id FROM tenants WHERE tenant_id = ?")) {
								const t = tenants.get(String(args[0]));
								return (t ? { tenant_id: t.tenant_id } : null) as T | null;
							}
							if (s.startsWith("SELECT * FROM business_units WHERE business_unit_id = ? AND tenant_id = ?")) {
								const u = units.get(String(args[0]));
								return (u && u.tenant_id === args[1] ? u : null) as T | null;
							}
							if (s.startsWith("SELECT business_unit_id FROM business_units WHERE business_unit_id = ?")) {
								const u = units.get(String(args[0]));
								return (u ? { business_unit_id: u.business_unit_id } : null) as T | null;
							}
							if (s.startsWith("SELECT * FROM revenue_objects WHERE object_key = ?")) {
								return (revenueObjects.get(String(args[0])) ?? null) as T | null;
							}
							if (s.startsWith("SELECT COUNT(DISTINCT transaction_key)")) {
								const key = [...args].map(String).sort().join(",");
								const rollup = moneyByEvents.get(key) ?? null;
								if (!rollup) {
									return {
										transaction_count: 0, gross_cents: 0, refund_cents: 0,
										net_cents: null, revenue_7d_cents: 0,
										revenue_30d_cents: 0, revenue_90d_cents: 0,
									} as T;
								}
								return { ...rollup } as T;
							}
							if (s.startsWith("SELECT COUNT(*) AS n FROM series_registrations")) {
								return { n: seriesRegistrations } as T;
							}
							throw new Error(`stub: unhandled first(): ${s.slice(0, 80)}`);
						},
						all: async <T>() => {
							if (s.startsWith("SELECT * FROM tenants ORDER BY")) {
								const rows = [...tenants.values()].sort((a, b) =>
									String(a.status).localeCompare(String(b.status)) ||
									String(a.tenant_id).localeCompare(String(b.tenant_id)),
								);
								return { results: rows as T[] };
							}
							if (s.startsWith("SELECT * FROM business_units WHERE tenant_id = ? ORDER BY")) {
								const rows = [...units.values()]
									.filter((u) => u.tenant_id === args[0])
									.sort((a, b) => String(a.business_unit_id).localeCompare(String(b.business_unit_id)));
								return { results: rows as T[] };
							}
							if (s.startsWith("SELECT * FROM revenue_object_actions")) {
								return { results: [] as T[] };
							}
							throw new Error(`stub: unhandled all(): ${s.slice(0, 80)}`);
						},
						run: async () => {
							if (s.startsWith("INSERT INTO tenants")) {
								const row = rowFrom(TENANT_COLS, args);
								tenants.set(String(row.tenant_id), row);
								return { success: true };
							}
							if (s.startsWith("INSERT INTO business_units")) {
								const row = rowFrom(UNIT_COLS, args);
								row.money_state = null;
								row.audience_state = null;
								units.set(String(row.business_unit_id), row);
								return { success: true };
							}
							throw new Error(`stub: unhandled run(): ${s.slice(0, 80)}`);
						},
					};
				};
			// D1 allows .first()/.all()/.run() without .bind() for param-less
			// statements (e.g. listTenants, series_registrations count).
			return {
				bind: (...args: unknown[]) => bound(args),
				first: <T,>() => bound([]).first<T>(),
				all: <T,>() => bound([]).all<T>(),
				run: () => bound([]).run(),
			};
		},
	} as unknown as D1Database;

	const seedRevenueObject = (
		objectKey: string,
		eventTypes: string[] | null,
		rollup: RevenueMoneyRollup | null,
	) => {
		revenueObjects.set(objectKey, {
			object_key: objectKey,
			object_type: "DONATION",
			name: objectKey,
			source_platform: null,
			source_object_id: null,
			purchase_url: null,
			price_structure: null,
			active_status: "active",
			monetary_capabilities: null,
			transaction_source: null,
			conversion_event: null,
			conversion_tracking: "unknown",
			automation_capabilities: null,
			acquisition_eligibility: "unknown",
			acquisition_eligibility_reason: null,
			next_revenue_action: null,
			action_status: "none",
			attributable_acquisition_source: null,
			revenue_system: "REVENUE_ENGINE",
			money_link: eventTypes ? JSON.stringify({ event_types: eventTypes }) : null,
			evidence: null,
			created_at: "2026-10-01T00:00:00Z",
			updated_at: "2026-10-01T00:00:00Z",
		});
		if (eventTypes) moneyByEvents.set([...eventTypes].sort().join(","), rollup);
	};

	return { db, tenants, units, seedRevenueObject, moneyByEvents, setSeriesRegistrations: (n: number) => { seriesRegistrations = n; } };
}

const REAL_ROLLUP: RevenueMoneyRollup = {
	transaction_count: 1,
	gross_cents: 500,
	refund_cents: 0,
	net_cents: null, // no settlement truth — must stay UNKNOWN, never 0-filled
	revenue_7d_cents: 500,
	revenue_30d_cents: 500,
	revenue_90d_cents: 500,
};

describe("tenant creation", () => {
	it("creates a tenant and reads it back with derived units", async () => {
		const { db } = makeDb();
		const t = await createTenant(db, {
			tenant_id: "demo-ski-org",
			legal_name: "Demo Ski Organization",
			display_name: "Demo Ski Org",
			sport_domain: "skiing",
			status: "demo",
			enabled_modules: ["membership", "events"],
			white_label: true,
		});
		expect(t.tenant_id).toBe("demo-ski-org");
		expect(t.sport_domain).toBe("skiing");
		expect(t.white_label).toBe(true);
		const full = await getTenant(db, "demo-ski-org");
		expect(full?.business_units).toEqual([]);
		expect(await listTenants(db)).toHaveLength(1);
	});

	it("rejects duplicate tenant ids", async () => {
		const { db } = makeDb();
		await createTenant(db, { tenant_id: "t1", legal_name: "L", display_name: "D" });
		await expect(
			createTenant(db, { tenant_id: "t1", legal_name: "L2", display_name: "D2" }),
		).rejects.toThrow("already exists");
	});

	it("rejects malformed tenant ids and statuses", async () => {
		const { db } = makeDb();
		await expect(
			createTenant(db, { tenant_id: "Bad_ID!", legal_name: "L", display_name: "D" }),
		).rejects.toThrow("invalid tenant_id");
		await expect(
			createTenant(db, {
				tenant_id: "t2", legal_name: "L", display_name: "D",
				status: "bogus" as never,
			}),
		).rejects.toThrow("invalid status");
	});

	it("returns null for unknown tenants", async () => {
		const { db } = makeDb();
		expect(await getTenant(db, "nope")).toBeNull();
	});
});

describe("business unit creation", () => {
	it("enables units on an existing tenant, including custom unit types", async () => {
		const { db } = makeDb();
		await createTenant(db, { tenant_id: "t1", legal_name: "L", display_name: "D" });
		const u = await createBusinessUnit(db, "t1", {
			business_unit_id: "t1-space-logistics",
			unit_type: "SPACE_LOGISTICS", // open vocabulary: no code change needed
			name: "Space Logistics",
			operating_status: "pilot",
			legal_entity_status: "PLANNED",
			next_actions: ["do the thing"],
		});
		expect(u.tenant_id).toBe("t1");
		expect(u.unit_type).toBe("SPACE_LOGISTICS");
		expect(u.legal_entity_status).toBe("PLANNED");
		expect(await listBusinessUnits(db, "t1")).toHaveLength(1);
	});

	it("refuses units on unknown tenants and duplicate unit ids", async () => {
		const { db } = makeDb();
		await expect(
			createBusinessUnit(db, "ghost", {
				business_unit_id: "g1", unit_type: "EVENTS", name: "E",
			}),
		).rejects.toThrow("unknown tenant");
		await createTenant(db, { tenant_id: "t1", legal_name: "L", display_name: "D" });
		await createBusinessUnit(db, "t1", {
			business_unit_id: "u1", unit_type: "EVENTS", name: "E",
		});
		await expect(
			createBusinessUnit(db, "t1", {
				business_unit_id: "u1", unit_type: "MEDIA", name: "M",
			}),
		).rejects.toThrow("already exists");
	});

	it("rejects invalid operating status but accepts any unit_type", async () => {
		const { db } = makeDb();
		await createTenant(db, { tenant_id: "t1", legal_name: "L", display_name: "D" });
		await expect(
			createBusinessUnit(db, "t1", {
				business_unit_id: "u9", unit_type: "EVENTS", name: "E",
				operating_status: "hyper" as never,
			}),
		).rejects.toThrow("invalid operating_status");
	});
});

describe("tenant isolation", () => {
	async function twoTenants() {
		const { db, seedRevenueObject, setSeriesRegistrations } = makeDb();
		await createTenant(db, { tenant_id: "nwana", legal_name: "NWANA", display_name: "NWANA", sport_domain: "nordic_walking" });
		await createTenant(db, { tenant_id: "demo-running-org", legal_name: "Demo", display_name: "Demo", sport_domain: "running", status: "demo" });
		await createBusinessUnit(db, "nwana", {
			business_unit_id: "nwana-governing", unit_type: "GOVERNING_BODY",
			name: "NWANA / Governing Body", operating_status: "operating",
			legal_entity_status: "ACTIVE",
			connected_assets: ["donation:runsignup:212466"],
		});
		await createBusinessUnit(db, "demo-running-org", {
			business_unit_id: "demo-running-membership", unit_type: "MEMBERSHIP",
			name: "Membership", operating_status: "not_operating",
		});
		seedRevenueObject("donation:runsignup:212466", ["donation_received"], REAL_ROLLUP);
		setSeriesRegistrations(7);
		return { db };
	}

	it("lists only the requesting tenant's units", async () => {
		const { db } = await twoTenants();
		const n = await listBusinessUnits(db, "nwana");
		expect(n.map((u) => u.business_unit_id)).toEqual(["nwana-governing"]);
		const d = await listBusinessUnits(db, "demo-running-org");
		expect(d.map((u) => u.business_unit_id)).toEqual(["demo-running-membership"]);
	});

	it("blocks cross-tenant unit reads", async () => {
		const { db } = await twoTenants();
		// Demo tenant must not see NWANA's governing unit — null either way.
		expect(await getBusinessUnit(db, "demo-running-org", "nwana-governing")).toBeNull();
		expect(await getBusinessUnitDetail(db, "demo-running-org", "nwana-governing")).toBeNull();
		// And NWANA cannot reach into the demo tenant's units.
		expect(await getBusinessUnit(db, "nwana", "demo-running-membership")).toBeNull();
	});

	it("getTenant never leaks another tenant's units", async () => {
		const { db } = await twoTenants();
		const demo = await getTenant(db, "demo-running-org");
		expect(demo?.business_units.map((u) => u.business_unit_id)).toEqual([
			"demo-running-membership",
		]);
	});
});

describe("business unit detail honesty", () => {
	it("derives money from linked real assets; net stays UNKNOWN", async () => {
		const { db, seedRevenueObject } = makeDb();
		await createTenant(db, { tenant_id: "nwana", legal_name: "L", display_name: "D" });
		await createBusinessUnit(db, "nwana", {
			business_unit_id: "nwana-governing", unit_type: "GOVERNING_BODY",
			name: "NWANA / Governing Body", operating_status: "operating",
			legal_entity_status: "ACTIVE",
			connected_assets: ["donation:runsignup:212466"],
		});
		seedRevenueObject("donation:runsignup:212466", ["donation_received"], REAL_ROLLUP);
		const detail = await getBusinessUnitDetail(db, "nwana", "nwana-governing");
		expect(detail?.assets).toHaveLength(1);
		expect(detail?.money?.gross_cents).toBe(500);
		expect(detail?.money?.transaction_count).toBe(1);
		// No settlement truth in the source: honest NULL, never 0.
		expect(detail?.money?.net_cents).toBeNull();
	});

	it("shows UNKNOWN money for units with no linked assets (no synthetic data)", async () => {
		const { db } = makeDb();
		await createTenant(db, {
			tenant_id: "demo-running-org", legal_name: "Demo", display_name: "Demo",
			sport_domain: "running", status: "demo",
		});
		await createBusinessUnit(db, "demo-running-org", {
			business_unit_id: "demo-running-membership", unit_type: "MEMBERSHIP",
			name: "Membership", operating_status: "not_operating",
		});
		const detail = await getBusinessUnitDetail(db, "demo-running-org", "demo-running-membership");
		expect(detail?.assets).toEqual([]);
		expect(detail?.money).toBeNull();
		expect(detail?.audience).toBeNull();
	});

	it("derives league audience from canonical series registrations", async () => {
		const { db, setSeriesRegistrations } = makeDb();
		setSeriesRegistrations(7);
		await createTenant(db, { tenant_id: "nwana", legal_name: "L", display_name: "D" });
		await createBusinessUnit(db, "nwana", {
			business_unit_id: "nwana-league", unit_type: "LEAGUE_COMPETITION",
			name: "League / Competition", operating_status: "pilot",
		});
		const detail = await getBusinessUnitDetail(db, "nwana", "nwana-league");
		expect(detail?.audience?.value).toBe("7");
		expect(detail?.audience?.source).toContain("series_registrations");
	});
});
