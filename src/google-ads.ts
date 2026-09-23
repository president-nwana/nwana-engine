export interface GoogleAdsEnv {
	nwana_engine_db: D1Database;
	GOOGLE_ADS_CLIENT_ID?: string;
	GOOGLE_ADS_CLIENT_SECRET?: string;
	GOOGLE_ADS_TOKEN_KEY?: string;
}

const PROVIDER = "GOOGLE_ADS";
const REDIRECT_URI =
	"https://nwana-engine.nwana-engine.workers.dev/integrations/google-ads/callback";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const API_VERSION = "v22";
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
	refreshToken: string,
	secret: string,
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
		encoder.encode(refreshToken),
	);
	return {
		encrypted: base64Url(new Uint8Array(encrypted)),
		iv: base64Url(iv),
	};
}

async function decryptRefreshToken(
	encrypted: string,
	iv: string,
	secret: string,
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

function missingConfiguration(env: GoogleAdsEnv): string[] {
	const missing: string[] = [];
	if (!env.GOOGLE_ADS_CLIENT_ID) missing.push("GOOGLE_ADS_CLIENT_ID");
	if (!env.GOOGLE_ADS_CLIENT_SECRET) missing.push("GOOGLE_ADS_CLIENT_SECRET");
	if (!env.GOOGLE_ADS_TOKEN_KEY) missing.push("GOOGLE_ADS_TOKEN_KEY");
	return missing;
}

export async function googleAdsAuthorizationUrl(
	env: GoogleAdsEnv,
): Promise<string> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		throw new Error(`Google Ads configuration is missing: ${missing.join(", ")}`);
	}
	const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
	url.searchParams.set("client_id", env.GOOGLE_ADS_CLIENT_ID!);
	url.searchParams.set("redirect_uri", REDIRECT_URI);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("scope", SCOPE);
	url.searchParams.set("access_type", "offline");
	url.searchParams.set("prompt", "consent");
	url.searchParams.set("state", await createState(env.GOOGLE_ADS_TOKEN_KEY!));
	return url.toString();
}

async function exchangeAuthorizationCode(
	code: string,
	env: GoogleAdsEnv,
): Promise<{ access_token: string; refresh_token?: string }> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			code,
			client_id: env.GOOGLE_ADS_CLIENT_ID!,
			client_secret: env.GOOGLE_ADS_CLIENT_SECRET!,
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
	env: GoogleAdsEnv,
): Promise<string> {
	const response = await fetch("https://oauth2.googleapis.com/token", {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			client_id: env.GOOGLE_ADS_CLIENT_ID!,
			client_secret: env.GOOGLE_ADS_CLIENT_SECRET!,
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
			payload.error_description ?? payload.error ?? `OAuth refresh failed (${response.status})`,
		);
	}
	return payload.access_token;
}

async function listAccessibleCustomers(
	accessToken: string,
	env: GoogleAdsEnv,
): Promise<string[]> {
	const response = await fetch(
		`https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,
		{
			headers: {
				Authorization: `Bearer ${accessToken}`,
			},
		},
	);
	const payload = await response.json() as {
		resourceNames?: string[];
		error?: { message?: string };
	};
	if (!response.ok) {
		throw new Error(payload.error?.message ?? `Google Ads request failed (${response.status})`);
	}
	return payload.resourceNames ?? [];
}

export async function handleGoogleAdsCallback(
	url: URL,
	env: GoogleAdsEnv,
): Promise<{ customers: string[] }> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		throw new Error(`Google Ads configuration is missing: ${missing.join(", ")}`);
	}
	const error = url.searchParams.get("error");
	if (error) throw new Error(`Google authorization was not completed: ${error}`);
	const code = url.searchParams.get("code");
	const state = url.searchParams.get("state");
	if (!code || !state || !(await verifyState(state, env.GOOGLE_ADS_TOKEN_KEY!))) {
		throw new Error("Google OAuth callback is missing a valid code or state");
	}
	const tokens = await exchangeAuthorizationCode(code, env);
	if (!tokens.refresh_token) {
		throw new Error("Google did not return a refresh token; reconnect and grant consent");
	}
	const customers = await listAccessibleCustomers(tokens.access_token, env);
	const protectedToken = await encryptRefreshToken(
		tokens.refresh_token,
		env.GOOGLE_ADS_TOKEN_KEY!,
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
			customers,
			connected_by: "admin@nwaofna.org",
		}),
	).run();
	return { customers };
}

export async function getGoogleAdsStatus(env: GoogleAdsEnv): Promise<{
	ok: boolean;
	connected: boolean;
	configured: boolean;
	access_level: "EXPLORER";
	customers: string[];
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
			access_level: "EXPLORER",
			customers: [],
			execution_allowed: false,
			missing_configuration: missing,
		};
	}
	const credential = await env.nwana_engine_db.prepare(`
		SELECT encrypted_refresh_token, iv
		FROM integration_credentials
		WHERE provider = ?
		LIMIT 1
	`).bind(PROVIDER).first<{
		encrypted_refresh_token: string;
		iv: string;
	}>();
	if (!credential) {
		return {
			ok: true,
			connected: false,
			configured: true,
			access_level: "EXPLORER",
			customers: [],
			execution_allowed: false,
		};
	}
	try {
		const refreshToken = await decryptRefreshToken(
			credential.encrypted_refresh_token,
			credential.iv,
			env.GOOGLE_ADS_TOKEN_KEY!,
		);
		const accessToken = await refreshAccessToken(refreshToken, env);
		const customers = await listAccessibleCustomers(accessToken, env);
		return {
			ok: true,
			connected: true,
			configured: true,
			access_level: "EXPLORER",
			customers,
			execution_allowed: false,
		};
	} catch (error) {
		return {
			ok: false,
			connected: false,
			configured: true,
			access_level: "EXPLORER",
			customers: [],
			execution_allowed: false,
			error: error instanceof Error ? error.message : "Google Ads connection failed",
		};
	}
}

export const GOOGLE_ADS_REDIRECT_URI = REDIRECT_URI;

// ---------------------------------------------------------------------------
// Read-only live account snapshot (ADR-0030).
//
// Bounded read-only GAQL query: one request per call, no mutations, no
// polling, nothing is written to D1. The overview screen may call this on
// each page open; there is no background synchronization.
// ---------------------------------------------------------------------------

export const GOOGLE_ADS_LIVE_CUSTOMER_ID = "6758500147";
export const GOOGLE_ADS_METRICS_RANGE = "LAST_30_DAYS";

export interface GoogleAdsLiveCampaign {
	id: string;
	name: string;
	status: string;
	daily_budget_usd: number;
	impressions: number;
	clicks: number;
	conversions: number;
	cost_usd: number;
}

export interface GoogleAdsAccountSnapshot {
	ok: boolean;
	customer_id: string;
	date_range: string;
	campaigns: GoogleAdsLiveCampaign[];
	error?: string;
}

async function searchLiveCampaigns(
	accessToken: string,
	customerId: string,
): Promise<GoogleAdsLiveCampaign[]> {
	const query = [
		"SELECT campaign.id, campaign.name, campaign.status,",
		"campaign_budget.amount_micros,",
		"metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros",
		"FROM campaign",
		"WHERE campaign.status != 'REMOVED'",
		`DURING ${GOOGLE_ADS_METRICS_RANGE}`,
	].join(" ");
	const response = await fetch(
		`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ query }),
		},
	);
	const payload = await response.json() as {
		results?: Array<{
			campaign?: { id?: string; name?: string; status?: string };
			campaignBudget?: { amountMicros?: string };
			metrics?: { impressions?: string; clicks?: string; conversions?: string; costMicros?: string };
		}>;
		error?: { message?: string };
	};
	if (!response.ok) {
		throw new Error(payload.error?.message ?? `Google Ads request failed (${response.status})`);
	}
	return (payload.results ?? []).map((row) => ({
		id: row.campaign?.id ?? "",
		name: row.campaign?.name ?? "",
		status: row.campaign?.status ?? "UNKNOWN",
		daily_budget_usd: Number(row.campaignBudget?.amountMicros ?? 0) / 1_000_000,
		impressions: Number(row.metrics?.impressions ?? 0),
		clicks: Number(row.metrics?.clicks ?? 0),
		conversions: Number(row.metrics?.conversions ?? 0),
		cost_usd: Number(row.metrics?.costMicros ?? 0) / 1_000_000,
	}));
}

export async function getGoogleAdsAccountSnapshot(
	env: GoogleAdsEnv,
	customerId: string = GOOGLE_ADS_LIVE_CUSTOMER_ID,
): Promise<GoogleAdsAccountSnapshot> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		return {
			ok: false,
			customer_id: customerId,
			date_range: GOOGLE_ADS_METRICS_RANGE,
			campaigns: [],
			error: `Not connected: ${missing.join(", ")} missing.`,
		};
	}
	try {
		const credential = await env.nwana_engine_db.prepare(`
			SELECT encrypted_refresh_token, iv
			FROM integration_credentials
			WHERE provider = ?
			LIMIT 1
		`).bind(PROVIDER).first<{
			encrypted_refresh_token: string;
			iv: string;
		}>();
		if (!credential) {
			return {
				ok: false,
				customer_id: customerId,
				date_range: GOOGLE_ADS_METRICS_RANGE,
				campaigns: [],
				error: "Not connected: no OAuth credential stored yet.",
			};
		}
		const refreshToken = await decryptRefreshToken(
			credential.encrypted_refresh_token,
			credential.iv,
			env.GOOGLE_ADS_TOKEN_KEY!,
		);
		const accessToken = await refreshAccessToken(refreshToken, env);
		const campaigns = await searchLiveCampaigns(accessToken, customerId);
		return {
			ok: true,
			customer_id: customerId,
			date_range: GOOGLE_ADS_METRICS_RANGE,
			campaigns,
		};
	} catch (error) {
		return {
			ok: false,
			customer_id: customerId,
			date_range: GOOGLE_ADS_METRICS_RANGE,
			campaigns: [],
			error: error instanceof Error ? error.message : "Google Ads account read failed",
		};
	}
}
