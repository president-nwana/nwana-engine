// One-time bootstrap grant flow + login-user management tests (2026-10-02).
//
// Covers: bootstrapClosed, mintBootstrapGrant, consumeBootstrapGrant,
// bootstrapFirstAdmin (single-use grant, permanent closure), createLoginUser
// validation, verifyPassword roundtrip, revokeLoginUser (last-admin guard),
// setUserPassword, reactivateLoginUser.

import { describe, expect, it } from "vitest";

import {
	bootstrapClosed,
	bootstrapFirstAdmin,
	consumeBootstrapGrant,
	createLoginUser,
	findUserByEmail,
	mintBootstrapGrant,
	reactivateLoginUser,
	revokeLoginUser,
	setUserPassword,
	verifyPassword,
} from "../src/lib/tenant-access";

const norm = (sql: string) => sql.replace(/\s+/g, " ").trim();

function makeDb() {
	const users = new Map<string, Record<string, unknown>>();
	const grants = new Map<string, Record<string, unknown>>();
	const tenants = new Map<string, Record<string, unknown>>([
		["nwana", { tenant_id: "nwana", status: "active", display_name: "NWANA" }],
		["demo-running-org", { tenant_id: "demo-running-org", status: "demo", display_name: "Demo" }],
	]);

	const db = {
		prepare(sql: string) {
			const s = norm(sql);
			const bound = (...args: unknown[]) => ({
				first: async <T>() => {
					if (s.startsWith("SELECT COUNT(*) as c FROM tenant_users WHERE role = 'platform_admin' AND status = 'active' AND user_id != ?")) {
						let c = 0;
						for (const u of users.values()) {
							if (u.role === "platform_admin" && u.status === "active" && u.user_id !== args[0]) c++;
						}
						return { c } as T;
					}
					if (s.startsWith("SELECT COUNT(*) as c FROM tenant_users WHERE role = 'platform_admin'")) {
						let c = 0;
						for (const u of users.values()) {
							if (u.role === "platform_admin" && u.password_hash && u.status === "active") c++;
						}
						return { c } as T;
					}
					if (s.startsWith("SELECT user_id, role FROM tenant_users WHERE user_id = ?")) {
						return (users.get(String(args[0])) ?? null) as T | null;
					}
					if (s.startsWith("SELECT user_id FROM tenant_users WHERE user_id = ?")) {
						return (users.get(String(args[0])) ?? null) as T | null;
					}
					if (s.startsWith("SELECT COUNT(*) as c FROM tenant_users WHERE role = 'platform_admin' AND status = 'active' AND user_id != ?")) {
						let c = 0;
						for (const u of users.values()) {
							if (u.role === "platform_admin" && u.status === "active" && u.user_id !== args[0]) c++;
						}
						return { c } as T;
					}
					if (s.startsWith("SELECT user_id, email, role, tenant_id, display_name, unit_ids, password_hash, status FROM tenant_users WHERE email = ?")) {
						for (const u of users.values()) {
							if (u.email === args[0]) return u as T;
						}
						return null as T | null;
					}
					if (s === "SELECT * FROM tenants WHERE tenant_id = ?") {
						return (tenants.get(String(args[0])) ?? null) as T | null;
					}
					throw new Error(`stub: unhandled first(): ${s.slice(0, 80)}`);
				},
				all: async <T>() => {
					if (s.startsWith("SELECT * FROM business_units WHERE tenant_id = ? ORDER BY")) {
						return { results: [] as T[] };
					}
					throw new Error(`stub: unhandled all(): ${s.slice(0, 80)}`);
				},
				run: async () => {
					if (s.startsWith("INSERT INTO tenant_users")) {
						const [user_id, tenant_id, display_name, role, unit_ids, email, password_hash, note] = args;
						for (const u of users.values()) {
							if (u.email === email) throw new Error("UNIQUE constraint failed: tenant_users.email");
						}
						users.set(String(user_id), {
							user_id, tenant_id, display_name, role, unit_ids,
							email, password_hash, note, status: "active",
							created_at: "2026-10-02T00:00:00Z",
						});
						return { success: true, meta: { changes: 1 } };
					}
					if (s.startsWith("INSERT INTO bootstrap_grants")) {
						const [grant_id, token_hash, expires_at] = args;
						grants.set(String(grant_id), {
							grant_id, token_hash, expires_at, used_at: null,
							created_at: "2026-10-02T00:00:00Z",
						});
						return { success: true, meta: { changes: 1 } };
					}
					if (s.startsWith("UPDATE bootstrap_grants SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?")) {
						const [now, token_hash] = args;
						let changes = 0;
						for (const g of grants.values()) {
							if (g.token_hash === token_hash && !g.used_at && String(g.expires_at) > String(now)) {
								g.used_at = now;
								changes = 1;
								break;
							}
						}
						return { success: true, meta: { changes } };
					}
					if (s.startsWith("UPDATE tenant_users SET status = 'revoked' WHERE user_id = ?")) {
						const u = users.get(String(args[0]));
						if (u) { u.status = "revoked"; return { success: true, meta: { changes: 1 } }; }
						return { success: true, meta: { changes: 0 } };
					}
					if (s.startsWith("UPDATE tenant_users SET status = 'active' WHERE user_id = ?")) {
						const u = users.get(String(args[0]));
						if (u) { u.status = "active"; return { success: true, meta: { changes: 1 } }; }
						return { success: true, meta: { changes: 0 } };
					}
					if (s.startsWith("UPDATE tenant_users SET password_hash = ? WHERE user_id = ?")) {
						const u = users.get(String(args[1]));
						if (u) { u.password_hash = args[0]; return { success: true, meta: { changes: 1 } }; }
						return { success: true, meta: { changes: 0 } };
					}
					throw new Error(`stub: unhandled run(): ${s.slice(0, 80)}`);
				},
			});
			return { bind: bound, first: bound().first, all: bound().all, run: bound().run };
		},
	};
	return { db: db as unknown as D1Database, users, grants };
}

describe("bootstrap grant flow", () => {
	it("bootstrap is open when no platform_admin exists", async () => {
		const { db } = makeDb();
		expect(await bootstrapClosed(db)).toBe(false);
	});

	it("minted grant creates the first admin; bootstrap then closes permanently", async () => {
		const { db } = makeDb();
		const grant = await mintBootstrapGrant(db);
		expect(grant.grant_token).toMatch(/^[0-9a-f]{64}$/);

		const created = await bootstrapFirstAdmin(db, grant.grant_token, {
			email: "admin@example.org",
			password: "long-enough-password-1",
			display_name: "First Admin",
		});
		expect(created.role).toBe("platform_admin");
		expect(created.email).toBe("admin@example.org");
		expect(await bootstrapClosed(db)).toBe(true);

		// A second bootstrap attempt — even with a fresh grant, even direct
		// endpoint-style call — is rejected permanently.
		const grant2 = await mintBootstrapGrant(db).catch((e) => e);
		expect(grant2).toBeInstanceOf(Error);
		await expect(
			bootstrapFirstAdmin(db, "bogus-token", {
				email: "evil@example.org",
				password: "long-enough-password-2",
				display_name: "Evil",
			}),
		).rejects.toThrow("bootstrap is closed");
	});

	it("grant tokens are single-use", async () => {
		const { db } = makeDb();
		const grant = await mintBootstrapGrant(db);
		expect(await consumeBootstrapGrant(db, grant.grant_token)).toBe(true);
		expect(await consumeBootstrapGrant(db, grant.grant_token)).toBe(false);
		expect(await consumeBootstrapGrant(db, "not-a-real-token")).toBe(false);
	});

	it("bootstrap rejects invalid/used grants without creating users", async () => {
		const { db, users } = makeDb();
		await expect(
			bootstrapFirstAdmin(db, "bogus", {
				email: "x@example.org",
				password: "long-enough-password-3",
				display_name: "X",
			}),
		).rejects.toThrow("setup code");
		expect(users.size).toBe(0);
		expect(await bootstrapClosed(db)).toBe(false);
	});

	it("expired grants cannot be used", async () => {
		const { db, grants } = makeDb();
		const grant = await mintBootstrapGrant(db);
		for (const g of grants.values()) g.expires_at = "2020-01-01T00:00:00Z";
		expect(await consumeBootstrapGrant(db, grant.grant_token)).toBe(false);
	});
});

describe("login user management", () => {
	it("createLoginUser validates input and hashes the password", async () => {
		const { db, users } = makeDb();
		await expect(
			createLoginUser(db, "nwana", {
				email: "bad", password: "long-enough-password-1",
				display_name: "Bad", role: "tenant_owner", unit_ids: [],
			}),
		).rejects.toThrow("invalid email");
		await expect(
			createLoginUser(db, "nwana", {
				email: "a@b.co", password: "short",
				display_name: "A", role: "tenant_owner", unit_ids: [],
			}),
		).rejects.toThrow("at least 12 characters");
		await expect(
			createLoginUser(db, "nope", {
				email: "a@b.co", password: "long-enough-password-1",
				display_name: "A", role: "tenant_owner", unit_ids: [],
			}),
		).rejects.toThrow("unknown tenant");
		// demo_user requires a demo tenant.
		await expect(
			createLoginUser(db, "nwana", {
				email: "d@b.co", password: "long-enough-password-1",
				display_name: "D", role: "demo_user", unit_ids: [],
			}),
		).rejects.toThrow("demo tenant");

		const created = await createLoginUser(db, "nwana", {
			email: "President@NWAOFNA.org",
			password: "long-enough-password-1",
			display_name: "Albert",
			role: "tenant_owner",
			unit_ids: [],
		});
		expect(created.email).toBe("president@nwaofna.org");
		const stored = users.get(created.user_id)!;
		expect(stored.password_hash).toMatch(/^pbkdf2\$210000\$/);
		expect(stored.password_hash).not.toContain("long-enough-password-1");
		// Password verifies; wrong password does not.
		expect(await verifyPassword("long-enough-password-1", String(stored.password_hash))).toBe(true);
		expect(await verifyPassword("wrong-password-xxxxx", String(stored.password_hash))).toBe(false);
		// findUserByEmail roundtrip (login path).
		const found = await findUserByEmail(db, "president@nwaofna.org");
		expect(found?.user_id).toBe(created.user_id);
	});

	it("revokeLoginUser refuses to revoke the last platform admin", async () => {
		const { db, users } = makeDb();
		const grant = await mintBootstrapGrant(db);
		const admin = await bootstrapFirstAdmin(db, grant.grant_token, {
			email: "admin@example.org", password: "long-enough-password-1", display_name: "Admin",
		});
		await expect(revokeLoginUser(db, admin.user_id)).rejects.toThrow("last active platform administrator");

		const second = await createLoginUser(db, "nwana", {
			email: "admin2@example.org", password: "long-enough-password-1",
			display_name: "Admin2", role: "platform_admin", unit_ids: [],
		});
		await revokeLoginUser(db, admin.user_id);
		expect(users.get(admin.user_id)?.status).toBe("revoked");
		// Revoked users cannot be found for login.
		expect(await findUserByEmail(db, "admin@example.org")).toBeNull();
		await reactivateLoginUser(db, admin.user_id);
		expect(users.get(admin.user_id)?.status).toBe("active");
		// Revoking a non-admin works.
		const owner = await createLoginUser(db, "nwana", {
			email: "o@example.org", password: "long-enough-password-1",
			display_name: "O", role: "tenant_owner", unit_ids: [],
		});
		await revokeLoginUser(db, owner.user_id);
		expect(users.get(owner.user_id)?.status).toBe("revoked");
		expect(second.user_id).toBeTruthy();
	});

	it("setUserPassword rejects short passwords and rehashes", async () => {
		const { db, users } = makeDb();
		const u = await createLoginUser(db, "nwana", {
			email: "u@example.org", password: "long-enough-password-1",
			display_name: "U", role: "tenant_owner", unit_ids: [],
		});
		await expect(setUserPassword(db, u.user_id, "short")).rejects.toThrow("at least 12 characters");
		await expect(setUserPassword(db, "nope", "long-enough-password-2")).rejects.toThrow("user not found");
		const before = String(users.get(u.user_id)!.password_hash);
		await setUserPassword(db, u.user_id, "brand-new-password-2");
		const after = String(users.get(u.user_id)!.password_hash);
		expect(after).not.toBe(before);
		expect(await verifyPassword("brand-new-password-2", after)).toBe(true);
		expect(await verifyPassword("long-enough-password-1", after)).toBe(false);
	});
});

describe("admin users page", () => {
	it("renders session-only user management UI (no owner-key gate)", async () => {
		const { renderUsersSectionHtml } = await import("../src/oc-admin");
		const html = renderUsersSectionHtml();
		expect(html).toContain("nwana_engine_session");
		expect(html).toContain("/api/admin/users");
		expect(html).toContain("/api/admin/tenants");
		expect(html).toContain("Create user");
		expect(html).toContain("/login");
		expect(html).not.toContain("nwana_operating_center_key");
		expect(html).not.toContain('id="key-form"');
		// All roles are offered.
		for (const role of ["platform_admin", "tenant_owner", "tenant_admin", "business_unit_user", "demo_user"]) {
			expect(html).toContain(`value="${role}"`);
		}
	});

	it("login page offers bootstrap only per server status (markup present, hidden by default)", async () => {
		const { renderLoginHtml } = await import("../src/oc-login");
		const html = renderLoginHtml();
		// Bootstrap section exists but is hidden until /api/auth/bootstrap-status says so.
		expect(html).toContain('id="bootstrap-section"');
		expect(html).toContain("/api/auth/bootstrap-status");
		expect(html).toContain("/api/auth/bootstrap");
		// The owner key is never part of the bootstrap form.
		expect(html).not.toContain("owner_key");
		expect(html).not.toContain("nwana_operating_center_key");
	});
});
