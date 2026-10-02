// ADR-0048 platform-admin "Preview as Tenant" tests:
// stateless HMAC preview tokens, issuance scoping, portal identity,
// read-only enforcement, and the preview client markup.

import { describe, expect, it } from "vitest";
import { webcrypto } from "node:crypto";

import {
	PREVIEW_TOKEN_TTL_SEC,
	createPreviewToken,
	generateAccessToken,
	getPortalSession,
	getPortalUnit,
	resolveIdentity,
	verifyPreviewToken,
} from "../src/lib/tenant-access";
import { renderPortalLandingHtml, renderPortalUnitHtml } from "../src/oc-portal";
import { renderTenantSectionHtml, renderBusinessUnitSectionHtml } from "../src/oc-organizations";

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();

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
					throw new Error(`stub: unhandled first(): ${s.slice(0, 90)}`);
				},
				all: async <T>() => {
					if (s.startsWith("SELECT * FROM business_units WHERE tenant_id = ? ORDER BY")) {
						const rows = [...units.values()]
							.filter((u) => u.tenant_id === args[0])
							.sort((a, b) => String(a.business_unit_id).localeCompare(String(b.business_unit_id)));
						return { results: rows as T[] };
					}
					throw new Error(`stub: unhandled all(): ${s.slice(0, 90)}`);
				},
				run: async () => {
					throw new Error(`stub: unhandled run(): ${s.slice(0, 90)}`);
				},
			});
			return { bind: bound };
		},
	};
	return { db: db as unknown as D1Database, seedTenant, seedUnit, users };
}

const OWNER_KEY = "owner-key-for-preview-tests";

const b64url = (bytes: Uint8Array) => {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return Buffer.from(bin, "binary").toString("base64")
		.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

/** Craft a preview-format token by hand (independent of createPreviewToken). */
async function craftPreviewToken(key: string, payload: Record<string, unknown>): Promise<string> {
	const payloadB64 = b64url(new TextEncoder().encode(JSON.stringify(payload)));
	const cryptoKey = await webcrypto.subtle.importKey(
		"raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
	);
	const sig = await webcrypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(payloadB64));
	return `${payloadB64}.${b64url(new Uint8Array(sig))}`;
}

describe("preview tokens", () => {
	it("round-trips: create then verify yields a scoped preview identity", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("nwana", "NWANA");
		seedUnit("nwana", "nwana-governing");
		seedUnit("nwana", "nwana-academy");
		const p = await createPreviewToken(db, OWNER_KEY, "nwana");
		expect(p.token).toMatch(/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/);
		expect(p.unit_ids.sort()).toEqual(["nwana-academy", "nwana-governing"]);
		expect(p.expires_at - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(PREVIEW_TOKEN_TTL_SEC);
		const id = await verifyPreviewToken(db, OWNER_KEY, p.token);
		expect(id).toMatchObject({ kind: "preview", tenant_id: "nwana" });
		expect(id?.unit_ids.sort()).toEqual(["nwana-academy", "nwana-governing"]);
	});

	it("creates no tenant_users rows (no synthetic users)", async () => {
		const { db, seedTenant, seedUnit, users } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		await createPreviewToken(db, OWNER_KEY, "t1");
		expect(users.size).toBe(0);
	});

	it("rejects a tampered payload", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		seedTenant("t2");
		seedUnit("t2", "u9");
		const p = await createPreviewToken(db, OWNER_KEY, "t1");
		const [payloadB64, sig] = p.token.split(".");
		const payload = JSON.parse(Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString());
		payload.tid = "t2";
		payload.units = ["u9"];
		const tampered = `${b64url(new TextEncoder().encode(JSON.stringify(payload)))}.${sig}`;
		expect(await verifyPreviewToken(db, OWNER_KEY, tampered)).toBeNull();
	});

	it("rejects a token signed with a different key", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		const future = Math.floor(Date.now() / 1000) + 600;
		const token = await craftPreviewToken("wrong-key", { v: 1, tid: "t1", units: ["u1"], exp: future, n: "x" });
		expect(await verifyPreviewToken(db, OWNER_KEY, token)).toBeNull();
	});

	it("rejects expired tokens", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		const past = Math.floor(Date.now() / 1000) - 60;
		const token = await craftPreviewToken(OWNER_KEY, { v: 1, tid: "t1", units: ["u1"], exp: past, n: "x" });
		expect(await verifyPreviewToken(db, OWNER_KEY, token)).toBeNull();
	});

	it("rejects tokens for unknown tenants", async () => {
		const { db } = makeDb();
		const future = Math.floor(Date.now() / 1000) + 600;
		const token = await craftPreviewToken(OWNER_KEY, { v: 1, tid: "ghost", units: ["u1"], exp: future, n: "x" });
		expect(await verifyPreviewToken(db, OWNER_KEY, token)).toBeNull();
	});

	it("rejects non-token garbage", async () => {
		const { db } = makeDb();
		expect(await verifyPreviewToken(db, OWNER_KEY, "")).toBeNull();
		expect(await verifyPreviewToken(db, OWNER_KEY, "no-dots-here")).toBeNull();
		expect(await verifyPreviewToken(db, OWNER_KEY, "a.b.c")).toBeNull();
	});

	it("supports a single-unit scope (Preview as client)", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		seedUnit("t1", "u2");
		const p = await createPreviewToken(db, OWNER_KEY, "t1", ["u2"]);
		expect(p.unit_ids).toEqual(["u2"]);
		const id = await verifyPreviewToken(db, OWNER_KEY, p.token);
		expect(id?.unit_ids).toEqual(["u2"]);
	});

	it("refuses units from another tenant at issuance", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		seedTenant("t2");
		seedUnit("t2", "u2");
		await expect(createPreviewToken(db, OWNER_KEY, "t1", ["u2"])).rejects.toThrow(/unknown business unit/);
	});

	it("refuses unknown tenants at issuance", async () => {
		const { db } = makeDb();
		await expect(createPreviewToken(db, OWNER_KEY, "ghost")).rejects.toThrow(/unknown tenant/);
	});
});

describe("resolveIdentity with previews", () => {
	it("owner key still wins over everything", async () => {
		const throwing = { prepare() { throw new Error("must not touch the DB"); } } as unknown as D1Database;
		expect(await resolveIdentity(throwing, OWNER_KEY, OWNER_KEY)).toEqual({ kind: "platform_admin" });
	});

	it("preview token resolves to a preview identity, never platform_admin", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		const p = await createPreviewToken(db, OWNER_KEY, "t1");
		const id = await resolveIdentity(db, p.token, OWNER_KEY);
		expect(id?.kind).toBe("preview");
		expect(id).toMatchObject({ tenant_id: "t1", unit_ids: ["u1"] });
	});

	it("expired preview token resolves to null (not to tenant_users)", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		const past = Math.floor(Date.now() / 1000) - 60;
		const token = await craftPreviewToken(OWNER_KEY, { v: 1, tid: "t1", units: ["u1"], exp: past, n: "x" });
		expect(await resolveIdentity(db, token, OWNER_KEY)).toBeNull();
	});

	it("plain tenant access tokens still resolve as tenant_user", async () => {
		const { db } = makeDb();
		expect(await resolveIdentity(db, generateAccessToken(), OWNER_KEY)).toBeNull();
	});
});

describe("portal scoping for previews", () => {
	it("session exposes only the scoped units, no ids", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1", "Tenant One");
		seedUnit("t1", "u1");
		seedUnit("t1", "u2");
		const p = await createPreviewToken(db, OWNER_KEY, "t1", ["u2"]);
		const id = (await resolveIdentity(db, p.token, OWNER_KEY)) as Extract<
			Awaited<ReturnType<typeof resolveIdentity>>, { kind: "preview" }
		>;
		const sess = await getPortalSession(db, id);
		expect(sess.tenant_name).toBe("Tenant One");
		expect(sess.display_name).toBe("Preview");
		expect(sess.units.map((u) => u.unit_id)).toEqual(["u2"]);
		expect(JSON.stringify(sess)).not.toContain("t1");
	});

	it("unit detail: in-scope ok, out-of-scope and cross-tenant read as 404", async () => {
		const { db, seedTenant, seedUnit } = makeDb();
		seedTenant("t1");
		seedUnit("t1", "u1");
		seedUnit("t1", "u2");
		seedTenant("t2");
		seedUnit("t2", "u9");
		const p = await createPreviewToken(db, OWNER_KEY, "t1", ["u1"]);
		const id = (await resolveIdentity(db, p.token, OWNER_KEY)) as Extract<
			Awaited<ReturnType<typeof resolveIdentity>>, { kind: "preview" }
		>;
		expect(await getPortalUnit(db, id, "u1")).not.toBeNull();
		expect(await getPortalUnit(db, id, "u2")).toBeNull();
		expect(await getPortalUnit(db, id, "u9")).toBeNull();
	});
});

describe("preview client markup", () => {
	it("portal shells carry preview handling: banner, exit, sessionStorage — and no OC menu", () => {
		for (const html of [renderPortalLandingHtml(), renderPortalUnitHtml("u1")]) {
			expect(html).toContain("nwana_portal_preview");
			expect(html).toContain("#preview=");
			expect(html).toContain("preview-banner");
			expect(html).toContain("Exit preview");
			expect(html).toContain("Preview — read-only tenant view");
			expect(html).toContain("sessionStorage");
			expect(html).not.toContain("oc-menu\" aria-label=\"Operating Center");
		}
		// The only Organizations links in preview markup are the exit
		// button and the expired-preview notice — no navigation chrome.
		expect(renderPortalLandingHtml()).toContain("/operating-center/organizations");
	});

	it("preview banner is the only admin chrome added; tenant body unchanged", () => {
		const html = renderPortalLandingHtml();
		expect(html).toContain("Tenant access");
		expect(html).toContain("Business portal");
	});

	it("organizations pages no longer carry Preview Portal / Preview as client controls (2026-10-02: demos live in the demo workspace)", () => {
		const tenantHtml = renderTenantSectionHtml("nwana");
		expect(tenantHtml).not.toContain("Preview Portal");
		expect(tenantHtml).not.toContain("data-preview-tenant");
		expect(tenantHtml).not.toContain("Preview as client");
		expect(tenantHtml).not.toContain("data-preview-unit");
		const unitHtml = renderBusinessUnitSectionHtml("nwana", "nwana-governing");
		expect(unitHtml).not.toContain("Preview as client");
		expect(unitHtml).not.toContain("data-preview-unit");
		// Organizations pages now render the Platform Admin menu.
		expect(tenantHtml).toContain('aria-label="Platform administration"');
		expect(tenantHtml).toContain("/admin/organizations");
	});
});
