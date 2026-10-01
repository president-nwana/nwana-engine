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
	  }
	| {
			/** ADR-0048: platform-admin preview of a tenant. Stateless,
			 *  short-lived, read-only; never a tenant_users row. */
			kind: "preview";
			tenant_id: string;
			unit_ids: string[];
			expires_at: number;
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

/** ADR-0048: preview tokens live 15 minutes — enough for a demo, small blast radius. */
export const PREVIEW_TOKEN_TTL_SEC = 900;

function b64urlEncode(bytes: Uint8Array): string {
	let bin = "";
	for (const b of bytes) bin += String.fromCharCode(b);
	return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
	const padded = s.replace(/-/g, "+").replace(/_/g, "/");
	const bin = atob(padded);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

async function hmacSign(key: string, data: string): Promise<string> {
	const cryptoKey = await crypto.subtle.importKey(
		"raw",
		new TextEncoder().encode(key),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	const sig = await crypto.subtle.sign("HMAC", cryptoKey, new TextEncoder().encode(data));
	return b64urlEncode(new Uint8Array(sig));
}

/** Preview tokens are `payload.signature`; tenant access tokens never contain a dot. */
function isPreviewTokenFormat(key: string): boolean {
	if (!/^[-_A-Za-z0-9]+\.[-_A-Za-z0-9]+$/.test(key)) return false;
	return key.length <= 2048;
}

interface PreviewPayload {
	v: number;
	tid: string;
	units: string[];
	exp: number;
	n: string;
}

function randomNonce(): string {
	const bytes = new Uint8Array(8);
	crypto.getRandomValues(bytes);
	return b64urlEncode(bytes);
}

/**
 * Mint a stateless preview token for a tenant (ADR-0048). No DB write —
 * no synthetic users, nothing to revoke; expiry is enforced per request.
 * unitIds defaults to ALL of the tenant's business units (what a
 * fully-licensed tenant user sees); a subset scopes "Preview as client".
 * Every unit must belong to the tenant. Only the server (which holds the
 * owner key used as the HMAC secret) can mint.
 */
export async function createPreviewToken(
	db: Db,
	ownerKey: string,
	tenantId: string,
	unitIds?: string[],
): Promise<{ token: string; tenant_id: string; unit_ids: string[]; expires_at: number }> {
	const tenant = await getTenant(db, tenantId);
	if (!tenant) throw new Error("unknown tenant");
	const tenantUnits = new Set((await listBusinessUnits(db, tenantId)).map((u) => u.business_unit_id));
	const units = Array.from(new Set(unitIds ?? Array.from(tenantUnits)));
	if (units.length === 0) throw new Error("tenant has no business units to preview");
	for (const u of units) {
		if (!tenantUnits.has(u)) throw new Error(`unknown business unit for this tenant: ${u}`);
	}
	const payload: PreviewPayload = {
		v: 1,
		tid: tenantId,
		units,
		exp: Math.floor(Date.now() / 1000) + PREVIEW_TOKEN_TTL_SEC,
		n: randomNonce(),
	};
	const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
	const sig = await hmacSign(ownerKey, payloadB64);
	return {
		token: `${payloadB64}.${sig}`,
		tenant_id: tenantId,
		unit_ids: units,
		expires_at: payload.exp,
	};
}

/**
 * Verify a preview token. Returns the preview identity or null. Rejects
 * tampered payloads, expired tokens, unknown tenants, and unit lists that
 * no longer match the tenant (defense in depth — the tenant's unit set
 * may have changed since issuance).
 */
export async function verifyPreviewToken(
	db: Db,
	ownerKey: string,
	token: string,
): Promise<Extract<Identity, { kind: "preview" }> | null> {
	if (!isPreviewTokenFormat(token)) return null;
	const [payloadB64, sigB64] = token.split(".");
	const expectedSig = await hmacSign(ownerKey, payloadB64);
	if (!timingSafeEqual(sigB64, expectedSig)) return null;
	let payload: PreviewPayload;
	try {
		payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as PreviewPayload;
	} catch {
		return null;
	}
	if (
		!payload ||
		payload.v !== 1 ||
		typeof payload.tid !== "string" ||
		!Array.isArray(payload.units) ||
		typeof payload.exp !== "number" ||
		payload.exp * 1000 <= Date.now()
	) {
		return null;
	}
	const tenant = await getTenant(db, payload.tid);
	if (!tenant) return null;
	const tenantUnits = new Set((await listBusinessUnits(db, payload.tid)).map((u) => u.business_unit_id));
	const units = payload.units.filter((u) => typeof u === "string" && tenantUnits.has(u));
	if (units.length === 0) return null;
	return { kind: "preview", tenant_id: payload.tid, unit_ids: units, expires_at: payload.exp };
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
 * Owner key wins without a DB lookup; then ADR-0048 preview tokens
 * (HMAC, stateless); anything else is checked against active tenant_users
 * by token hash. Unknown/revoked/expired -> null.
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
	if (ownerKey && isPreviewTokenFormat(presentedKey)) {
		const preview = await verifyPreviewToken(db, ownerKey, presentedKey);
		if (preview) return preview;
		return null;
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
 * Portal session for a tenant user or an ADR-0048 preview: their name,
 * their organization's display name, and ONLY their allowlisted units.
 * No tenant_id, no user_id, no other tenant — internal terms stay
 * server-side.
 */
export async function getPortalSession(
	db: Db,
	identity: Extract<Identity, { kind: "tenant_user" | "preview" }>,
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
		display_name: identity.kind === "preview" ? "Preview" : identity.display_name,
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
	identity: Extract<Identity, { kind: "tenant_user" | "preview" }>,
	unitId: string,
): Promise<BusinessUnitDetail | null> {
	if (!identity.unit_ids.includes(unitId)) return null;
	return getBusinessUnitDetail(db, identity.tenant_id, unitId);
}
