// ---------------------------------------------------------------------------
// Google Analytics 4 (read-only) — ADR-0033.
//
// NWANA already owns a GA4 property; this module connects it to the Engine
// as a read-only traffic source. No new property is created.
//
// Verified facts (owner-confirmed 2026-09-24):
//   Analytics account: NORDIC WALKING ASSOCIATION OF NORTH AMERICA (392577582)
//   GA4 property:      NORDIC WALKING ASSOCIATION OF NORTH AMERICA (534556675)
//   Google account:    admin@nwaofna.org (same account as Google Ads/Ad Grants)
//
// Operating cost: VERIFIED $0.
//   - GA4 standard has no traffic-based charge (only Analytics 360 is paid).
//   - The GA4 Data API is free; it is quota-limited (200,000 core tokens per
//     property per day for standard properties; a typical runReport consumes
//     fewer than 10 tokens). No per-call billing exists.
//   - The read path issues exactly one Data API request per owner page open.
//     No cron, no polling, no background sync, no D1 writes on read.
//   - Reuses the existing Worker and the existing `integration_credentials`
//     D1 table; no migration, no new infrastructure.
//
// Access model mirrors src/google-ads.ts: owner-initiated OAuth2 (offline
// access), refresh token AES-GCM encrypted with GOOGLE_ANALYTICS_TOKEN_KEY,
// stored per-provider in D1. Read scope is analytics.readonly; the module
// can never mutate the GA4 property. execution_allowed is always false.
// ---------------------------------------------------------------------------

export interface GoogleAnalyticsEnv {
	nwana_engine_db: D1Database;
	GOOGLE_ANALYTICS_CLIENT_ID?: string;
	GOOGLE_ANALYTICS_CLIENT_SECRET?: string;
	GOOGLE_ANALYTICS_TOKEN_KEY?: string;
}

const PROVIDER = "GOOGLE_ANALYTICS";
const REDIRECT_URI =
	"https://nwana-engine.nwana-engine.workers.dev/integrations/google-analytics/callback";
// Owner-verified 2026-09-24. Never invent a different property id.
export const GA4_PROPERTY_ID = "534556675";
const SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function fromBase64Url(value: string): Uint8Array {
	const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
	const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
	return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function keyBytes(secret: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest("SHA-256", encoder.encode(secret));
}

async function sign(value: string, secret: string): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		await keyBytes(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"],
	);
	return base64Url(new Uint8Array(
		await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
	));
}

function safeEqual(left: string, right: string): boolean {
	if (left.length !== right.length) return false;
	let difference = 0;
	for (let index = 0; index < left.length; index += 1) {
		difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
	}
	return difference === 0;
}

async function createState(secret: string): Promise<string> {
	const payload = base64Url(encoder.encode(JSON.stringify({
		issued_at: Date.now(),
		nonce: crypto.randomUUID(),
	})));
	return `${payload}.${await sign(payload, secret)}`;
}

async function verifyState(state: string, secret: string): Promise<boolean> {
	const [payload, signature, extra] = state.split(".");
	if (!payload || !signature || extra) return false;
	if (!safeEqual(signature, await sign(payload, secret))) return false;
	try {
		const parsed = JSON.parse(decoder.decode(fromBase64Url(payload))) as {
			issued_at?: number;
		};
		return typeof parsed.issued_at === "number" &&
			Date.now() - parsed.issued_at >= 0 &&
			Date.now() - parsed.issued_at <= 10 * 60 * 1000;
	} catch {
		return false;
	}
}

async function encryptRefreshToken(
	token: string,
secret: string
): Promise<{ encrypted: string; iv: string }> {
	const key = await crypto.subtle.importKey(
		"raw",
		await keyBytes(secret),
		"AES-GCM",
		false,
		["encrypt"],
	);
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = await crypto.subtle.encrypt(
		{ name: "AES-GCM", iv },
		key,
		encoder.encode(token),
	);
	return {
		encrypted: base64Url(new Uint8Array(encrypted)),
		iv: base64Url(iv),
	};
}

async function decryptRefreshToken(
	encrypted: string,
	iv: string,
secret: string
): Promise<string> {
	const key = await crypto.subtle.importKey(
		"raw",
		await keyBytes(secret),
		"AES-GCM",
		false,
		["decrypt"],
	);
	const decrypted = await crypto.subtle.decrypt(
		{ name: "AES-GCM", iv: fromBase64Url(iv) },
		key,
		fromBase64Url(encrypted),
	);
	return decoder.decode(decrypted);
}

function missingConfiguration(env: GoogleAnalyticsEnv): string[] {
	const missing: string[] = [];
	if (!env.GOOGLE_ANALYTICS_CLIENT_ID) missing.push("GOOGLE_ANALYTICS_CLIENT_ID");
	if (!env.GOOGLE_ANALYTICS_CLIENT_SECRET) missing.push("GOOGLE_ANALYTICS_CLIENT_SECRET");
	if (!env.GOOGLE_ANALYTICS_TOKEN_KEY) missing.push("GOOGLE_ANALYTICS_TOKEN_KEY");
	return missing;
}

export async function googleAnalyticsAuthorizationUrl(
	env: GoogleAnalyticsEnv,
): Promise<string> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		throw new Error(`Google Analytics configuration is missing: ${missing.join(", ")}`);
	}
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.searchParams.set("client_id", env.GOOGLE_ANALYTICS_CLIENT_ID!);
	url.searchParams.set("redirect_uri", REDIRECT_URI);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", SCOPE);
	url.searchParams.set("access_type", "offline");
	url.searchParams.set("prompt", "consent");
	url.searchParams.set("state", await createState(env.GOOGLE_ANALYTICS_TOKEN_KEY!));
	return url.toString();
}

async function exchangeAuthorizationCode(
	code: string,
	env: GoogleAnalyticsEnv,
): Promise<{ access_token: string; refresh_token?: string }> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: env.GOOGLE_ANALYTICS_CLIENT_ID!,
			client_secret: env.GOOGLE_ANALYTICS_CLIENT_SECRET!,
			redirect_uri: REDIRECT_URI,
			grant_type: "authorization_code",
		}),
	});
	const payload = await response.json() as {
		access_token?: string;
		refresh_token?: string;
		error?: string;
		error_description?: string;
	};
	if (!response.ok || !payload.access_token) {
		throw new Error(
			payload.error_description ?? payload.error ?? `OAuth token exchange failed (${response.status})`,
		);
	}
	return {
access_token: payload.access_token,
refresh_token: payload.refresh_token,
	};
}

async function refreshAccessToken(
	refreshToken: string,
	env: GoogleAnalyticsEnv,
): Promise<string> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: env.GOOGLE_ANALYTICS_CLIENT_ID!,
			client_secret: env.GOOGLE_ANALYTICS_CLIENT_SECRET!,
			refresh_token: refreshToken,
			grant_type: "refresh_token",
		}),
	});
	const payload = await response.json() as {
		access_token?: string;
		error?: string;
		error_description?: string;
	};
	if (!response.ok || !payload.access_token) {
		throw new Error(
			payload.error_description ?? payload.error ?? `OAuth token refresh failed (${response.status})`,
		);
	}
	return payload.access_token;
}

async function getStoredRefreshToken(env: GoogleAnalyticsEnv): Promise<string | null> {
	const credential = await env.nwana_engine_db.prepare(`
		SELECT encrypted_refresh_token, iv
		FROM integration_credentials
		WHERE provider = ?
		LIMIT 1
	`).bind(PROVIDER).first<{
		encrypted_refresh_token: string;
		iv: string;
	}>();
	if (!credential) return null;
	return decryptRefreshToken(
		credential.encrypted_refresh_token,
		credential.iv,
		env.GOOGLE_ANALYTICS_TOKEN_KEY!,
	);
}

// Verifies the granted token can actually read the NWANA GA4 property.
// Uses the Data API metadata endpoint (read-only, no quota-heavy report).
async function verifyPropertyAccess(accessToken: string): Promise<void> {
	const response = await fetch(
		`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}/metadata`,
		{ headers: { Authorization: `Bearer ${accessToken}` } },
	);
	if (!response.ok) {
		throw new Error(
			`Google Analytics property ${GA4_PROPERTY_ID} is not readable with this account (${response.status}); grant at least Viewer access on the property`,
		);
	}
}

export async function handleGoogleAnalyticsCallback(
	url: URL,
	env: GoogleAnalyticsEnv,
): Promise<{ property_id: string }> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		throw new Error(`Google Analytics configuration is missing: ${missing.join(", ")}`);
	}
	const error = url.searchParams.get("error");
	if (error) throw new Error(`Google authorization was not completed: ${error}`);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (!code || !state || !(await verifyState(state, env.GOOGLE_ANALYTICS_TOKEN_KEY!))) {
		throw new Error("Google OAuth callback is missing a valid code or state");
	}
	const tokens = await exchangeAuthorizationCode(code, env);
	if (!tokens.refresh_token) {
		throw new Error("Google did not return a refresh token; reconnect and grant consent");
	}
	await verifyPropertyAccess(tokens.access_token);
	const protectedToken = await encryptRefreshToken(
		tokens.refresh_token,
		env.GOOGLE_ANALYTICS_TOKEN_KEY!,
	);
	await env.nwana_engine_db.prepare(`
		INSERT INTO integration_credentials (
			provider, encrypted_refresh_token, iv, metadata
		) VALUES (?, ?, ?, ?)
		ON CONFLICT(provider) DO UPDATE SET
encrypted_refresh_token = excluded.encrypted_refresh_token,
			iv = excluded.iv,
			metadata = excluded.metadata,
			updated_at = CURRENT_TIMESTAMP
	`).bind(
		PROVIDER,
		protectedToken.encrypted,
		protectedToken.iv,
		JSON.stringify({
			scope: SCOPE,
			property_id: GA4_PROPERTY_ID,
			connected_by: "admin@nwaofna.org",
		}),
	).run();
	return { property_id: GA4_PROPERTY_ID };
}

export async function getGoogleAnalyticsStatus(env: GoogleAnalyticsEnv): Promise<{
	ok: boolean;
	connected: boolean;
	configured: boolean;
	property_id: string;
	execution_allowed: false;
	missing_configuration?: string[];
	error?: string;
}> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		return {
			ok: false,
			connected: false,
			configured: false,
			property_id: GA4_PROPERTY_ID,
			execution_allowed: false,
			missing_configuration: missing,
		};
	}
	const refreshToken = await getStoredRefreshToken(env).catch(() => null);
	if (!refreshToken) {
		return {
			ok: true,
			connected: false,
			configured: true,
			property_id: GA4_PROPERTY_ID,
			execution_allowed: false,
		};
	}
	try {
		const accessToken = await refreshAccessToken(refreshToken, env);
		await verifyPropertyAccess(accessToken);
		return {
			ok: true,
			connected: true,
			configured: true,
			property_id: GA4_PROPERTY_ID,
			execution_allowed: false,
		};
	} catch (error) {
		return {
			ok: false,
			connected: false,
			configured: true,
			property_id: GA4_PROPERTY_ID,
			execution_allowed: false,
			error: error instanceof Error ? error.message : "Google Analytics connection failed",
		};
	}
}

export const GOOGLE_ANALYTICS_REDIRECT_URI = REDIRECT_URI;

// ---------------------------------------------------------------------------
// Read-only traffic overview.
//
// One Data API runReport per call: sessions + total users for the last 28
// full days, broken down by hostname so every NWANA site gets its own row.
// No D1 writes, no caching layer, no background refresh. The Sites screen
// calls this on each page open; the owner opening the page is the trigger.
// ---------------------------------------------------------------------------

export const GA4_TRAFFIC_START = "28daysAgo";
export const GA4_TRAFFIC_END = "yesterday";

export interface Ga4HostTraffic {
	hostname: string;
	sessions: number;
	total_users: number;
}

export interface Ga4TrafficOverview {
	ok: boolean;
	property_id: string;
	date_range: string;
	totals: { sessions: number; total_users: number };
	hosts: Ga4HostTraffic[];
	error?: string;
}

export function buildTrafficReportRequest(): Record<string, unknown> {
	return {
		dateRanges: [{ startDate: GA4_TRAFFIC_START, endDate: GA4_TRAFFIC_END }],
		dimensions: [{ name: "hostName" }],
		metrics: [{ name: "sessions" }, { name: "totalUsers" }],
		orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
		limit: 50,
	};
}

async function runTrafficReport(accessToken: string): Promise<Ga4HostTraffic[]> {
	const response = await fetch(
		`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify(buildTrafficReportRequest()),
		},
	);
	const payload = await response.json() as {
		rows?: Array<{
			dimensionValues?: Array<{ value?: string }>;
			metricValues?: Array<{ value?: string }>;
		}>;
		error?: { message?: string };
	};
	if (!response.ok) {
		throw new Error(payload.error?.message ?? `GA4 Data API request failed (${response.status})`);
	}
	return (payload.rows ?? []).map((row) => ({
		hostname: row.dimensionValues?.[0]?.value ?? "",
		sessions: Number(row.metricValues?.[0]?.value ?? 0),
		total_users: Number(row.metricValues?.[1]?.value ?? 0),
	}));
}

export async function getGa4TrafficOverview(
	env: GoogleAnalyticsEnv,
): Promise<Ga4TrafficOverview> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		return {
			ok: false,
			property_id: GA4_PROPERTY_ID,
			date_range: `${GA4_TRAFFIC_START} to ${GA4_TRAFFIC_END}`,
			totals: { sessions: 0, total_users: 0 },
			hosts: [],
			error: `Not connected: ${missing.join(", ")} missing.`,
		};
	}
	try {
		const refreshToken = await getStoredRefreshToken(env);
		if (!refreshToken) {
			return {
				ok: false,
				property_id: GA4_PROPERTY_ID,
				date_range: `${GA4_TRAFFIC_START} to ${GA4_TRAFFIC_END}`,
				totals: { sessions: 0, total_users: 0 },
				hosts: [],
				error: "Not connected: no OAuth credential stored yet. Open /integrations/google-analytics/connect as the owner to connect.",
			};
		}
		const accessToken = await refreshAccessToken(refreshToken, env);
		const hosts = await runTrafficReport(accessToken);
		return {
			ok: true,
			property_id: GA4_PROPERTY_ID,
			date_range: `${GA4_TRAFFIC_START} to ${GA4_TRAFFIC_END}`,
			totals: {
				sessions: hosts.reduce((sum, h) => sum + h.sessions, 0),
				total_users: hosts.reduce((sum, h) => sum + h.total_users, 0),
			},
			hosts,
		};
	} catch (error) {
		return {
			ok: false,
			property_id: GA4_PROPERTY_ID,
			date_range: `${GA4_TRAFFIC_START} to ${GA4_TRAFFIC_END}`,
			totals: { sessions: 0, total_users: 0 },
			hosts: [],
			error: error instanceof Error ? error.message : "GA4 traffic read failed",
		};
	}
}
