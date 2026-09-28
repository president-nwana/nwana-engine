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

// ---------------------------------------------------------------------------
// Parameterized GA4 reports (read-only).
//
// Extends the module with a generic runReport wrapper plus a canonical
// audience report used by the Operating Center and sponsor-safe exports.
// Auth plumbing above is unchanged: every report reuses the stored
// OAuth refresh token via refreshAccessToken().
//
// Operating cost: VERIFIED $0 — on-demand reads only, no cron, no D1 writes.
// ---------------------------------------------------------------------------

import type { CanonicalMetric, MetricQuality } from "./canonical-metrics";

export interface Ga4ReportRow {
	dimensions: string[];
	metrics: string[];
}

export interface Ga4ReportOptions {
	metrics: string[];
	dimensions?: string[];
	startDate: string;
	endDate: string;
	limit?: number;
	dimensionFilter?: Record<string, unknown>;
	orderBys?: Array<Record<string, unknown>>;
}

export interface Ga4ReportResult {
	ok: boolean;
	error?: string;
	error_kind?: "config" | "auth" | "api";
	rows?: Ga4ReportRow[];
	row_count?: number;
}

// Generic parameterized runReport. Never throws for API errors: the Data
// API's own error message is returned instead.
export async function runGa4Report(
	env: GoogleAnalyticsEnv,
	options: Ga4ReportOptions,
): Promise<Ga4ReportResult> {
	const missing = missingConfiguration(env);
	if (missing.length > 0) {
		return {
			ok: false,
			error_kind: "config",
			error: `Not connected: ${missing.join(", ")} missing.`,
		};
	}
	let refreshToken: string | null;
	try {
		refreshToken = await getStoredRefreshToken(env);
	} catch (error) {
		return {
			ok: false,
			error_kind: "auth",
			error: error instanceof Error ? error.message : "Could not read the stored GA4 credential",
		};
	}
	if (!refreshToken) {
		return {
			ok: false,
			error_kind: "auth",
			error: "Not connected: no OAuth credential stored yet. Open /integrations/google-analytics/connect as the owner to connect.",
		};
	}
	let accessToken: string;
	try {
		accessToken = await refreshAccessToken(refreshToken, env);
	} catch (error) {
		return {
			ok: false,
			error_kind: "auth",
			error: error instanceof Error ? error.message : "OAuth token refresh failed",
		};
	}
	const body: Record<string, unknown> = {
		dateRanges: [{ startDate: options.startDate, endDate: options.endDate }],
		metrics: options.metrics.map((name) => ({ name })),
	};
	if (options.dimensions && options.dimensions.length > 0) {
		body.dimensions = options.dimensions.map((name) => ({ name }));
	}
	if (options.dimensionFilter) body.dimensionFilter = options.dimensionFilter;
	if (options.limit) body.limit = options.limit;
	if (options.orderBys) body.orderBys = options.orderBys;

	let response: Response;
	try {
		response = await fetch(
			`https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"content-type": "application/json",
				},
				body: JSON.stringify(body),
			},
		);
	} catch (error) {
		return {
			ok: false,
			error_kind: "api",
			error: error instanceof Error ? error.message : "GA4 Data API request failed",
		};
	}
	let payload: {
		rows?: Array<{
			dimensionValues?: Array<{ value?: string }>;
			metricValues?: Array<{ value?: string }>;
		}>;
		rowCount?: number;
		error?: { message?: string };
	};
	try {
		payload = await response.json() as typeof payload;
	} catch {
		return {
			ok: false,
			error_kind: "api",
			error: `GA4 Data API returned an unreadable response (${response.status})`,
		};
	}
	if (!response.ok) {
		return {
			ok: false,
			error_kind: response.status === 401 || response.status === 403 ? "auth" : "api",
			error: payload.error?.message ?? `GA4 Data API request failed (${response.status})`,
		};
	}
	return {
		ok: true,
		rows: (payload.rows ?? []).map((row) => ({
			dimensions: (row.dimensionValues ?? []).map((value) => value.value ?? ""),
			metrics: (row.metricValues ?? []).map((value) => value.value ?? "0"),
		})),
		row_count: payload.rowCount ?? (payload.rows ?? []).length,
	};
}

// ---------------------------------------------------------------------------
// Date presets. All dates are full calendar days in YYYY-MM-DD. "last7" is
// the 7 most recent complete days (today is excluded — it is incomplete).
// ---------------------------------------------------------------------------

export type Ga4DatePreset = "last7" | "prior7" | "last30" | "prior30" | "mtd";

export const GA4_DATE_PRESETS: Ga4DatePreset[] = ["last7", "prior7", "last30", "prior30", "mtd"];

const DAY_MS = 86_400_000;

function formatYmd(date: Date): string {
	return date.toISOString().slice(0, 10);
}

function parseYmd(today: string): Date {
	const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(today);
	if (!match) throw new Error(`Invalid date: ${today}`);
	return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

function addDays(date: Date, days: number): Date {
	return new Date(date.getTime() + days * DAY_MS);
}

export function resolveDatePreset(
	preset: Ga4DatePreset,
	today: string,
): { startDate: string; endDate: string } {
	const anchor = parseYmd(today);
	const monthStart = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
	switch (preset) {
		case "last7":
			return { startDate: formatYmd(addDays(anchor, -7)), endDate: formatYmd(addDays(anchor, -1)) };
		case "prior7":
			return { startDate: formatYmd(addDays(anchor, -14)), endDate: formatYmd(addDays(anchor, -8)) };
		case "last30":
			return { startDate: formatYmd(addDays(anchor, -30)), endDate: formatYmd(addDays(anchor, -1)) };
		case "prior30":
			return { startDate: formatYmd(addDays(anchor, -60)), endDate: formatYmd(addDays(anchor, -31)) };
		case "mtd":
			return { startDate: formatYmd(monthStart), endDate: formatYmd(addDays(anchor, -1)) };
	}
}

// Prior comparable period for a range: same length, immediately before
// the current start.
export function priorComparablePeriod(
	startDate: string,
	endDate: string,
): { startDate: string; endDate: string } {
	const start = parseYmd(startDate);
	const end = parseYmd(endDate);
	const lengthDays = Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1;
	return {
		startDate: formatYmd(addDays(start, -lengthDays)),
		endDate: formatYmd(addDays(start, -1)),
	};
}

// ---------------------------------------------------------------------------
// Canonical audience report.
// ---------------------------------------------------------------------------

export interface Ga4MetricTotal {
	current: CanonicalMetric;
	prior: CanonicalMetric | null;
	percent_change: number | null;
	percent_change_metric: CanonicalMetric | null;
}

export interface Ga4BreakdownRow {
	dimension: string;
	dimension_value: string;
	metrics: Record<string, CanonicalMetric>;
}

export interface Ga4AudienceReport {
	ok: boolean;
	source: "ga4";
	source_account: string;
	preset: string | null;
	period_start: string;
	period_end: string;
	compare: boolean;
	compare_period_start: string | null;
	compare_period_end: string | null;
	fetched_at: string;
	data_quality: MetricQuality;
	quality_note?: string;
	totals: Record<string, Ga4MetricTotal>;
	breakdowns: {
		session_source_medium: Ga4BreakdownRow[];
		landing_page: Ga4BreakdownRow[];
		country: Ga4BreakdownRow[];
		us_region: Ga4BreakdownRow[];
	};
	error?: string;
}

export interface Ga4AudienceReportOptions {
	preset?: Ga4DatePreset;
	startDate?: string;
	endDate?: string;
	comparePrior?: boolean;
}

// Canonical audience metric definitions: [GA4 API metric, unit].
const AUDIENCE_METRICS: Array<[string, CanonicalMetric["unit"]]> = [
	["activeUsers", "count"],
	["totalUsers", "count"],
	["newUsers", "count"],
	["sessions", "count"],
	["engagedSessions", "count"],
	["screenPageViews", "count"],
	["engagementRate", "percent"],
	["averageSessionDuration", "seconds"],
	["conversions", "count"],
];

function makeCanonicalMetric(
	name: string,
	rawValue: string,
	unit: CanonicalMetric["unit"],
	periodStart: string,
	periodEnd: string,
	fetchedAt: string,
	quality: MetricQuality,
	overrides: Partial<CanonicalMetric> = {},
): CanonicalMetric {
	let value = Number(rawValue ?? "0");
	if (!Number.isFinite(value)) value = 0;
	// engagementRate arrives as a 0–1 fraction; report it as percent.
	if (unit === "percent") value = value * 100;
	return {
		metric_name: `ga4.${name}`,
		source: "ga4",
		source_account: GA4_PROPERTY_ID,
		value,
		unit,
		period_start: periodStart,
		period_end: periodEnd,
		fetched_at: fetchedAt,
		data_quality: quality,
		...overrides,
	};
}

function percentChange(current: number, prior: number): number | null {
	if (prior === 0) return current === 0 ? 0 : null;
	return ((current - prior) / prior) * 100;
}

// Runs the totals query with `conversions`; if the API rejects that metric
// name, retries with `keyEvents`. Returns the working metric name.
async function runTotalsWithConversionFallback(
	env: GoogleAnalyticsEnv,
	startDate: string,
	endDate: string,
): Promise<{ result: Ga4ReportResult; conversionMetric: string; qualityNote?: string }> {
	const metricNames = AUDIENCE_METRICS.map(([name]) => name);
	const first = await runGa4Report(env, {
		metrics: metricNames,
		startDate,
		endDate,
	});
	if (first.ok || !/conversion/i.test(first.error ?? "")) {
		return { result: first, conversionMetric: "conversions" };
	}
	const fallback = await runGa4Report(env, {
		metrics: metricNames.map((name) => (name === "conversions" ? "keyEvents" : name)),
		startDate,
		endDate,
	});
	return {
		result: fallback,
		conversionMetric: "keyEvents",
		qualityNote: "GA4 Data API rejected the `conversions` metric for this property; used `keyEvents` instead.",
	};
}

function metricUnitsByName(
	conversionMetric: string,
): Map<string, CanonicalMetric["unit"]> {
	const units = new Map<string, CanonicalMetric["unit"]>();
	for (const [name, unit] of AUDIENCE_METRICS) {
		units.set(name === "conversions" ? conversionMetric : name, unit);
	}
	return units;
}

function buildTotals(
	names: string[],
	units: Map<string, CanonicalMetric["unit"]>,
	current: Ga4ReportRow | undefined,
	prior: Ga4ReportRow | undefined,
	periodStart: string,
	periodEnd: string,
	compareStart: string | null,
	compareEnd: string | null,
	fetchedAt: string,
	compare: boolean,
): Record<string, Ga4MetricTotal> {
	const totals: Record<string, Ga4MetricTotal> = {};
	names.forEach((name, index) => {
		const unit = units.get(name) ?? "count";
		const currentMetric = makeCanonicalMetric(
			name,
			current?.metrics[index] ?? "0",
			unit,
			periodStart,
			periodEnd,
			fetchedAt,
			"LIVE_VERIFIED",
			{ geography: "global" },
		);
		let priorMetric: CanonicalMetric | null = null;
		let change: number | null = null;
		let changeMetric: CanonicalMetric | null = null;
		if (compare && compareStart && compareEnd) {
			priorMetric = makeCanonicalMetric(
				name,
				prior?.metrics[index] ?? "0",
				unit,
				compareStart,
				compareEnd,
				fetchedAt,
				"LIVE_VERIFIED",
				{ geography: "global" },
			);
			change = percentChange(currentMetric.value, priorMetric.value);
			changeMetric = {
				metric_name: `ga4.${name}.delta_percent`,
				source: "ga4",
				source_account: GA4_PROPERTY_ID,
				value: change ?? 0,
				unit: "percent",
				scope: change === null ? "prior value is zero — change not computable" : undefined,
				geography: "global",
				period_start: periodStart,
				period_end: periodEnd,
				fetched_at: fetchedAt,
				data_quality: "LIVE_VERIFIED",
			};
		}
		totals[name] = {
			current: currentMetric,
			prior: priorMetric,
			percent_change: change,
			percent_change_metric: changeMetric,
		};
	});
	return totals;
}

async function runBreakdown(
	env: GoogleAnalyticsEnv,
	metricNames: string[],
	units: Map<string, CanonicalMetric["unit"]>,
	dimension: string,
	periodStart: string,
	periodEnd: string,
	fetchedAt: string,
	geographyOf: (dimensionValue: string) => string | undefined,
	dimensionFilter?: Record<string, unknown>,
): Promise<Ga4BreakdownRow[]> {
	const result = await runGa4Report(env, {
		metrics: metricNames,
		dimensions: [dimension],
		startDate: periodStart,
		endDate: periodEnd,
		limit: 25,
		orderBys: [{ metric: { metricName: metricNames[0] }, desc: true }],
		dimensionFilter,
	});
	if (!result.ok || !result.rows) return [];
	return result.rows.map((row) => {
		const dimensionValue = row.dimensions[0] ?? "";
		const metrics: Record<string, CanonicalMetric> = {};
		metricNames.forEach((name, index) => {
			metrics[name] = makeCanonicalMetric(
				name,
				row.metrics[index] ?? "0",
				units.get(name) ?? "count",
				periodStart,
				periodEnd,
				fetchedAt,
				"LIVE_VERIFIED",
				{
					scope: `${dimension}=${dimensionValue}`,
					geography: geographyOf(dimensionValue),
				},
			);
		});
		return { dimension, dimension_value: dimensionValue, metrics };
	});
}

export async function getGa4AudienceReport(
	env: GoogleAnalyticsEnv,
	options: Ga4AudienceReportOptions = {},
): Promise<Ga4AudienceReport> {
	const fetchedAt = new Date().toISOString();
	const preset = options.preset ?? (options.startDate && options.endDate ? null : "last7");
	let period: { startDate: string; endDate: string };
	if (options.startDate && options.endDate) {
		period = { startDate: options.startDate, endDate: options.endDate };
	} else {
		period = resolveDatePreset(preset ?? "last7", fetchedAt.slice(0, 10));
	}
	const compare = options.comparePrior === true;
	const comparePeriod = compare
		? priorComparablePeriod(period.startDate, period.endDate)
		: null;

	const current = await runTotalsWithConversionFallback(env, period.startDate, period.endDate);
	if (!current.result.ok) {
		const quality: MetricQuality =
			current.result.error_kind === "auth" ? "SOURCE_AUTH_ERROR" : "SOURCE_API_ERROR";
		return {
			ok: false,
			source: "ga4",
			source_account: GA4_PROPERTY_ID,
			preset,
			period_start: period.startDate,
			period_end: period.endDate,
			compare,
			compare_period_start: comparePeriod?.startDate ?? null,
			compare_period_end: comparePeriod?.endDate ?? null,
			fetched_at: fetchedAt,
			data_quality: quality,
			quality_note: current.result.error,
			totals: {},
			breakdowns: {
				session_source_medium: [],
				landing_page: [],
				country: [],
				us_region: [],
			},
			error: current.result.error,
		};
	}

	let priorRow: Ga4ReportRow | undefined;
	const qualityNotes: string[] = [];
	if (current.qualityNote) qualityNotes.push(current.qualityNote);
	if (compare && comparePeriod) {
		const prior = await runTotalsWithConversionFallback(env, comparePeriod.startDate, comparePeriod.endDate);
		if (!prior.result.ok) {
			return {
				ok: false,
				source: "ga4",
				source_account: GA4_PROPERTY_ID,
				preset,
				period_start: period.startDate,
				period_end: period.endDate,
				compare,
				compare_period_start: comparePeriod.startDate,
				compare_period_end: comparePeriod.endDate,
				fetched_at: fetchedAt,
				data_quality: prior.result.error_kind === "auth" ? "SOURCE_AUTH_ERROR" : "SOURCE_API_ERROR",
				quality_note: `Prior period failed: ${prior.result.error}`,
				totals: {},
				breakdowns: {
					session_source_medium: [],
					landing_page: [],
					country: [],
					us_region: [],
				},
				error: `Prior period failed: ${prior.result.error}`,
			};
		}
		priorRow = prior.result.rows?.[0];
		if (prior.qualityNote && !qualityNotes.includes(prior.qualityNote)) qualityNotes.push(prior.qualityNote);
	}

	const names = AUDIENCE_METRICS.map(([name]) =>
		name === "conversions" ? current.conversionMetric : name,
	);
	const units = metricUnitsByName(current.conversionMetric);
	const totals = buildTotals(
		names,
		units,
		current.result.rows?.[0],
		priorRow,
		period.startDate,
		period.endDate,
		comparePeriod?.startDate ?? null,
		comparePeriod?.endDate ?? null,
		fetchedAt,
		compare,
	);

	// Breakdowns run against the current period only. Each fails
	// independently; a failed breakdown leaves an empty row list.
	const sourceMediumMetrics = ["sessions", current.conversionMetric];
	const [sessionSourceMedium, landingPage, country, usRegion] = await Promise.all([
		runBreakdown(env, sourceMediumMetrics, units, "sessionSourceMedium",
			period.startDate, period.endDate, fetchedAt, () => "global"),
		runBreakdown(env, ["sessions"], units, "landingPage",
			period.startDate, period.endDate, fetchedAt, () => "global"),
		runBreakdown(env, ["activeUsers"], units, "country",
			period.startDate, period.endDate, fetchedAt, (value) =>
				value === "United States" ? "US" : "global"),
		runBreakdown(env, ["activeUsers"], units, "region",
			period.startDate, period.endDate, fetchedAt, () => "US",
			{ filter: { fieldName: "country", stringFilter: { value: "United States" } } }),
	]);

	return {
		ok: true,
		source: "ga4",
		source_account: GA4_PROPERTY_ID,
		preset,
		period_start: period.startDate,
		period_end: period.endDate,
		compare,
		compare_period_start: comparePeriod?.startDate ?? null,
		compare_period_end: comparePeriod?.endDate ?? null,
		fetched_at: fetchedAt,
		data_quality: "LIVE_VERIFIED",
		quality_note: qualityNotes.length > 0 ? qualityNotes.join(" ") : undefined,
		totals,
		breakdowns: {
			session_source_medium: sessionSourceMedium,
			landing_page: landingPage,
			country,
			us_region: usRegion,
		},
	};
}
