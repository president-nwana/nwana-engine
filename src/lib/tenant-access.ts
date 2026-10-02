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

export type UserRole = "platform_admin" | "tenant_owner" | "tenant_admin" | "business_unit_user" | "demo_user";

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
		/** Unified login session (email+password). Stateless HMAC token. */
		kind: "session";
		user_id: string;
		email: string;
		role: UserRole;
		tenant_id: string;
		display_name: string;
		unit_ids: string[];
		expires_at: number;
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
	email: string | null;
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

export function timingSafeEqual(a: string, b: string): boolean {
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
		(payload as { typ?: string }).typ === "session" ||
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
		email: typeof row.email === "string" ? row.email : null,
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
		const session = await verifySessionToken(db, ownerKey, presentedKey);
		if (session) return session;
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
	identity: Extract<Identity, { kind: "tenant_user" | "preview" | "session" }>,
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
	identity: Extract<Identity, { kind: "tenant_user" | "preview" | "session" }>,
	unitId: string,
): Promise<BusinessUnitDetail | null> {
	if (!identity.unit_ids.includes(unitId)) return null;
	return getBusinessUnitDetail(db, identity.tenant_id, unitId);
}

/* ------------------------------------------------------------------ */
/* Unified login: email + password → HMAC session token (2026-10-02).  */
/* ------------------------------------------------------------------ */

/** Session TTL: 12 hours. */
export const SESSION_TOKEN_TTL_SEC = 12 * 3600;

const PBKDF2_ITERATIONS = 210000;

/**
 * Password hashing: PBKDF2-HMAC-SHA-256, 210k iterations, 16-byte salt.
 * Stored format: `pbkdf2$210000$<salt-b64url>$<hash-b64url>`.
 * Plaintext passwords are never stored or logged.
 */
export async function hashPassword(password: string): Promise<string> {
	const salt = new Uint8Array(16);
	crypto.getRandomValues(salt);
	const key = await crypto.subtle.importKey(
		"raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt: salt as BufferSource, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
		key, 256,
	);
	return `pbkdf2$${PBKDF2_ITERATIONS}$${b64urlEncode(salt)}$${b64urlEncode(new Uint8Array(bits))}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split("$");
	if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
	const iterations = parseInt(parts[1], 10);
	if (!Number.isFinite(iterations) || iterations < 100000) return false;
	let salt: Uint8Array;
	let expected: Uint8Array;
	try {
		salt = b64urlDecode(parts[2]);
		expected = b64urlDecode(parts[3]);
	} catch {
		return false;
	}
	const key = await crypto.subtle.importKey(
		"raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"],
	);
	const bits = await crypto.subtle.deriveBits(
		{ name: "PBKDF2", salt: salt as BufferSource, iterations, hash: "SHA-256" },
		key, expected.length * 8,
	);
	const actual = new Uint8Array(bits);
	if (actual.length !== expected.length) return false;
	let diff = 0;
	for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
	return diff === 0;
}

interface SessionPayload {
	v: number;
	typ: "session";
	uid: string;
	email: string;
	role: UserRole;
	tid: string;
	units: string[];
	exp: number;
	n: string;
}

/**
 * Mint a stateless session token after successful email/password login.
 * Signed with the server HMAC secret (owner key). The session carries
 * user id, email, role, tenant, and unit allowlist — post-login routing
 * is derived from it, never from client input.
 */
export async function createSessionToken(
	db: Db,
	hmacSecret: string,
	user: { user_id: string; email: string; role: string; tenant_id: string; display_name: string; unit_ids: string[] },
): Promise<{ token: string; expires_at: number }> {
	const role = user.role as UserRole;
	const payload: SessionPayload = {
		v: 1,
		typ: "session",
		uid: user.user_id,
		email: user.email,
		role,
		tid: user.tenant_id,
		units: user.unit_ids,
		exp: Math.floor(Date.now() / 1000) + SESSION_TOKEN_TTL_SEC,
		n: randomNonce(),
	};
	const payloadB64 = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
	const sig = await hmacSign(hmacSecret, payloadB64);
	return {
		token: `${payloadB64}.${sig}`,
		expires_at: payload.exp,
	};
}

/**
 * Verify a session token. Returns the session identity or null.
 * Re-validates the user row (revoked users lose their sessions) and the
 * tenant/unit set (defense in depth).
 */
export async function verifySessionToken(
	db: Db,
	hmacSecret: string,
	token: string,
): Promise<Extract<Identity, { kind: "session" }> | null> {
	if (!isPreviewTokenFormat(token)) return null;
	const [payloadB64, sigB64] = token.split(".");
	const expectedSig = await hmacSign(hmacSecret, payloadB64);
	if (!timingSafeEqual(sigB64, expectedSig)) return null;
	let payload: SessionPayload;
	try {
		payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64))) as SessionPayload;
	} catch {
		return null;
	}
	if (
		!payload || payload.v !== 1 || payload.typ !== "session" ||
		typeof payload.uid !== "string" || typeof payload.email !== "string" ||
		typeof payload.role !== "string" || typeof payload.tid !== "string" ||
		!Array.isArray(payload.units) || typeof payload.exp !== "number" ||
		payload.exp * 1000 <= Date.now()
	) {
		return null;
	}
	// Re-validate the user row: revoked or deleted users lose sessions.
	const row = await db
		.prepare("SELECT user_id, email, role, tenant_id, display_name, unit_ids, status FROM tenant_users WHERE user_id = ?")
		.bind(payload.uid)
		.first<{
			user_id: string; email: string | null; role: string; tenant_id: string;
			display_name: string; unit_ids: string; status: string;
		}>();
	if (!row || row.status !== "active") return null;
	if (row.tenant_id !== payload.tid || row.role !== payload.role) return null;
	const tenantUnits = new Set((await listBusinessUnits(db, payload.tid)).map((u) => u.business_unit_id));
	const units = payload.units.filter((u) => typeof u === "string" && tenantUnits.has(u));
	return {
		kind: "session",
		user_id: row.user_id,
		email: row.email ?? payload.email,
		role: row.role as UserRole,
		tenant_id: row.tenant_id,
		display_name: row.display_name,
		unit_ids: units,
		expires_at: payload.exp,
	};
}

/** Look up an active user by email for login. */
export async function findUserByEmail(
	db: Db,
	email: string,
): Promise<{
	user_id: string; email: string; role: string; tenant_id: string;
	display_name: string; unit_ids: string[]; password_hash: string | null; status: string;
} | null> {
	const row = await db
		.prepare("SELECT user_id, email, role, tenant_id, display_name, unit_ids, password_hash, status FROM tenant_users WHERE email = ?")
		.bind(email.toLowerCase().trim())
		.first<{
			user_id: string; email: string; role: string; tenant_id: string;
			display_name: string; unit_ids: string; password_hash: string | null; status: string;
		}>();
	if (!row || row.status !== "active" || !row.password_hash) return null;
	return {
		user_id: row.user_id,
		email: row.email,
		role: row.role,
		tenant_id: row.tenant_id,
		display_name: row.display_name,
		unit_ids: parseUnitIds(row.unit_ids),
		password_hash: row.password_hash,
		status: row.status,
	};
}

export interface CreateLoginUserInput {
	email: string;
	password: string;
	display_name: string;
	role: UserRole;
	unit_ids?: string[];
	note?: string | null;
}

/**
 * Create a user with email/password login (unified auth).
 * Platform-admin only (enforced at the route layer). The password is
 * hashed with PBKDF2; plaintext is never stored.
 */
export async function createLoginUser(
	db: Db,
	tenantId: string,
	input: CreateLoginUserInput,
): Promise<TenantUserPublic> {
	const email = input.email.toLowerCase().trim();
	if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("invalid email");
	if (!input.password || input.password.length < 12) throw new Error("password must be at least 12 characters");
	if (!input.display_name.trim()) throw new Error("display_name is required");
	const validRoles: UserRole[] = ["platform_admin", "tenant_owner", "tenant_admin", "business_unit_user", "demo_user"];
	if (!validRoles.includes(input.role)) throw new Error("invalid role");
	const tenant = await getTenant(db, tenantId);
	if (!tenant) throw new Error("unknown tenant");
	const tenantUnits = new Set((await listBusinessUnits(db, tenantId)).map((u) => u.business_unit_id));
	const unitIds = Array.from(new Set(input.unit_ids ?? []));
	for (const u of unitIds) {
		if (!tenantUnits.has(u)) throw new Error(`unknown business unit for this tenant: ${u}`);
	}
	// demo_user must belong to the demo tenant; platform_admin has no tenant scope.
	if (input.role === "demo_user" && tenant.status !== "demo") {
		throw new Error("demo_user role requires a demo tenant");
	}
	const userId = `u_${randomNonce()}`;
	const passwordHash = await hashPassword(input.password);
	try {
		await db
			.prepare(
				`INSERT INTO tenant_users (user_id, tenant_id, display_name, role, unit_ids, email, password_hash, note)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(userId, tenantId, input.display_name.trim(), input.role, JSON.stringify(unitIds), email, passwordHash, input.note ?? null)
			.run();
	} catch (e) {
		if (String(e).includes("UNIQUE") && String(e).includes("email")) {
			throw new Error("email already registered");
		}
		throw e;
	}
	return {
		user_id: userId,
		tenant_id: tenantId,
		display_name: input.display_name.trim(),
		role: input.role,
		unit_ids: unitIds,
		status: "active",
		created_at: new Date().toISOString(),
		note: input.note ?? null,
		email,
	};
}

/* ------------------------------------------------------------------ */
/* One-time bootstrap (2026-10-02).                                     */
/*                                                                     */
/* If no platform_admin login user exists, /login offers a protected   */
/* one-time bootstrap. The owner key is NEVER typed into a browser:    */
/* an authorized internal process (holding the owner key server-side)  */
/* mints a single-use, short-lived grant via /api/auth/bootstrap/begin */
/* (owner-key gated). The grant token travels over an authenticated    */
/* channel to the person doing setup; they enter it in the /login      */
/* bootstrap form with email/password/display name. After the first    */
/* platform_admin is created, bootstrap closes permanently — the       */
/* server re-checks on every attempt, even direct endpoint calls.      */
/* ------------------------------------------------------------------ */

/** True if a platform_admin with email/password login exists. */
export async function bootstrapClosed(db: Db): Promise<boolean> {
	const row = await db
		.prepare(
			`SELECT COUNT(*) as c FROM tenant_users
			 WHERE role = 'platform_admin' AND password_hash IS NOT NULL AND status = 'active'`,
		)
		.first<{ c: number }>();
	return Number(row?.c ?? 0) > 0;
}

/** Grant lifetime: 30 minutes. Single use. */
export const BOOTSTRAP_GRANT_TTL_MS = 30 * 60 * 1000;

async function sha256Hex(text: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Mint a single-use bootstrap grant. Caller must have verified the owner
 * key already (the /api/auth/bootstrap/begin route is owner-key gated).
 * Refuses when bootstrap is closed.
 */
export async function mintBootstrapGrant(
	db: Db,
): Promise<{ grant_token: string; expires_at: string }> {
	if (await bootstrapClosed(db)) {
		throw new Error("bootstrap is closed: a platform administrator already exists");
	}
	const tokenBytes = new Uint8Array(32);
	crypto.getRandomValues(tokenBytes);
	const grantToken = [...tokenBytes].map((b) => b.toString(16).padStart(2, "0")).join("");
	const grantId = `bsg_${grantToken.slice(0, 16)}`;
	const expiresAt = new Date(Date.now() + BOOTSTRAP_GRANT_TTL_MS).toISOString();
	await db
		.prepare(
			`INSERT INTO bootstrap_grants (grant_id, token_hash, expires_at)
			 VALUES (?, ?, ?)`,
		)
		.bind(grantId, await sha256Hex(grantToken), expiresAt)
		.run();
	// The plaintext token is returned ONCE to the authorized minter.
	// Only its hash is stored. Never log it.
	return { grant_token: grantToken, expires_at: expiresAt };
}

/**
 * Consume a bootstrap grant (single-use, expiry-checked). Returns true
 * when the grant was valid and is now consumed.
 */
export async function consumeBootstrapGrant(db: Db, grantToken: string): Promise<boolean> {
	if (!grantToken || typeof grantToken !== "string") return false;
	const tokenHash = await sha256Hex(grantToken);
	const now = new Date().toISOString();
	const res = await db
		.prepare(
			`UPDATE bootstrap_grants
			 SET used_at = ?
			 WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
		)
		.bind(now, tokenHash, now)
		.run();
	return (res.meta?.changes ?? 0) > 0;
}

/**
 * Create the first platform_admin via bootstrap. Requires a valid,
 * unconsumed grant token (single-use). Refuses if bootstrap is closed.
 * The caller must have validated input; the password is hashed here.
 */
export async function bootstrapFirstAdmin(
	db: Db,
	grantToken: string,
	input: { email: string; password: string; display_name: string },
): Promise<TenantUserPublic> {
	if (await bootstrapClosed(db)) {
		throw new Error("bootstrap is closed: a platform administrator already exists");
	}
	const consumed = await consumeBootstrapGrant(db, grantToken);
	if (!consumed) {
		throw new Error("invalid, expired, or already-used setup code");
	}
	// Re-check after consuming: a concurrent bootstrap must not create a
	// second first-admin. (The loser gets a clear error, not a duplicate.)
	if (await bootstrapClosed(db)) {
		throw new Error("bootstrap is closed: a platform administrator already exists");
	}
	// The first admin belongs to the nwana tenant (platform operator).
	// They administer all tenants from /admin.
	return createLoginUser(db, "nwana", {
		email: input.email,
		password: input.password,
		display_name: input.display_name,
		role: "platform_admin",
		unit_ids: [],
		note: "First platform administrator (bootstrap)",
	});
}

/** List all users across tenants (platform admin only). */
export async function listAllUsers(db: Db): Promise<TenantUserPublic[]> {
	const rows = await db
		.prepare("SELECT * FROM tenant_users ORDER BY tenant_id, email")
		.all<Record<string, unknown>>();
	return (rows.results ?? []).map(rowToPublic);
}

/**
 * Revoke a user (set status='revoked'). Cannot revoke the last active
 * platform_admin — the platform must always have an administrator.
 */
export async function revokeLoginUser(db: Db, userId: string): Promise<void> {
	const row = await db
		.prepare("SELECT user_id, role FROM tenant_users WHERE user_id = ?")
		.bind(userId)
		.first<{ user_id: string; role: string }>();
	if (!row) throw new Error("user not found");
	if (row.role === "platform_admin") {
		const others = await db
			.prepare(
				`SELECT COUNT(*) as c FROM tenant_users
				 WHERE role = 'platform_admin' AND status = 'active' AND user_id != ?`,
			)
			.bind(userId)
			.first<{ c: number }>();
		if (Number(others?.c ?? 0) === 0) {
			throw new Error("cannot revoke the last active platform administrator");
		}
	}
	await db
		.prepare("UPDATE tenant_users SET status = 'revoked' WHERE user_id = ?")
		.bind(userId)
		.run();
}

/**
 * Reactivate a revoked user (set status='active').
 */
export async function reactivateLoginUser(db: Db, userId: string): Promise<void> {
	const row = await db
		.prepare("SELECT user_id FROM tenant_users WHERE user_id = ?")
		.bind(userId)
		.first<{ user_id: string }>();
	if (!row) throw new Error("user not found");
	await db
		.prepare("UPDATE tenant_users SET status = 'active' WHERE user_id = ?")
		.bind(userId)
		.run();
}

/**
 * Set a new password for a user (hash server-side, never store/log plaintext).
 * Password must be at least 12 characters.
 */
export async function setUserPassword(
	db: Db,
	userId: string,
	newPassword: string,
): Promise<void> {
	if (typeof newPassword !== "string" || newPassword.length < 12) {
		throw new Error("password must be at least 12 characters");
	}
	const row = await db
		.prepare("SELECT user_id FROM tenant_users WHERE user_id = ?")
		.bind(userId)
		.first<{ user_id: string }>();
	if (!row) throw new Error("user not found");
	const stored = await hashPassword(newPassword);
	await db
		.prepare("UPDATE tenant_users SET password_hash = ? WHERE user_id = ?")
		.bind(stored, userId)
		.run();
}
