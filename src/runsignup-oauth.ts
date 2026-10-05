/**
 * RunSignup OAuth2 token lifecycle for the Engine's server-to-server API access.
 *
 * Albert's directive (2026-10-05): use OAuth2 with refresh token (option A).
 * RunSignup OAuth2: access token lives ~1 month, refresh token ~20 years.
 * Scopes: rsu_api_read + rsu_api_write.
 *
 * The previous architecture stored only a static access token with no refresh
 * flow; it broke after ~1 month with "Key authentication failed" (error 6).
 * This module implements the full lifecycle:
 * - authorization code flow (one-time, owner-driven via browser)
 * - secure token storage in D1 (refresh token never exposed via API/UI/logs)
 * - automatic refresh before expiry, with request retry after refresh
 * - explicit REAUTH_REQUIRED when the refresh token is rejected
 */

const RSU_AUTHORIZE_URL = "https://runsignup.com/Profile/OAuth2/RequestGrant";
const RSU_TOKEN_URL = "https://api.runsignup.com/rest/v2/auth/auth-code-redemption.json";

export const RSU_OAUTH_SCOPES = "rsu_api_read rsu_api_write";

// Refresh proactively when the token expires within this window.
const REFRESH_WINDOW_MS = 5 * 60 * 1000;

export type RunSignupAuthStatus =
	| "CONNECTED"
	| "TOKEN_REFRESHED"
	| "REAUTH_REQUIRED"
	| "NOT_CONFIGURED";

export class ReauthRequiredError extends Error {
	constructor(message = "RunSignup OAuth re-authorization required") {
		super(message);
		this.name = "ReauthRequiredError";
	}
}

interface StoredTokens {
	access_token: string;
	refresh_token: string;
	expires_at: string;
	scopes: string;
}

async function readStoredTokens(db: D1Database): Promise<StoredTokens | null> {
	const row = await db
		.prepare(
			`SELECT access_token, refresh_token, expires_at, scopes FROM runsignup_oauth WHERE id = 1`,
		)
		.first<StoredTokens>();
	return row ?? null;
}

export async function storeRunSignupTokens(
	db: D1Database,
	input: {
		access_token: string;
		refresh_token: string;
		expires_in: number;
		scopes: string;
	},
): Promise<void> {
	const expiresAt = new Date(Date.now() + input.expires_in * 1000).toISOString();
	await db
		.prepare(
			`INSERT INTO runsignup_oauth (id, access_token, refresh_token, expires_at, scopes, updated_at)
			 VALUES (1, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			 ON CONFLICT (id) DO UPDATE SET
				access_token = excluded.access_token,
				refresh_token = excluded.refresh_token,
				expires_at = excluded.expires_at,
				scopes = excluded.scopes,
				updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
		)
		.bind(input.access_token, input.refresh_token, expiresAt, input.scopes)
		.run();
}

interface TokenEndpointResponse {
	access_token?: string;
	token_type?: string;
	expires_in?: number;
	refresh_token?: string;
	scope?: string;
	error?: string;
	error_description?: string;
}

async function callTokenEndpoint(
	body: URLSearchParams,
): Promise<TokenEndpointResponse> {
	const resp = await fetch(RSU_TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body,
	});
	const data = (await resp.json().catch(() => ({}))) as TokenEndpointResponse;
	if (!resp.ok || !data.access_token) {
		const msg = data.error_description ?? data.error ?? `Token endpoint HTTP ${resp.status}`;
		// invalid_grant means the refresh token (or auth code) is dead.
		if (data.error === "invalid_grant") {
			throw new ReauthRequiredError(`RunSignup rejected the token: ${msg}`);
		}
		throw new Error(`RunSignup token request failed: ${msg}`);
	}
	return data;
}

/**
 * Exchange an authorization code for tokens (one-time, after owner approval).
 */
export async function exchangeAuthorizationCode(
	db: D1Database,
	input: {
		clientId: string;
		clientSecret: string;
		code: string;
		redirectUri: string;
	},
): Promise<void> {
	const tokens = await callTokenEndpoint(
		new URLSearchParams({
			grant_type: "authorization_code",
			client_id: input.clientId,
			client_secret: input.clientSecret,
			code: input.code,
			redirect_uri: input.redirectUri,
		}),
	);
	if (!tokens.refresh_token || !tokens.expires_in) {
		throw new Error("RunSignup did not return a refresh token or expiry");
	}
	await storeRunSignupTokens(db, {
		access_token: tokens.access_token!,
		refresh_token: tokens.refresh_token,
		expires_in: tokens.expires_in,
		scopes: tokens.scope ?? RSU_OAUTH_SCOPES,
	});
}

/**
 * Refresh the access token using the stored refresh token.
 * Returns the new access token. Throws ReauthRequiredError if the
 * refresh token is rejected (owner must re-authorize).
 */
export async function refreshRunSignupToken(
	db: D1Database,
	clientId: string,
	clientSecret: string,
): Promise<{ access_token: string; refreshed: boolean }> {
	const stored = await readStoredTokens(db);
	if (!stored) {
		throw new ReauthRequiredError("No RunSignup OAuth tokens stored");
	}
	const tokens = await callTokenEndpoint(
		new URLSearchParams({
			grant_type: "refresh_token",
			client_id: clientId,
			client_secret: clientSecret,
			refresh_token: stored.refresh_token,
		}),
	);
	// RunSignup may rotate the refresh token; keep the old one if not returned.
	await storeRunSignupTokens(db, {
		access_token: tokens.access_token!,
		refresh_token: tokens.refresh_token ?? stored.refresh_token,
		expires_in: tokens.expires_in ?? 2592000,
		scopes: tokens.scope ?? stored.scopes,
	});
	return { access_token: tokens.access_token!, refreshed: true };
}

/**
 * Get a valid access token, refreshing proactively before expiry.
 * This is the single entry point for all server-to-server RunSignup calls.
 */
export async function getValidRunSignupToken(
	db: D1Database,
	clientId: string,
	clientSecret: string,
): Promise<{ access_token: string; status: RunSignupAuthStatus }> {
	const stored = await readStoredTokens(db);
	if (!stored) {
		throw new ReauthRequiredError("No RunSignup OAuth tokens stored");
	}
	const expiresAt = Date.parse(stored.expires_at);
	if (
		Number.isNaN(expiresAt) ||
		expiresAt - Date.now() < REFRESH_WINDOW_MS
	) {
		const { access_token } = await refreshRunSignupToken(
			db,
			clientId,
			clientSecret,
		);
		return { access_token, status: "TOKEN_REFRESHED" };
	}
	return { access_token: stored.access_token, status: "CONNECTED" };
}

/**
 * Current auth status without triggering a refresh (for the OC widget).
 * Never exposes token values.
 */
export async function getRunSignupAuthStatus(
	db: D1Database,
): Promise<{ status: RunSignupAuthStatus; expires_at: string | null; scopes: string | null }> {
	const stored = await readStoredTokens(db);
	if (!stored) {
		return { status: "NOT_CONFIGURED", expires_at: null, scopes: null };
	}
	const expiresAt = Date.parse(stored.expires_at);
	if (Number.isNaN(expiresAt) || expiresAt < Date.now()) {
		return { status: "REAUTH_REQUIRED", expires_at: stored.expires_at, scopes: stored.scopes };
	}
	return { status: "CONNECTED", expires_at: stored.expires_at, scopes: stored.scopes };
}

/**
 * Build the RunSignup OAuth authorization URL for the one-time owner flow.
 */
export function buildRunSignupAuthorizeUrl(input: {
	clientId: string;
	redirectUri: string;
	state: string;
}): string {
	const params = new URLSearchParams({
		response_type: "code",
		client_id: input.clientId,
		redirect_uri: input.redirectUri,
		scope: RSU_OAUTH_SCOPES,
		state: input.state,
	});
	return `${RSU_AUTHORIZE_URL}?${params.toString()}`;
}

export interface RunSignupEnvLike {
	RUNSIGNUP_ACCESS_TOKEN?: string;
	RUNSIGNUP_OAUTH_CLIENT_ID?: string;
	RUNSIGNUP_OAUTH_CLIENT_SECRET?: string;
	nwana_engine_db: D1Database;
}

/**
 * Resolve a working RunSignup access token for server-to-server calls.
 *
 * Prefers OAuth2 with auto-refresh when the client is configured and tokens
 * are stored; falls back to the legacy static RUNSIGNUP_ACCESS_TOKEN so
 * existing flows keep working during the migration.
 */
export async function resolveRunSignupAccessToken(
	env: RunSignupEnvLike,
): Promise<string> {
	const clientId = env.RUNSIGNUP_OAUTH_CLIENT_ID;
	const clientSecret = env.RUNSIGNUP_OAUTH_CLIENT_SECRET;
	if (clientId && clientSecret) {
		try {
			const { access_token } = await getValidRunSignupToken(
				env.nwana_engine_db,
				clientId,
				clientSecret,
			);
			return access_token;
		} catch (error) {
			if (error instanceof ReauthRequiredError) {
				throw error;
			}
			// Refresh failed for a transient reason; fall through to static.
			console.error("OAuth token refresh failed, falling back to static token:", error instanceof Error ? error.message : error);
		}
	}
	if (env.RUNSIGNUP_ACCESS_TOKEN) {
		return env.RUNSIGNUP_ACCESS_TOKEN;
	}
	throw new ReauthRequiredError("No RunSignup credentials configured");
}
