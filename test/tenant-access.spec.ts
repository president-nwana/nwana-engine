// ADR-0047 role-based tenant navigation tests:
// identity resolution (owner key vs scoped tenant tokens), tenant-user
// CRUD, portal session scoping, cross-tenant isolation, portal shells.

import { describe, expect, it } from "vitest";

import {
	createTenantUser,
	generateAccessToken,
	getPortalSession,
	getPortalUnit,
	hashAccessToken,
	listTenantUsers,
	resolveIdentity,
	revokeTenantUser,
} from "../src/lib/tenant-access";
import { UNIT_BODY_SCRIPT } from "../src/oc-unit-body";
import { renderPortalLandingHtml, renderPortalUnitHtml } from "../src/oc-portal";

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();

const USER_COLS = [
	"user_id", "tenant_id", "display_name", "role",
	"unit_ids", "token_hash", "status", "note",
];

function makeDb() {
	const tenants = new Map<string, Record<string, unknown>>();
	const units = new Map<string, Record<string, unknown>>();
	const users = new Map<string, Record<string, unknown>>();

	const seedTenant = (tenant_id: string, display_name = tenant_id) => {
		tenants.set(tenant_id, {
			tenant_id, legal_name: display_name, display_name,
			organization_type: "nonprofit", sport_domain: "running",
			status: "active", branding: null, owner_admin: null,
			external_systems: "[]", plan_license_status: "active",
			enabled_modules: "[]", license_start: null, license_end: null,
			billing_model: null, white_label: 0,
			created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
		});
	};
	const seedUnit = (tenant_id: string, business_unit_id: string) => {
		units.set(`${tenant_id}/${business_unit_id}`, {
			business_unit_id, tenant_id, unit_type: "MEMBERSHIP",
			name: `Unit ${business_unit_id}`, operating_status: "not_operating",
			legal_entity_status: "NOT_FORMED", owner_legal_ref: null,
			revenue_model: null, connected_assets: "[]",
			connected_integrations: "[]", money_state: null,
			audience_state: null, next_actions: "[]",
			created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z",
		});
	};

	const db = {
		prepare(sql: string) {
			const s = norm(sql);
			const bound = (...args: unknown[]) => ({
				first: async <T>() => {
					if (s.startsWith("SELECT * FROM tenants WHERE tenant_id = ?")) {
						return (tenants.get(String(args[0])) ?? null) as T | null;
					}
					if (s.startsWith("SELECT * FROM business_units WHERE business_unit_id = ? AND tenant_id = ?")) {
						return (units.get(`${args[1]}/${args[0]}`) ?? null) as T | null;
					}
					if (s.startsWith("SELECT * FROM tenant_users WHERE token_hash = ? AND status = 'active'")) {
						for (const u of users.values()) {
							if (u.token_hash === args[0] && u.status === "active") return u as T;
						}
						return null as T | null;
					}
					if (s.startsWith("SELECT * FROM tenant_users WHERE user_id = ?")) {
						return (users.get(String(args[0])) ?? null) as T | null;
					}
					throw new Error(`stub: unhandled first(): ${s.slice(0, 90)}`);
				},
				all: async <T>() => {
					if (s.startsWith("SELECT * FROM business_units WHERE tenant_id = ? ORDER BY")) {
						const rows = [...units.values()]
							.filter((u) => u.tenant_id === args[0])
							.sort((a, b) => String(a.business_unit_id).localeCompare(String(b.business_unit_id)));
						return { results: rows as T[] };
					}
					if (s.startsWith("SELECT user_id, tenant_id, display_name, role, unit_ids, status, created_at, note FROM tenant_users WHERE tenant_id = ?")) {
						const rows = [...users.values()]
							.filter((u) => u.tenant_id === args[0])
							.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
						return { results: rows as T[] };
					}
					throw new Error(`stub: unhandled all(): ${s.slice(0, 90)}`);
				},
				run: async () => {
					if (s.startsWith("INSERT INTO tenant_users")) {
						const row: Record<string, unknown> = {};
						// INSERT lists (user_id, tenant_id, display_name, unit_ids,
						// token_hash, note); role/status are SQL literals.
						["user_id", "tenant_id", "display_name", "unit_ids", "token_hash", "note"]
							.forEach((c, i) => (row[c] = args[i]));
						row.role = "tenant_user";
						row.status = "active";
						row.created_at = "2026-10-01T00:00:00Z";
						users.set(String(row.user_id), row);
						return { success: true, meta: { changes: 1 } };
					}
					if (s.startsWith("UPDATE tenant_users SET status = 'revoked'")) {
						const u = users.get(String(args[0]));
						if (u && u.tenant_id === args[1] && u.status === "active") {
							u.status = "revoked";
							return { success: true, meta: { changes: 1 } };
						}
						return { success: true, meta: { changes: 0 } };
					}
					throw new Error(`stub: unhandled run(): ${s.slice(0, 90)}`);
				},
			});
			return { bind: bound };
		},
	};
	return { db: db as unknown as D1Database, seedTenant, seedUnit, users };
}

const OWNER_KEY = "owner-key-for-tests";

describe("access tokens", () => {
	it("generates unique url-safe tokens", () => {
		const a = generateAccessToken();
		const b = generateAccessToken();
		expect(a).toHaveLength(43);
		expect(b).toHaveLength(43);
		expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(a).not.toBe(b);
	});

	it("hashes deterministically to 64 hex chars", async () => {
		const t = generateAccessToken();
		const h1 = await hashAccessToken(t);
		const h2 = await hashAccessToken(t);
		expect(h1).toMatch(/^[0-9a-f]{64}$/);
		expect(h1).toBe(h2);
		expect(await hashAccessToken(generateAccessToken())).not.toBe(h1);
	});
});

describe("resolveIdentity", () => {
	it("returns null without a key", async () => {
		const { db } = makeDb();
		expect(await resolveIdentity(db, "", OWNER_KEY)).toBeNull();
	});

	it("owner key resolves to platform_admin without a DB hit", async () => {
		const throwing = {
			prepare() { throw new Error("must not touch the DB"); },
		} as unknown as D1Database;
		expect(await resolveIdentity(throwing, OWNER_KEY, OWNER_KEY)).toEqual({
			kind: "platform_admin",
		});
	});

	it("unknown token resolves to null", async () => {
		const { db } = makeDb();
		expect(await resolveIdentity(db, generateAccessToken(), OWNER_KEY)).toBeNull();
	});

	it("create/resolve roundtrip scopes to tenant and units", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		seedUnit("t1", "u2");
		const { user, token } = await createTenantUser(db, "t1", {
			display_name: "Acme Ops",
			unit_ids: ["u1", "u1"],
			note: "front desk",
		});
		expect(token).toHaveLength(43);
		expect(user.unit_ids).toEqual(["u1"]);
		expect(user.note).toBe("front desk");
		const id = await resolveIdentity(db, token, OWNER_KEY);
		expect(id).toMatchObject({
			kind: "tenant_user",
			tenant_id: "t1",
			display_name: "Acme Ops",
			unit_ids: ["u1"],
		});
	});

	it("revoked tokens stop resolving", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		const { user, token } = await createTenantUser(db, "t1", {
			display_name: "Temp",
			unit_ids: ["u1"],
		});
		expect(await revokeTenantUser(db, "t1", user.user_id)).toBe(true);
		expect(await resolveIdentity(db, token, OWNER_KEY)).toBeNull();
		// Second revoke is a no-op.
		expect(await revokeTenantUser(db, "t1", user.user_id)).toBe(false);
		expect(await revokeTenantUser(db, "t1", "nope")).toBe(false);
	});
});

describe("createTenantUser validation", () => {
	it("rejects unknown tenants, units, and cross-tenant units", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedTenant("t2");
		seedUnit("t1", "u1");
		seedUnit("t2", "u2");
		await expect(createTenantUser(db, "nope", { display_name: "x" })).rejects.toThrow();
		await expect(
			createTenantUser(db, "t1", { display_name: "x", unit_ids: ["ghost"] }),
		).rejects.toThrow(/unknown business unit/);
		await expect(
			createTenantUser(db, "t1", { display_name: "x", unit_ids: ["u2"] }),
		).rejects.toThrow(/unknown business unit/);
		await expect(createTenantUser(db, "t1", { display_name: "  " })).rejects.toThrow();
	});
});

describe("listTenantUsers", () => {
	it("lists without token hashes, scoped to the tenant", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedTenant("t2");
		seedUnit("t1", "u1");
		seedUnit("t2", "u2");
		await createTenantUser(db, "t1", { display_name: "One", unit_ids: ["u1"] });
		await createTenantUser(db, "t2", { display_name: "Two", unit_ids: ["u2"] });
		const list = await listTenantUsers(db, "t1");
		expect(list).toHaveLength(1);
		expect(list[0].display_name).toBe("One");
		expect(JSON.stringify(list[0])).not.toContain("token_hash");
		expect("token_hash" in list[0]).toBe(false);
	});
});

describe("portal session", () => {
	it("exposes only allowlisted units and no internal ids", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1", "Acme Running Club");
		seedUnit("t1", "u1");
		seedUnit("t1", "u2");
		const { token } = await createTenantUser(db, "t1", {
			display_name: "Acme Ops",
			unit_ids: ["u2"],
		});
		const id = await resolveIdentity(db, token, OWNER_KEY);
		if (!id || id.kind !== "tenant_user") throw new Error("identity failed");
		const session = await getPortalSession(db, id);
		expect(session.tenant_name).toBe("Acme Running Club");
		expect(session.display_name).toBe("Acme Ops");
		expect(session.units.map((u) => u.unit_id)).toEqual(["u2"]);
		const raw = JSON.stringify(session);
		expect(raw).not.toContain("t1");
		expect("tenant_id" in session).toBe(false);
		expect("user_id" in session).toBe(false);
	});

	it("empty allowlist means no units", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		const { token } = await createTenantUser(db, "t1", { display_name: "Nobody" });
		const id = await resolveIdentity(db, token, OWNER_KEY);
		if (!id || id.kind !== "tenant_user") throw new Error("identity failed");
		expect((await getPortalSession(db, id)).units).toEqual([]);
	});
});

describe("portal unit isolation", () => {
	it("allows the unit, denies others and other tenants", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedTenant("t2");
		seedUnit("t1", "u1");
		seedUnit("t1", "u2");
		seedUnit("t2", "u1"); // same unit id, different tenant
		const { token } = await createTenantUser(db, "t1", {
			display_name: "Acme Ops",
			unit_ids: ["u1"],
		});
		const id = await resolveIdentity(db, token, OWNER_KEY);
		if (!id || id.kind !== "tenant_user") throw new Error("identity failed");
		const own = await getPortalUnit(db, id, "u1");
		expect(own?.business_unit_id).toBe("u1");
		expect(own?.tenant_id).toBe("t1");
		// Not allowlisted -> null (indistinguishable from not-found).
		expect(await getPortalUnit(db, id, "u2")).toBeNull();
		// Unknown unit -> null.
		expect(await getPortalUnit(db, id, "ghost")).toBeNull();
		// The allowlist check runs before the tenant check: t2/u1 can
		// never leak through this identity because the tenant comes
		// from the token, not the request.
	});
});

describe("portal shells", () => {
	it("landing: no OC menu, no Organizations navigation, portal gate", () => {
		const html = renderPortalLandingHtml();
		expect(html).toContain('data-portal="landing"');
		expect(html).toContain("nwana_portal_key");
		expect(html).toContain("Tenant access");
		expect(html).not.toContain('aria-label="Operating center"');
		expect(html).not.toContain("data-org-level");
		// ADR-0048: the only Organizations links are the preview Exit
		// action and the expired-preview notice — no navigation chrome.
		const orgLinks = html.split("/operating-center/organizations").length - 1;
		expect(orgLinks).toBe(2);
		expect(html).toContain("Exit preview");
	});

	it("unit page: data-unit, sanitized, no tenant id", () => {
		const html = renderPortalUnitHtml("demo-running-membership");
		expect(html).toContain('data-portal="unit"');
		expect(html).toContain('data-unit="demo-running-membership"');
		expect(html).toContain("nwana_portal_key");
		const evil = renderPortalUnitHtml(`x"'><script>`);
		expect(evil).not.toContain(`x"'><script>`);
	});
});

describe("shared unit renderer", () => {
	const load = () => {
		const window: Record<string, unknown> = {};
		new Function("window", UNIT_BODY_SCRIPT)(window);
		return window.__unitRender as {
			esc: (v: unknown) => string;
			statusBadge: (s: string) => string;
			body: (u: Record<string, unknown>, o: Record<string, unknown>) => string;
		};
	};
	const fixture = {
		business_unit_id: "u1",
		tenant_id: "t1",
		name: "Membership",
		unit_type: "MEMBERSHIP",
		operating_status: "not_operating",
		legal_entity_status: "NOT_FORMED",
		owner_legal_ref: null,
		revenue_model: "membership",
		assets: [],
		money: null,
		audience: null,
		connected_integrations: [],
		next_actions: [],
	};

	it("admin mode keeps tenant id, back link, engine panel", () => {
		const R = load();
		const html = R.body(fixture, {
			links: [{ label: "Executive money view", href: "/operating-center/growth?tab=funds" }],
			backHtml: '<p class="meta"><a href="/operating-center/organizations/t1">← t1</a></p>',
			tenantLine: "<p><b>Tenant:</b> t1</p>",
			engineEmpty: true,
		});
		expect(html).toContain("t1");
		expect(html).toContain("/operating-center/organizations/t1");
		expect(html).toContain("Engine functions");
		expect(html).toContain("Executive money view");
		expect(html).toContain("/operating-center/growth?tab=funds");
	});

	it("admin mode shows the not-operating note when no links", () => {
		const R = load();
		const html = R.body(fixture, {
			links: [],
			backHtml: "",
			tenantLine: "",
			engineEmpty: true,
		});
		expect(html).toContain("Engine functions");
		expect(html).toContain("No Engine functions linked yet");
	});

	it("portal mode hides tenant id and omits the engine panel", () => {
		const R = load();
		const html = R.body(fixture, { links: [], backHtml: "", tenantLine: "", engineEmpty: false });
		expect(html).toContain("Membership");
		expect(html).not.toContain("t1");
		expect(html).not.toContain("organizations");
		expect(html).not.toContain("Engine functions");
	});
});
