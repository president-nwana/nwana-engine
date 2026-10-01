// ADR-0047: role-based tenant navigation.
//
// Two credential types, one resolution path:
//   - platform_admin: the owner key (OPERATING_CENTER_KEY). Full Operating
//     Center, Organizations directory, tenant switching. No DB lookup.
//   - tenant_user: a scoped access token from tenant_users. Exactly one
//     tenant, explicitly allowlisted business units, /portal only.
//
// The plaintext token is shown once at creation; only its SHA-256 is
// stored. Cross-tenant access is impossible by construction: the tenant
// comes from the token, never from the URL.

import {
	getBusinessUnitDetail,
	getTenant,
	listBusinessUnits,
	type BusinessUnitDetail,
} from "./tenants";

export type Identity =
	| { kind: "platform_admin" }
	| {
			kind: "tenant_user";
			user_id: string;
			tenant_id: string;
			display_name: string;
			unit_ids: string[];
	  };

export interface TenantUserPublic {
	user_id: string;
	tenant_id: string;
	display_name: string;
	role: string;
	unit_ids: string[];
	status: string;
	created_at: string;
	note: string | null;
}

export interface PortalSession {
	/** The signed-in person's display name. Internal ids are never exposed. */
	display_name: string;
	tenant_name: string;
	white_label: boolean;
	units: Array<{
		unit_id: string;
		name: string;
		unit_type: string;
		operating_status: string;
	}>;
}

type Db = D1Database;

function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let out = 0;
	for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return out === 0;
}

/** 256-bit random access token, base64url. Shown once at creation. */
export function generateAccessToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** SHA-256 hex of the token — the only form ever stored. */
export async function hashAccessToken(token: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
	return Array.from(new Uint8Array(digest))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
}

function parseUnitIds(raw: unknown): string[] {
	if (typeof raw !== "string") return [];
	try {
		const v = JSON.parse(raw) as unknown;
		return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
	} catch {
		return [];
	}
}

function rowToPublic(row: Record<string, unknown>): TenantUserPublic {
	return {
		user_id: String(row.user_id),
		tenant_id: String(row.tenant_id),
		display_name: String(row.display_name),
		role: String(row.role ?? "tenant_user"),
		unit_ids: parseUnitIds(row.unit_ids),
		status: String(row.status ?? "active"),
		created_at: String(row.created_at ?? ""),
		note: typeof row.note === "string" ? row.note : null,
	};
}

/**
 * Resolve the request identity from the presented key (Bearer or ?key=).
 * Owner key wins without a DB lookup; anything else is checked against
 * active tenant_users by token hash. Unknown/revoked -> null.
 */
export async function resolveIdentity(
	db: Db,
	presentedKey: string,
	ownerKey: string | undefined,
): Promise<Identity | null> {
	if (!presentedKey) return null;
	if (ownerKey && timingSafeEqual(presentedKey, ownerKey)) {
		return { kind: "platform_admin" };
	}
	const tokenHash = await hashAccessToken(presentedKey);
	const row = await db
		.prepare(`SELECT * FROM tenant_users WHERE token_hash = ? AND status = 'active'`)
		.bind(tokenHash)
		.first<Record<string, unknown>>();
	if (!row) return null;
	return {
		kind: "tenant_user",
		user_id: String(row.user_id),
		tenant_id: String(row.tenant_id),
		display_name: String(row.display_name),
		unit_ids: parseUnitIds(row.unit_ids),
	};
}

export interface CreateTenantUserInput {
	display_name: string;
	/** Explicit allowlist of business_unit_id. Empty = no units. */
	unit_ids?: string[];
	note?: string | null;
}

/**
 * Create a tenant user and mint their access token. Platform-admin only
 * (enforced at the route layer). Every unit_id must belong to the tenant.
 * Returns the public user plus the plaintext token — shown once.
 */
export async function createTenantUser(
	db: Db,
	tenantId: string,
	input: CreateTenantUserInput,
): Promise<{ user: TenantUserPublic; token: string }> {
	const tenant = await getTenant(db, tenantId);
	if (!tenant) throw new Error("unknown tenant");
	const displayName = input.display_name?.trim();
	if (!displayName) throw new Error("display_name is required");
	const unitIds = Array.from(new Set(input.unit_ids ?? []));
	if (unitIds.some((u) => typeof u !== "string" || !u)) {
		throw new Error("unit_ids must be non-empty strings");
	}
	const tenantUnits = new Set((await listBusinessUnits(db, tenantId)).map((u) => u.business_unit_id));
	for (const u of unitIds) {
		if (!tenantUnits.has(u)) throw new Error(`unknown business unit for this tenant: ${u}`);
	}
	const userId = crypto.randomUUID();
	const token = generateAccessToken();
	const tokenHash = await hashAccessToken(token);
	await db
		.prepare(
			`INSERT INTO tenant_users (user_id, tenant_id, display_name, role, unit_ids, token_hash, status, note)
			 VALUES (?, ?, ?, 'tenant_user', ?, ?, 'active', ?)`,
		)
		.bind(
			userId,
			tenantId,
			displayName,
			JSON.stringify(unitIds),
			tokenHash,
			typeof input.note === "string" ? input.note : null,
		)
		.run();
	const user = await db
		.prepare(`SELECT * FROM tenant_users WHERE user_id = ?`)
		.bind(userId)
		.first<Record<string, unknown>>();
	if (!user) throw new Error("user creation failed");
	return { user: rowToPublic(user), token };
}

export async function listTenantUsers(db: Db, tenantId: string): Promise<TenantUserPublic[]> {
	const tenant = await getTenant(db, tenantId);
	if (!tenant) throw new Error("unknown tenant");
	const res = await db
		.prepare(
			`SELECT user_id, tenant_id, display_name, role, unit_ids, status, created_at, note
			 FROM tenant_users WHERE tenant_id = ? ORDER BY created_at ASC`,
		)
		.bind(tenantId)
		.all<Record<string, unknown>>();
	return res.results.map(rowToPublic);
}

export async function revokeTenantUser(
	db: Db,
	tenantId: string,
	userId: string,
): Promise<boolean> {
	const res = await db
		.prepare(`UPDATE tenant_users SET status = 'revoked' WHERE user_id = ? AND tenant_id = ? AND status = 'active'`)
		.bind(userId, tenantId)
		.run();
	return (res.meta?.changes ?? 0) > 0;
}

/**
 * Portal session for a tenant user: their name, their organization's
 * display name, and ONLY their allowlisted units. No tenant_id, no
 * user_id, no other tenant — internal terms stay server-side.
 */
export async function getPortalSession(
	db: Db,
	identity: Extract<Identity, { kind: "tenant_user" }>,
): Promise<PortalSession> {
	const tenant = await getTenant(db, identity.tenant_id);
	if (!tenant) throw new Error("unknown tenant");
	const allowed = new Set(identity.unit_ids);
	const units = (await listBusinessUnits(db, identity.tenant_id))
		.filter((u) => allowed.has(u.business_unit_id))
		.map((u) => ({
			unit_id: u.business_unit_id,
			name: u.name,
			unit_type: u.unit_type,
			operating_status: u.operating_status,
		}));
	return {
		display_name: identity.display_name,
		tenant_name: tenant.display_name,
		white_label: tenant.white_label,
		units,
	};
}

/**
 * Tenant-scoped business-unit detail. Returns null when the unit is not
 * in the user's allowlist OR belongs to another tenant — both read as
 * not-found by design.
 */
export async function getPortalUnit(
	db: Db,
	identity: Extract<Identity, { kind: "tenant_user" }>,
	unitId: string,
): Promise<BusinessUnitDetail | null> {
	if (!identity.unit_ids.includes(unitId)) return null;
	return getBusinessUnitDetail(db, identity.tenant_id, unitId);
}
