import type { CanonicalMetric, MetricQuality } from "./canonical-metrics";

export interface GoogleAdsEnv {
	nwana_engine_db: D1Database;
	GOOGLE_ADS_CLIENT_ID?: string;
	GOOGLE_ADS_CLIENT_SECRET?: string;
	GOOGLE_ADS_TOKEN_KEY?: string;
	// Google Ads API developer token (legacy). Sunset by Google on 2026-09-09:
	// the header is optional and ignored by the API servers; access level is
	// determined by the Google Cloud project that owns the OAuth client.
	// Kept only so existing deployments that still set it keep working.
	GOOGLE_ADS_DEVELOPER_TOKEN?: string;
}

const PROVIDER = "GOOGLE_ADS";
const REDIRECT_URI =
	"https://nwana-engine.nwana-engine.workers.dev/integrations/google-ads/callback";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const API_VERSION = "v22";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

// Headers for every googleads.googleapis.com call. Since Google's 2026-09-09
// developer-token sunset, the developer-token header is optional and ignored
// by the API servers; access level is determined by the Google Cloud project
// that owns the OAuth client. The header is attached only when a legacy token
// is still configured, so existing deployments keep working unchanged.
function googleAdsApiHeaders(
	accessToken: string,
	env: GoogleAdsEnv,
): Record<string, string> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${accessToken}`,
		"content-type": "application/json",
	};
	if (env.GOOGLE_ADS_DEVELOPER_TOKEN) {
		headers["developer-token"] = env.GOOGLE_ADS_DEVELOPER_TOKEN;
	}
	return headers;
}

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

export async function encryptRefreshToken(
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
			headers: googleAdsApiHeaders(accessToken, env),
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
// Exact range matching the owner's Google Ads UI (Aug 26 - Sep 23, 2026),
// so live metrics line up with what the UI shows. No predefined relative
// range: relative ranges drift away from the UI's fixed window.
export const GOOGLE_ADS_METRICS_START = "2026-08-26";
export const GOOGLE_ADS_METRICS_END = "2026-09-23";
export const GOOGLE_ADS_METRICS_LABEL = `${GOOGLE_ADS_METRICS_START} to ${GOOGLE_ADS_METRICS_END}`;

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

export interface GoogleAdsConversionAction {
	id: string;
	name: string;
	type: string;
	category: string;
	status: string;
	primary_for_goal: boolean;
}

export async function getConversionActions(
	env: GoogleAdsEnv,
	customerId: string = GOOGLE_ADS_LIVE_CUSTOMER_ID,
): Promise<{
	ok: boolean;
	customer_id: string;
	conversion_actions: GoogleAdsConversionAction[];
	error?: string;
}> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		return {
			ok: false,
			customer_id: customerId,
			conversion_actions: [],
			error: `Not connected: ${missing.join(", ")} missing.`,
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
			ok: false,
			customer_id: customerId,
			conversion_actions: [],
			error: "Not connected: no OAuth credential stored yet.",
		};
	}
	try {
		const refreshToken = await decryptRefreshToken(
			credential.encrypted_refresh_token,
			credential.iv,
			env.GOOGLE_ADS_TOKEN_KEY!,
		);
		const accessToken = await refreshAccessToken(refreshToken, env);
		const query =
			"SELECT conversion_action.id, conversion_action.name, conversion_action.type, " +
			"conversion_action.category, conversion_action.status, conversion_action.primary_for_goal " +
			"FROM conversion_action WHERE conversion_action.status != 'REMOVED' " +
			"ORDER BY conversion_action.name";
		const response = await fetch(
			`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
			{
				method: "POST",
				headers: googleAdsApiHeaders(accessToken, env),
				body: JSON.stringify({ query }),
			},
		);
		const payload = await response.json() as {
			results?: Array<{
				conversionAction?: {
					id?: string;
					name?: string;
					type?: string;
					category?: string;
					status?: string;
					primaryForGoal?: boolean;
				};
			}>;
			error?: { message?: string };
		};
		if (!response.ok) {
			throw new Error(payload.error?.message ?? `Google Ads request failed (${response.status})`);
		}
		return {
			ok: true,
			customer_id: customerId,
			conversion_actions: (payload.results ?? []).map((row) => ({
				id: row.conversionAction?.id ?? "",
				name: row.conversionAction?.name ?? "",
				type: row.conversionAction?.type ?? "UNKNOWN",
				category: row.conversionAction?.category ?? "UNKNOWN",
				status: row.conversionAction?.status ?? "UNKNOWN",
				primary_for_goal: row.conversionAction?.primaryForGoal ?? false,
			})),
		};
	} catch (error) {
		return {
			ok: false,
			customer_id: customerId,
			conversion_actions: [],
			error: error instanceof Error ? error.message : "Google Ads conversion actions read failed",
		};
	}
}

export function buildLiveCampaignsQuery(): string {
	return [
		"SELECT campaign.id, campaign.name, campaign.status,",
		"campaign_budget.amount_micros,",
		"metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros",
		"FROM campaign",
		"WHERE campaign.status != 'REMOVED'",
		`AND segments.date BETWEEN '${GOOGLE_ADS_METRICS_START}' AND '${GOOGLE_ADS_METRICS_END}'`,
	].join(" ");
}

async function searchLiveCampaigns(
	accessToken: string,
	customerId: string,
	env: GoogleAdsEnv,
): Promise<GoogleAdsLiveCampaign[]> {
	const query = buildLiveCampaignsQuery();
	const response = await fetch(
		`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
		{
			method: "POST",
			headers: googleAdsApiHeaders(accessToken, env),
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
			date_range: GOOGLE_ADS_METRICS_LABEL,
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
				date_range: GOOGLE_ADS_METRICS_LABEL,
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
		const campaigns = await searchLiveCampaigns(accessToken, customerId, env);
		return {
			ok: true,
			customer_id: customerId,
			date_range: GOOGLE_ADS_METRICS_LABEL,
			campaigns,
		};
	} catch (error) {
		return {
			ok: false,
			customer_id: customerId,
			date_range: GOOGLE_ADS_METRICS_LABEL,
			campaigns: [],
			error: error instanceof Error ? error.message : "Google Ads account read failed",
		};
	}
}

// ---------------------------------------------------------------------------
// Parameterized live metrics read path (canonical metrics layer).
//
// Unlike the legacy snapshot above, these queries accept an arbitrary date
// window and customer id, and return normalized CanonicalMetric records
// (from ./canonical-metrics) so the Operating Center and any export read
// from the same data layer. No developer token is required (sunset
// 2026-09-09): authentication is OAuth via the Google Cloud project that
// owns the client. Read-only: one GAQL request per query, no mutations,
// no D1 writes, on-demand only (no polling).
// ---------------------------------------------------------------------------

export interface GoogleAdsMetricCampaign {
	id: string;
	name: string;
	status: string;
	impressions: number;
	clicks: number;
	ctr: number; // percent, computed as clicks / impressions * 100
	cost_usd: number;
	conversions: number;
	conversions_value: number;
	conversion_rate: number; // percent, computed as conversions / clicks * 100
}

export interface GoogleAdsMetricAdGroup extends GoogleAdsMetricCampaign {
	campaign_id: string;
	campaign_name: string;
}

export interface GoogleAdsMetricGeo {
	country: string; // geoTargetConstants resource name; display names need a GeoTargetConstant lookup
	impressions: number;
	clicks: number;
	cost_usd: number;
	conversions: number;
}

export interface GoogleAdsMetricConversionAction {
	conversion_action: string; // resource name, e.g. customers/123/conversionActions/456
	action_id: string;
	conversions: number;
	conversions_value: number;
}

export interface GoogleAdsMetricsResult {
	ok: boolean;
	customer_id: string;
	period: { start: string; end: string };
	account_totals: {
		impressions: number;
		clicks: number;
		ctr: number;
		cost_usd: number;
		conversions: number;
		conversion_rate: number;
	};
	campaigns: GoogleAdsMetricCampaign[];
	ad_groups: GoogleAdsMetricAdGroup[];
	geo: GoogleAdsMetricGeo[];
	conversion_actions: GoogleAdsMetricConversionAction[];
	metrics: CanonicalMetric[];
	data_quality: MetricQuality;
	error?: string;
	quality_note?: string;
}

export function buildCampaignsQuery({ startDate, endDate, level }: {
	startDate: string;
	endDate: string;
	level: "campaign" | "ad_group";
}): string {
	const entity = level === "campaign" ? "campaign" : "ad_group";
	// segments.date returns one row per entity per day; rows are aggregated
	// client-side by id so multi-day windows produce one record per entity.
	const identity = level === "campaign"
		? "campaign.id, campaign.name, campaign.status"
		: "ad_group.id, ad_group.name, ad_group.status, campaign.id, campaign.name";
	return [
		`SELECT ${identity},`,
		"metrics.impressions, metrics.clicks,",
		"metrics.cost_micros, metrics.conversions, metrics.conversions_value",
		`FROM ${entity}`,
		`WHERE ${entity}.status != 'REMOVED'`,
		`AND segments.date BETWEEN '${startDate}' AND '${endDate}'`,
	].join(" ");
}

export function buildGeoQuery({ startDate, endDate }: {
	startDate: string;
	endDate: string;
}): string {
	return [
		"SELECT segments.geo_target_country,",
		"metrics.impressions, metrics.clicks,",
		"metrics.cost_micros, metrics.conversions",
		"FROM geographic_view",
		`WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
		"AND geographic_view.location_type = 'LOCATION_OF_PRESENCE'",
	].join(" ");
}

export function buildConversionActionQuery({ startDate, endDate }: {
	startDate: string;
	endDate: string;
}): string {
	return [
		"SELECT segments.conversion_action,",
		"metrics.conversions, metrics.conversions_value",
		"FROM customer",
		`WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`,
	].join(" ");
}

class GoogleAdsRequestError extends Error {
	readonly status: number;
	constructor(message: string, status: number) {
		super(message);
		this.status = status;
	}
}

async function runGaql(
	accessToken: string,
	developerToken: string | undefined,
	customerId: string,
	query: string,
): Promise<{ results?: unknown[] }> {
	const headers: Record<string, string> = {
		Authorization: `Bearer ${accessToken}`,
		"content-type": "application/json",
	};
	// Legacy token, if still configured, is sent but ignored by the API
	// servers since the 2026-09-09 sunset. Never required.
	if (developerToken) {
		headers["developer-token"] = developerToken;
	}
	const response = await fetch(
		`https://googleads.googleapis.com/${API_VERSION}/customers/${customerId}/googleAds:search`,
		{
			method: "POST",
			headers,
			body: JSON.stringify({ query }),
		},
	);
	const payload = await response.json() as {
		results?: unknown[];
		error?: { message?: string };
	};
	if (!response.ok) {
		throw new GoogleAdsRequestError(
			payload.error?.message ?? `Google Ads request failed (${response.status})`,
			response.status,
		);
	}
	return { results: payload.results ?? [] };
}

interface CampaignRow {
	campaign?: { id?: string; name?: string; status?: string };
	adGroup?: { id?: string; name?: string; status?: string };
	metrics?: {
		impressions?: string;
		clicks?: string;
		costMicros?: string;
		conversions?: string;
		conversionsValue?: string;
	};
}

interface GeoRow {
	segments?: { geoTargetCountry?: string };
	metrics?: {
		impressions?: string;
		clicks?: string;
		costMicros?: string;
		conversions?: string;
	};
}

interface ConversionActionRow {
	segments?: { conversionAction?: string };
	metrics?: { conversions?: string; conversionsValue?: string };
}

function round2(value: number): number {
	return Math.round(value * 100) / 100;
}

function round4(value: number): number {
	return Math.round(value * 10000) / 10000;
}

function computeRates(impressions: number, clicks: number, conversions: number): {
	ctr: number;
	conversion_rate: number;
} {
	return {
		ctr: impressions > 0 ? round4((clicks / impressions) * 100) : 0,
		conversion_rate: clicks > 0 ? round4((conversions / clicks) * 100) : 0,
	};
}

function aggregateEntityRows(
	rows: CampaignRow[],
	level: "campaign" | "ad_group",
): GoogleAdsMetricCampaign[] | GoogleAdsMetricAdGroup[] {
	const byId = new Map<string, {
		id: string;
		name: string;
		status: string;
		impressions: number;
		clicks: number;
		costMicros: number;
		conversions: number;
		conversionsValue: number;
		campaignId: string;
		campaignName: string;
	}>();
	for (const row of rows) {
		const entity = level === "campaign" ? row.campaign : row.adGroup;
		const id = entity?.id ?? "";
		if (!id) continue;
		const existing = byId.get(id);
		const impressions = Number(row.metrics?.impressions ?? 0);
		const clicks = Number(row.metrics?.clicks ?? 0);
		const costMicros = Number(row.metrics?.costMicros ?? 0);
		const conversions = Number(row.metrics?.conversions ?? 0);
		const conversionsValue = Number(row.metrics?.conversionsValue ?? 0);
		if (existing) {
			existing.impressions += impressions;
			existing.clicks += clicks;
			existing.costMicros += costMicros;
			existing.conversions += conversions;
			existing.conversionsValue += conversionsValue;
		} else {
			byId.set(id, {
				id,
				name: entity?.name ?? "",
				status: entity?.status ?? "UNKNOWN",
				impressions,
				clicks,
				costMicros,
				conversions,
				conversionsValue,
				campaignId: row.campaign?.id ?? "",
				campaignName: row.campaign?.name ?? "",
			});
		}
	}
	return [...byId.values()].map((entry) => {
		const rates = computeRates(entry.impressions, entry.clicks, entry.conversions);
		const base: GoogleAdsMetricCampaign = {
			id: entry.id,
			name: entry.name,
			status: entry.status,
			impressions: entry.impressions,
			clicks: entry.clicks,
			ctr: rates.ctr,
			cost_usd: round2(entry.costMicros / 1_000_000),
			conversions: entry.conversions,
			conversions_value: round2(entry.conversionsValue),
			conversion_rate: rates.conversion_rate,
		};
		return level === "campaign"
			? base
			: { ...base, campaign_id: entry.campaignId, campaign_name: entry.campaignName };
	});
}

function aggregateGeoRows(rows: GeoRow[]): GoogleAdsMetricGeo[] {
	const byCountry = new Map<string, {
		impressions: number;
		clicks: number;
		costMicros: number;
		conversions: number;
	}>();
	for (const row of rows) {
		const country = row.segments?.geoTargetCountry ?? "";
		if (!country) continue;
		const existing = byCountry.get(country);
		const impressions = Number(row.metrics?.impressions ?? 0);
		const clicks = Number(row.metrics?.clicks ?? 0);
		const costMicros = Number(row.metrics?.costMicros ?? 0);
		const conversions = Number(row.metrics?.conversions ?? 0);
		if (existing) {
			existing.impressions += impressions;
			existing.clicks += clicks;
			existing.costMicros += costMicros;
			existing.conversions += conversions;
		} else {
			byCountry.set(country, { impressions, clicks, costMicros, conversions });
		}
	}
	return [...byCountry.entries()].map(([country, totals]) => ({
		country,
		impressions: totals.impressions,
		clicks: totals.clicks,
		cost_usd: round2(totals.costMicros / 1_000_000),
		conversions: totals.conversions,
	}));
}

function aggregateConversionActionRows(rows: ConversionActionRow[]): GoogleAdsMetricConversionAction[] {
	const byAction = new Map<string, { conversions: number; conversionsValue: number }>();
	for (const row of rows) {
		const action = row.segments?.conversionAction ?? "";
		if (!action) continue;
		const existing = byAction.get(action);
		const conversions = Number(row.metrics?.conversions ?? 0);
		const conversionsValue = Number(row.metrics?.conversionsValue ?? 0);
		if (existing) {
			existing.conversions += conversions;
			existing.conversionsValue += conversionsValue;
		} else {
			byAction.set(action, { conversions, conversionsValue });
		}
	}
	return [...byAction.entries()].map(([conversion_action, totals]) => ({
		conversion_action,
		action_id: conversion_action.split("/").pop() ?? "",
		conversions: totals.conversions,
		conversions_value: round2(totals.conversionsValue),
	}));
}

function emptyMetricsResult(
	customerId: string,
	startDate: string,
	endDate: string,
	data_quality: MetricQuality,
	quality_note?: string,
	error?: string,
): GoogleAdsMetricsResult {
	return {
		ok: false,
		customer_id: customerId,
		period: { start: startDate, end: endDate },
		account_totals: {
			impressions: 0,
			clicks: 0,
			ctr: 0,
			cost_usd: 0,
			conversions: 0,
			conversion_rate: 0,
		},
		campaigns: [],
		ad_groups: [],
		geo: [],
		conversion_actions: [],
		metrics: [],
		data_quality,
		...(quality_note ? { quality_note } : {}),
		...(error ? { error } : {}),
	};
}

function buildCanonicalMetrics(
	customerId: string,
	startDate: string,
	endDate: string,
	fetchedAt: string,
	dataQuality: MetricQuality,
	qualityNote: string | undefined,
	totals: GoogleAdsMetricsResult["account_totals"],
	campaigns: GoogleAdsMetricCampaign[],
	geo: GoogleAdsMetricGeo[],
): CanonicalMetric[] {
	const metric = (
		metric_name: string,
		value: number,
		unit: CanonicalMetric["unit"],
		scope?: string,
		geography?: string,
	): CanonicalMetric => ({
		metric_name,
		source: "google_ads",
		source_account: customerId,
		value,
		unit,
		...(scope ? { scope } : {}),
		...(geography ? { geography } : {}),
		period_start: startDate,
		period_end: endDate,
		fetched_at: fetchedAt,
		data_quality: dataQuality,
		...(qualityNote ? { quality_note: qualityNote } : {}),
	});
	const metrics: CanonicalMetric[] = [
		metric("ads.impressions", totals.impressions, "count", "account"),
		metric("ads.clicks", totals.clicks, "count", "account"),
		metric("ads.ctr", totals.ctr, "percent", "account"),
		metric("ads.cost_usd", totals.cost_usd, "usd", "account"),
		metric("ads.conversions", totals.conversions, "count", "account"),
		metric("ads.conversion_rate", totals.conversion_rate, "percent", "account"),
	];
	for (const campaign of campaigns) {
		const scope = `campaign:${campaign.id}`;
		metrics.push(
			metric("ads.impressions", campaign.impressions, "count", scope),
			metric("ads.clicks", campaign.clicks, "count", scope),
			metric("ads.cost_usd", campaign.cost_usd, "usd", scope),
			metric("ads.conversions", campaign.conversions, "count", scope),
		);
	}
	for (const row of geo) {
		metrics.push(
			metric("ads.impressions", row.impressions, "count", "account", row.country),
			metric("ads.clicks", row.clicks, "count", "account", row.country),
			metric("ads.cost_usd", row.cost_usd, "usd", "account", row.country),
		);
	}
	return metrics;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export async function getGoogleAdsMetrics(
	env: GoogleAdsEnv,
	{ customerId = GOOGLE_ADS_LIVE_CUSTOMER_ID, startDate, endDate }: {
		customerId?: string;
		startDate: string;
		endDate: string;
	},
): Promise<GoogleAdsMetricsResult> {
	// Post-sunset (2026-09-09) there is no developer-token gate: the API
	// determines access from the Google Cloud project owning the OAuth
	// client. Proceed directly to OAuth + GAQL.
	if (
		!DATE_PATTERN.test(startDate) ||
		!DATE_PATTERN.test(endDate) ||
		startDate > endDate
	) {
		return emptyMetricsResult(
			customerId,
			startDate,
			endDate,
			"SOURCE_API_ERROR",
			`Invalid date range: expected YYYY-MM-DD with start <= end, got '${startDate}' to '${endDate}'.`,
		);
	}
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		return emptyMetricsResult(
			customerId,
			startDate,
			endDate,
			"OWNER_ACTION_REQUIRED",
			`Google Ads OAuth not connected: ${missing.join(", ")} missing.`,
		);
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
			return emptyMetricsResult(
				customerId,
				startDate,
				endDate,
				"OWNER_ACTION_REQUIRED",
				"Google Ads OAuth not connected: no credential stored yet. Complete the owner OAuth flow first.",
			);
		}
		const refreshToken = await decryptRefreshToken(
			credential.encrypted_refresh_token,
			credential.iv,
			env.GOOGLE_ADS_TOKEN_KEY!,
		);
		const accessToken = await refreshAccessToken(refreshToken, env);
		const developerToken = env.GOOGLE_ADS_DEVELOPER_TOKEN;

		// Primary query: campaigns drive the account totals. Secondary queries
		// (ad groups, geo, conversion actions) fail independently: a broken
		// one marks the result LIVE_PARTIAL instead of failing the whole read.
		const primary = await runGaql(
			accessToken,
			developerToken,
			customerId,
			buildCampaignsQuery({ startDate, endDate, level: "campaign" }),
		);
		const partialNotes: string[] = [];
		const secondary = await Promise.allSettled([
			runGaql(accessToken, developerToken, customerId, buildCampaignsQuery({ startDate, endDate, level: "ad_group" })),
			runGaql(accessToken, developerToken, customerId, buildGeoQuery({ startDate, endDate })),
			runGaql(accessToken, developerToken, customerId, buildConversionActionQuery({ startDate, endDate })),
		]);
		const [adGroupsSettled, geoSettled, conversionActionsSettled] = secondary;
		if (adGroupsSettled.status === "rejected") {
			partialNotes.push(`ad_group breakdown unavailable: ${adGroupsSettled.reason instanceof Error ? adGroupsSettled.reason.message : String(adGroupsSettled.reason)}`);
		}
		if (geoSettled.status === "rejected") {
			partialNotes.push(`geographic breakdown unavailable: ${geoSettled.reason instanceof Error ? geoSettled.reason.message : String(geoSettled.reason)}`);
		}
		if (conversionActionsSettled.status === "rejected") {
			partialNotes.push(`conversion-action breakdown unavailable: ${conversionActionsSettled.reason instanceof Error ? conversionActionsSettled.reason.message : String(conversionActionsSettled.reason)}`);
		}

		const campaigns = aggregateEntityRows(
			(primary.results ?? []) as CampaignRow[],
			"campaign",
		) as GoogleAdsMetricCampaign[];
		const ad_groups = (adGroupsSettled.status === "fulfilled"
			? aggregateEntityRows((adGroupsSettled.value.results ?? []) as CampaignRow[], "ad_group")
			: []) as GoogleAdsMetricAdGroup[];
		const geo = geoSettled.status === "fulfilled"
			? aggregateGeoRows((geoSettled.value.results ?? []) as GeoRow[])
			: [];
		const conversion_actions = conversionActionsSettled.status === "fulfilled"
			? aggregateConversionActionRows((conversionActionsSettled.value.results ?? []) as ConversionActionRow[])
			: [];

		const totals = campaigns.reduce(
			(sum, campaign) => ({
				impressions: sum.impressions + campaign.impressions,
				clicks: sum.clicks + campaign.clicks,
				cost_usd: round2(sum.cost_usd + campaign.cost_usd),
				conversions: sum.conversions + campaign.conversions,
			}),
			{ impressions: 0, clicks: 0, cost_usd: 0, conversions: 0 },
		);
		const rates = computeRates(totals.impressions, totals.clicks, totals.conversions);
		const account_totals = {
			impressions: totals.impressions,
			clicks: totals.clicks,
			ctr: rates.ctr,
			cost_usd: totals.cost_usd,
			conversions: totals.conversions,
			conversion_rate: rates.conversion_rate,
		};
		const fetchedAt = new Date().toISOString();
		const dataQuality: MetricQuality =
			partialNotes.length > 0 ? "LIVE_PARTIAL" : "LIVE_VERIFIED";
		const qualityNote = partialNotes.length > 0
			? `Partial read: ${partialNotes.join("; ")}`
			: undefined;
		const metrics = buildCanonicalMetrics(
			customerId,
			startDate,
			endDate,
			fetchedAt,
			dataQuality,
			qualityNote,
			account_totals,
			campaigns,
			geo,
		);
		return {
			ok: true,
			customer_id: customerId,
			period: { start: startDate, end: endDate },
			account_totals,
			campaigns,
			ad_groups,
			geo,
			conversion_actions,
			metrics,
			data_quality: dataQuality,
			...(qualityNote ? { quality_note: qualityNote } : {}),
		};
	} catch (error) {
		const isAuthFailure = error instanceof GoogleAdsRequestError &&
			(error.status === 401 || error.status === 403);
		return emptyMetricsResult(
			customerId,
			startDate,
			endDate,
			isAuthFailure ? "SOURCE_AUTH_ERROR" : "SOURCE_API_ERROR",
			undefined,
			error instanceof Error ? error.message : "Google Ads metrics read failed",
		);
	}
}

// ---------------------------------------------------------------------------
// TEMPORARY diagnostic (post developer-token sunset verification).
// Tests a real production Google Ads API read using only the existing OAuth
// credentials, WITHOUT any developer-token header. Read-only: one
// listAccessibleCustomers call + one GAQL search, no mutations, no D1
// writes. To be removed after the access-level verification completes.
// ---------------------------------------------------------------------------

export interface GoogleAdsNoTokenTestResult {
	// Google Cloud project number owning the OAuth client (numeric prefix of
	// the client id; the project slug is not derivable from the client id).
	cloud_project_number: string | null;
	oauth_configured: boolean;
	missing_oauth_config: string[];
	oauth_refresh_ok: boolean;
	oauth_refresh_error: string | null;
	developer_token_header_sent: false;
	list_accessible_customers: { ok: boolean; resource_names?: string[]; error?: string };
	gaql_search: { ok: boolean; row_count?: number; error?: string };
	aug26_sep28_totals: {
		ok: boolean;
		impressions?: number;
		clicks?: number;
		cost_usd?: number;
		conversions?: number;
		data_quality?: string;
		error?: string;
	} | null;
}

export async function testGoogleAdsNoTokenAccess(
	env: GoogleAdsEnv,
): Promise<GoogleAdsNoTokenTestResult> {
	const clientId = env.GOOGLE_ADS_CLIENT_ID ?? "";
	const projectNumber = /^(\d+)-/.exec(clientId)?.[1] ?? null;
	const missing = missingConfiguration(env);
	const result: GoogleAdsNoTokenTestResult = {
		cloud_project_number: projectNumber,
		oauth_configured: missing.length === 0,
		missing_oauth_config: missing,
		oauth_refresh_ok: false,
		oauth_refresh_error: null,
		developer_token_header_sent: false,
		list_accessible_customers: { ok: false },
		gaql_search: { ok: false },
		aug26_sep28_totals: null,
	};
	if (missing.length > 0) return result;
	let accessToken: string;
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
			result.oauth_refresh_error = "No stored OAuth credential for GOOGLE_ADS yet.";
			return result;
		}
		const refreshToken = await decryptRefreshToken(
			credential.encrypted_refresh_token,
			credential.iv,
			env.GOOGLE_ADS_TOKEN_KEY!,
		);
		accessToken = await refreshAccessToken(refreshToken, env);
		result.oauth_refresh_ok = true;
	} catch (error) {
		result.oauth_refresh_error = error instanceof Error ? error.message : "OAuth refresh failed";
		return result;
	}
	// 1) listAccessibleCustomers — no developer-token header.
	try {
		const response = await fetch(
			`https://googleads.googleapis.com/${API_VERSION}/customers:listAccessibleCustomers`,
			{ headers: { Authorization: `Bearer ${accessToken}` } },
		);
		const payload = await response.json() as {
			resourceNames?: string[];
			error?: { code?: number; message?: string; status?: string };
		};
		if (!response.ok) {
			result.list_accessible_customers = {
				ok: false,
				error: `HTTP ${response.status} ${payload.error?.status ?? ""}: ${payload.error?.message ?? "request failed"}`.trim(),
			};
		} else {
			result.list_accessible_customers = { ok: true, resource_names: payload.resourceNames ?? [] };
		}
	} catch (error) {
		result.list_accessible_customers = {
			ok: false,
			error: error instanceof Error ? error.message : "listAccessibleCustomers failed",
		};
	}
	// 2) One GAQL search on the live customer — no developer-token header.
	try {
		const gaql = await runGaql(
			accessToken,
			undefined,
			GOOGLE_ADS_LIVE_CUSTOMER_ID,
			"SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions " +
			`FROM campaign WHERE segments.date BETWEEN '2026-08-26' AND '2026-09-28' LIMIT 5`,
		);
		result.gaql_search = { ok: true, row_count: gaql.results?.length ?? 0 };
	} catch (error) {
		result.gaql_search = {
			ok: false,
			error: error instanceof Error ? error.message : "GAQL search failed",
		};
	}
	// 3) Full Aug 26 - Sep 28 production read via the canonical metrics path
	// (same code the OC endpoint uses), no developer token.
	try {
		const metrics = await getGoogleAdsMetrics(env, {
			startDate: "2026-08-26",
			endDate: "2026-09-28",
		});
		result.aug26_sep28_totals = metrics.ok
			? {
				ok: true,
				impressions: metrics.account_totals.impressions,
				clicks: metrics.account_totals.clicks,
				cost_usd: metrics.account_totals.cost_usd,
				conversions: metrics.account_totals.conversions,
				data_quality: metrics.data_quality,
			}
			: {
				ok: false,
				data_quality: metrics.data_quality,
				error: metrics.error ?? metrics.quality_note ?? "metrics read failed",
			};
	} catch (error) {
		result.aug26_sep28_totals = {
			ok: false,
			error: error instanceof Error ? error.message : "metrics read failed",
		};
	}
	return result;
}
