// Sponsor-safe audience export.
//
// Builds GET /api/operating-center/export/audience from the same canonical
// metrics layer (src/canonical-metrics.ts) and live adapters the Operating
// Center uses — one normalized data layer, no second dashboard truth.
//
// Properties:
// - Owner-key gated by the caller (the route in src/index.ts).
// - Read-only apart from audience_metrics cache writes (recordMetrics) and
//   metric_sync_state updates. Never calls the RunSignup API: participation
//   counts come from the D1 canonical snapshots (race_event_results,
//   series_registrations).
// - Failure isolation: each source is fetched independently; one source
//   failing marks only its own section (STALE with last known good values,
//   or the adapter's failure quality when no cache exists).
// - Sponsor-safe: every string in the final output is scrubbed of credential
//   references (token/secret/key/password words and known env-var names) so
//   no OAuth secret, owner key, or internal auth detail can leak. Internal
//   errors surface as a human-readable quality_note, never raw payloads.
// - Geography is never mixed unlabeled: every metric entry carries an
//   explicit geography label ("US", "CA", "MX", or "global").

import {
	getGa4AudienceReport,
	type Ga4AudienceReport,
	type GoogleAnalyticsEnv,
} from "./google-analytics";
import {
	getGoogleAdsMetrics,
	type GoogleAdsEnv,
	type GoogleAdsMetricsResult,
} from "./google-ads";
import {
	getMetaSocialOverview,
	type MetaEnv,
	type MetaSocialOverview,
} from "./meta-reads";
import {
	getYouTubeChannelMetrics,
	type YouTubeChannelMetricsResult,
	type YouTubeEnv,
	type YouTubeMetric,
} from "./youtube";
import {
	getMetricsWithFreshness,
	getMetricSyncState,
	markSourceAttempt,
	recordMetrics,
	STALE_THRESHOLDS,
	type CanonicalMetric,
	type MetricQuality,
	type MetricWithFreshness,
} from "./canonical-metrics";

export interface AudienceExportEnv
	extends GoogleAnalyticsEnv,
		GoogleAdsEnv,
		MetaEnv,
		YouTubeEnv {
	nwana_engine_db: D1Database;
}

export type GeographyFilter = "US" | "NA" | "global";

export interface AudienceExportOptions {
	startDate: string;
	endDate: string;
	geography: GeographyFilter | null;
	source: string | null;
}

/** Injectable adapters so tests can mock per-source behavior. */
export interface AudienceAdapters {
	ga4: (
		env: AudienceExportEnv,
		opts: { startDate: string; endDate: string; comparePrior: boolean },
	) => Promise<Ga4AudienceReport>;
	googleAds: (
		env: AudienceExportEnv,
		opts: { startDate: string; endDate: string },
	) => Promise<GoogleAdsMetricsResult>;
	meta: (
		env: AudienceExportEnv,
		range: { startDate?: string; endDate?: string },
	) => Promise<MetaSocialOverview>;
	youtube: (env: AudienceExportEnv) => Promise<YouTubeChannelMetricsResult>;
}

export const liveAudienceAdapters: AudienceAdapters = {
	ga4: (env, opts) => getGa4AudienceReport(env, opts),
	googleAds: (env, opts) => getGoogleAdsMetrics(env, opts),
	meta: (env, range) => getMetaSocialOverview(env, range),
	youtube: (env) => getYouTubeChannelMetrics(env),
};

// ---------------------------------------------------------------------------
// Sponsor-safe scrubbing
// ---------------------------------------------------------------------------

const CREDENTIAL_IDENTIFIERS = [
	"NWANA_META_TOKEN",
	"OPERATING_CENTER_KEY",
	"GOOGLE_ADS_DEVELOPER_TOKEN",
	"GOOGLE_ADS_TOKEN_KEY",
	"GOOGLE_ANALYTICS_TOKEN_KEY",
	"GOOGLE_YOUTUBE_TOKEN_KEY",
	"GOOGLE_YOUTUBE_CLIENT_ID",
	"GOOGLE_YOUTUBE_CLIENT_SECRET",
	"GOOGLE_ADS_CLIENT_ID",
	"GOOGLE_ADS_CLIENT_SECRET",
	"GOOGLE_ANALYTICS_CLIENT_ID",
	"GOOGLE_ANALYTICS_CLIENT_SECRET",
];

const CREDENTIAL_WORD = /\b(tokens?|secrets?|keys?|passwords?|credentials?)\b/gi;

/**
 * Remove credential references from a string: known env-var identifiers
 * first (they embed TOKEN/KEY/SECRET without word boundaries), then generic
 * credential words. Sponsors never need to know which credential is missing;
 * the quality state + plain-language note carry the meaning.
 */
export function scrubSponsorText(value: string): string {
	// Sentinel placeholder keeps the replacement idempotent: "[credential]"
	// itself matches the credential word pattern, so protect it first.
	const PLACEHOLDER = "\u0000CRED\u0000";
	const GEO_PLACEHOLDER = "\u0000GEOKEY\u0000";
	let out = value.split("[credential]").join(PLACEHOLDER);
	// Geographic names like "Key West" are not credential references:
	// protect "Key <Capitalized>" before the generic word scrub.
	const geoKeys: string[] = [];
	out = out.replace(/\bKey [A-Z][a-z]+\b/g, (m) => {
		geoKeys.push(m);
		return `${GEO_PLACEHOLDER}${geoKeys.length - 1}\u0000`;
	});
	for (const id of CREDENTIAL_IDENTIFIERS) {
		out = out.split(id).join(PLACEHOLDER);
	}
	out = out.replace(CREDENTIAL_WORD, PLACEHOLDER);
	out = out.split(PLACEHOLDER).join("[credential]");
	geoKeys.forEach((original, i) => {
		out = out.split(`${GEO_PLACEHOLDER}${i}\u0000`).join(original);
	});
	return out;
}

/** Recursively scrub every string in an export payload. */
export function scrubSponsorValue(value: unknown): unknown {
	if (typeof value === "string") return scrubSponsorText(value);
	if (Array.isArray(value)) return value.map(scrubSponsorValue);
	if (value !== null && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = scrubSponsorValue(v);
		return out;
	}
	return value;
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface ExportMetricEntry {
	name: string;
	label: string;
	value: number;
	unit: string;
	geography: string;
	change_percent?: number | null;
	scope?: string;
	data_quality: MetricQuality;
}

export interface ExportSectionBase {
	source: string;
	period: { start: string; end: string };
	data_quality: MetricQuality;
	quality_note?: string;
	last_refresh: string | null;
}

export interface WebsiteSection extends ExportSectionBase {
	source: "ga4";
	metrics: ExportMetricEntry[];
	breakdowns: {
		by_source_medium: ExportMetricEntry[];
		by_landing_page: ExportMetricEntry[];
		by_country: ExportMetricEntry[];
		us_by_state: ExportMetricEntry[];
	};
}

export interface AdvertisingSection extends ExportSectionBase {
	source: "google_ads";
	metrics: ExportMetricEntry[];
	account: {
		impressions: number;
		clicks: number;
		ctr: number;
		cost_usd: number;
		conversions: number;
		conversion_rate: number;
	} | null;
	campaigns: Array<{
		name: string;
		status: string;
		impressions: number;
		clicks: number;
		ctr: number;
		cost_usd: number;
		conversions: number;
	}>;
	conversion_actions: Array<{
		conversion_action: string;
		action_id: string;
		conversions: number;
	}>;
	by_country: ExportMetricEntry[];
}

export interface SocialDestination {
	platform: "facebook" | "instagram" | "youtube";
	name: string;
	metrics: ExportMetricEntry[];
	data_quality: MetricQuality;
	quality_note?: string;
}

export interface SocialSection extends ExportSectionBase {
	source: "meta" | "youtube" | "meta+youtube";
	destinations: SocialDestination[];
}

export interface ParticipationSection extends ExportSectionBase {
	source: "runsignup";
	metrics: ExportMetricEntry[];
	unique_athletes: number;
	verified_finishes: number;
	registrations: number | null;
	registered_participants: number | null;
	events_with_results: number;
	finalized_events: number;
	series: string[];
}

export interface DataQualitySummary {
	LIVE_VERIFIED: number;
	LIVE_PARTIAL: number;
	STALE: number;
	UNAVAILABLE: number;
	SOURCE_AUTH_ERROR: number;
	SOURCE_API_ERROR: number;
	OWNER_ACTION_REQUIRED: Array<{ source: string; note: string }>;
	NO_SUPPORTED_ACCESS_PATH: number;
}

export interface AudienceExport {
	generated_at: string;
	reporting_period: { start: string; end: string };
	geography_filter: GeographyFilter | null;
	sections: {
		website: WebsiteSection | null;
		advertising: AdvertisingSection | null;
		social: SocialSection | null;
		participation: ParticipationSection | null;
	};
	data_quality_summary: DataQualitySummary;
}

/** Default reporting period: last 30 full days (ends yesterday; GA4/Ads lag). */
export function defaultExportPeriod(nowMs: number = Date.now()): {
	startDate: string;
	endDate: string;
} {
	const dayMs = 86400000;
	const end = new Date(Math.floor(nowMs / dayMs) * dayMs - dayMs);
	const start = new Date(end.getTime() - 29 * dayMs);
	return {
		startDate: start.toISOString().slice(0, 10),
		endDate: end.toISOString().slice(0, 10),
	};
}

// ---------------------------------------------------------------------------
// Live fetch + cache resolution with failure isolation
// ---------------------------------------------------------------------------

interface LiveSourceResult {
	metrics: CanonicalMetric[];
	quality: MetricQuality;
	note?: string;
	fetchedAt: string;
}

interface ResolvedSource {
	metrics: MetricWithFreshness[];
	quality: MetricQuality;
	note?: string;
	lastRefresh: string | null;
}

const QUALITY_RANK: Record<MetricQuality, number> = {
	OWNER_ACTION_REQUIRED: 0,
	SOURCE_AUTH_ERROR: 1,
	SOURCE_API_ERROR: 2,
	NO_SUPPORTED_ACCESS_PATH: 3,
	UNAVAILABLE: 4,
	STALE: 5,
	LIVE_PARTIAL: 6,
	LIVE_VERIFIED: 7,
};

function worstQuality(...qualities: MetricQuality[]): MetricQuality {
	return qualities.reduce((a, b) =>
		QUALITY_RANK[a] <= QUALITY_RANK[b] ? a : b,
	);
}

function isLiveQuality(q: MetricQuality): boolean {
	return q === "LIVE_VERIFIED" || q === "LIVE_PARTIAL";
}

async function staleFallback(
	db: D1Database,
	source: string,
	opts: AudienceExportOptions,
	failureQuality: MetricQuality,
	failureNote: string | undefined,
	nowMs: number,
): Promise<ResolvedSource> {
	// Prefer cached rows for the requested period; otherwise the most recent
	// cached period for this source.
	let cached = await getMetricsWithFreshness(
		db,
		{ source, period_start: opts.startDate, period_end: opts.endDate },
		nowMs,
	);
	if (cached.metrics.length === 0) {
		cached = await getMetricsWithFreshness(db, { source }, nowMs);
	}
	const sync =
		cached.sync_state.find((s) => s.source === source) ?? null;
	if (cached.metrics.length === 0) {
		return {
			metrics: [],
			quality: failureQuality,
			note: failureNote,
			lastRefresh: sync?.last_success_at ?? null,
		};
	}
	const starts = cached.metrics.map((m) => m.period_start).sort();
	const ends = cached.metrics.map((m) => m.period_end).sort();
	const actualStart = starts[0];
	const actualEnd = ends[ends.length - 1];
	const periodMismatch =
		actualStart !== opts.startDate || actualEnd !== opts.endDate;
	const noteParts = [failureNote];
	if (periodMismatch) {
		noteParts.push(
			`Showing cached data for ${actualStart}..${actualEnd} (requested ${opts.startDate}..${opts.endDate}).`,
		);
	}
	return {
		metrics: cached.metrics,
		quality: "STALE",
		note: noteParts.filter(Boolean).join(" "),
		lastRefresh: sync?.last_success_at ?? null,
	};
}

async function resolveSource(
	db: D1Database,
	source: string,
	fetchLive: () => Promise<LiveSourceResult>,
	opts: AudienceExportOptions,
	nowMs: number,
): Promise<ResolvedSource> {
	try {
		const live = await fetchLive();
		if (isLiveQuality(live.quality) && live.metrics.length > 0) {
			await recordMetrics(db, live.metrics);
			const sync = await getMetricSyncState(db, source);
			return {
				metrics: live.metrics.map((m) => ({
					...m,
					is_stale: false,
					stale_after_seconds:
						STALE_THRESHOLDS[m.source] ?? 86400,
					sync: sync[0] ?? null,
				})),
				quality: live.quality,
				note: live.note,
				lastRefresh: sync[0]?.last_success_at ?? live.fetchedAt,
			};
		}
		// Adapter-level failure (auth, config, API error): keep last known
		// good values and mark them STALE instead of surfacing an error.
		await markSourceAttempt(
			db,
			source,
			false,
			live.note ?? `${source} returned no data`,
		);
		return staleFallback(
			db,
			source,
			opts,
			live.quality,
			live.note,
			nowMs,
		);
	} catch (error) {
		const message =
			error instanceof Error ? error.message : String(error);
		await markSourceAttempt(db, source, false, message);
		return staleFallback(
			db,
			source,
			opts,
			"SOURCE_API_ERROR",
			`Live fetch failed: ${message}`,
			nowMs,
		);
	}
}

// ---------------------------------------------------------------------------
// Per-source live adapters -> canonical metrics
// ---------------------------------------------------------------------------

const GA4_LABELS: Record<string, string> = {
	activeUsers: "Active users",
	totalUsers: "Total users",
	newUsers: "New users",
	sessions: "Sessions",
	engagedSessions: "Engaged sessions",
	screenPageViews: "Views",
	engagementRate: "Engagement rate",
	averageSessionDuration: "Average engagement time",
	conversions: "Conversions",
};

async function fetchGa4Live(
	env: AudienceExportEnv,
	adapters: AudienceAdapters,
	opts: AudienceExportOptions,
): Promise<LiveSourceResult & { report: Ga4AudienceReport | null }> {
	const report = await adapters.ga4(env, {
		startDate: opts.startDate,
		endDate: opts.endDate,
		comparePrior: true,
	});
	if (!report.ok) {
		return {
			metrics: [],
			quality: report.data_quality,
			note: report.quality_note ?? report.error,
			fetchedAt: report.fetched_at,
			report,
		};
	}
	const metrics: CanonicalMetric[] = [];
	for (const total of Object.values(report.totals)) {
		metrics.push(total.current);
		if (total.percent_change_metric) {
			metrics.push(total.percent_change_metric);
		}
	}
	for (const group of Object.values(report.breakdowns)) {
		for (const row of group) {
			for (const m of Object.values(row.metrics)) metrics.push(m);
		}
	}
	return {
		metrics,
		quality: report.data_quality,
		note: report.quality_note,
		fetchedAt: report.fetched_at,
		report,
	};
}

async function fetchAdsLive(
	env: AudienceExportEnv,
	adapters: AudienceAdapters,
	opts: AudienceExportOptions,
): Promise<LiveSourceResult & { result: GoogleAdsMetricsResult | null }> {
	const result = await adapters.googleAds(env, {
		startDate: opts.startDate,
		endDate: opts.endDate,
	});
	const fetchedAt = new Date().toISOString();
	if (!result.ok) {
		return {
			metrics: [],
			quality: result.data_quality,
			note: result.quality_note ?? result.error,
			fetchedAt,
			result,
		};
	}
	return {
		metrics: result.metrics,
		quality: result.data_quality,
		note: result.quality_note,
		fetchedAt,
		result,
	};
}

async function fetchMetaLive(
	env: AudienceExportEnv,
	adapters: AudienceAdapters,
	opts: AudienceExportOptions,
): Promise<LiveSourceResult & { overview: MetaSocialOverview | null }> {
	const overview = await adapters.meta(env, {
		startDate: opts.startDate,
		endDate: opts.endDate,
	});
	const fetchedAt = new Date().toISOString();
	const metrics: CanonicalMetric[] = [];
	for (const d of overview.destinations) {
		for (const m of d.metrics) metrics.push(m as CanonicalMetric);
	}
	let quality: MetricQuality;
	if (overview.destinations.length > 0) {
		quality = worstQuality(
			...overview.destinations.map((d) => d.data_quality as MetricQuality),
		);
	} else if (!overview.ok && /not configured|missing|required/i.test(overview.error ?? "")) {
		// No destinations and the adapter itself reports a configuration /
		// credential gap (e.g. missing Meta token): an owner action, not an
		// API outage.
		quality = "OWNER_ACTION_REQUIRED";
	} else {
		quality = "SOURCE_API_ERROR";
	}
	return {
		metrics,
		quality,
		note: overview.error,
		fetchedAt,
		overview,
	};
}

async function fetchYouTubeLive(
	env: AudienceExportEnv,
	adapters: AudienceAdapters,
	opts: AudienceExportOptions,
): Promise<LiveSourceResult & { channelTitle: string | null }> {
	const result = await adapters.youtube(env);
	const fetchedAt = new Date().toISOString();
	if (!result.ok) {
		return {
			metrics: [],
			quality: (result.data_quality ?? "SOURCE_API_ERROR") as MetricQuality,
			note: result.error,
			fetchedAt,
			channelTitle: result.channel_title ?? null,
		};
	}
	const metrics: CanonicalMetric[] = result.metrics.map(
		(m: YouTubeMetric): CanonicalMetric => ({
			metric_name: m.metric_name,
			source: "youtube",
			source_account: m.source_account,
			value: m.value,
			unit: m.unit,
			scope: "channel",
			geography: "global",
			period_start: opts.startDate,
			period_end: opts.endDate,
			fetched_at: m.fetched_at,
			data_quality: m.data_quality as MetricQuality,
		}),
	);
	return {
		metrics,
		quality: (result.data_quality ?? "LIVE_VERIFIED") as MetricQuality,
		fetchedAt,
		channelTitle: result.channel_title ?? null,
	};
}

// ---------------------------------------------------------------------------
// Participation snapshot (D1 canonical — never the RunSignup API here)
// ---------------------------------------------------------------------------

interface EventResultsRow {
	series: string;
	distance: string | null;
	race_id: number | null;
	event_id: number | null;
	event_name: string | null;
	event_date: string | null;
	result_count: number | null;
	results_json: string | null;
	finalized: number | null;
	synced_at: string | null;
}

interface ParticipationCounts {
	uniqueAthletes: number;
	verifiedFinishes: number;
	registrations: number | null;
	registeredParticipants: number | null;
	eventsWithResults: number;
	finalizedEvents: number;
	series: string[];
	lastRefresh: string | null;
	quality: MetricQuality;
	note?: string;
}

export async function getParticipationCounts(
	db: D1Database,
	nowMs: number = Date.now(),
): Promise<ParticipationCounts> {
	const rows = (
		await db
			.prepare(
				`SELECT series, distance, race_id, event_id, event_name, event_date,
					result_count, results_json, finalized, synced_at
				 FROM race_event_results`,
			)
			.all<EventResultsRow>()
	).results ?? [];

	const athletes = new Set<string>();
	let verifiedFinishes = 0;
	let eventsWithResults = 0;
	let finalizedEvents = 0;
	const seriesSet = new Set<string>();
	let lastRefresh: string | null = null;

	for (const row of rows) {
		seriesSet.add(row.series);
		if (row.synced_at && (!lastRefresh || row.synced_at > lastRefresh)) {
			lastRefresh = row.synced_at;
		}
		const count = row.result_count ?? 0;
		if (count > 0) eventsWithResults += 1;
		if (row.finalized === 1) {
			finalizedEvents += 1;
			let parsed: Array<{ athlete?: unknown }> | null = null;
			try {
				const raw: unknown = JSON.parse(row.results_json ?? "[]");
				if (Array.isArray(raw)) parsed = raw;
			} catch {
				parsed = null;
			}
			if (parsed) {
				verifiedFinishes += parsed.length;
				for (const r of parsed) {
					const name =
						typeof r.athlete === "string" ? r.athlete.trim() : "";
					if (name) athletes.add(name.toUpperCase());
				}
			} else {
				verifiedFinishes += count;
			}
		}
	}

	// Registrations are a separate data concept; never infer from results.
	let registrations: number | null = null;
	let registeredParticipants: number | null = null;
	let registrationNote: string | undefined;
	try {
		const regCount = await db
			.prepare(`SELECT COUNT(*) AS total FROM series_registrations`)
			.first<{ total: number }>();
		const userCount = await db
			.prepare(
				`SELECT COUNT(DISTINCT user_id) AS users FROM series_registrations WHERE user_id IS NOT NULL`,
			)
			.first<{ users: number }>();
		const total = regCount?.total ?? 0;
		if (total > 0) {
			registrations = total;
			registeredParticipants = userCount?.users ?? 0;
		} else {
			const lastSync = await db
				.prepare(
					`SELECT status, registrations_fetched, error, finished_at
					 FROM series_registration_sync_log
					 ORDER BY id DESC LIMIT 1`,
				)
				.first<{
					status: string;
					registrations_fetched: number;
					error: string | null;
					finished_at: string | null;
				}>();
			if (lastSync) {
				registrationNote =
					`No registrations in D1 yet; last sync ${lastSync.status}` +
					` (${lastSync.registrations_fetched} fetched` +
					(lastSync.error ? `, error: ${lastSync.error}` : "") +
					`). Registration counts are reported only from an actual registration source.`;
			} else {
				registrationNote =
					"No registrations in D1 and no sync has run yet. Registration counts are reported only from an actual registration source.";
			}
		}
	} catch (error) {
		registrationNote = `Registration read failed: ${
			error instanceof Error ? error.message : String(error)
		}`;
	}

	const thresholdMs =
		(STALE_THRESHOLDS["runsignup"] ?? 86400) * 1000;
	const lastRefreshMs = lastRefresh ? Date.parse(lastRefresh) : NaN;
	const fresh =
		rows.length > 0 &&
		!Number.isNaN(lastRefreshMs) &&
		nowMs - lastRefreshMs <= thresholdMs;

	return {
		uniqueAthletes: athletes.size,
		verifiedFinishes,
		registrations,
		registeredParticipants,
		eventsWithResults,
		finalizedEvents,
		series: [...seriesSet].sort(),
		lastRefresh,
		quality:
			rows.length === 0
				? "UNAVAILABLE"
				: fresh
					? "LIVE_VERIFIED"
					: "STALE",
		note:
			rows.length === 0
				? "No race_event_results rows in D1."
				: [
						"D1 canonical snapshot (never the RunSignup API on this path).",
						registrationNote,
					]
						.filter(Boolean)
						.join(" "),
	};
}

function participationMetrics(
	counts: ParticipationCounts,
	opts: AudienceExportOptions,
	fetchedAt: string,
): CanonicalMetric[] {
	const base = {
		source: "runsignup",
		unit: "count" as const,
		scope: counts.series.length
			? `series:${counts.series.join(",")}`
			: undefined,
		geography: "global",
		period_start: opts.startDate,
		period_end: opts.endDate,
		fetched_at: fetchedAt,
		data_quality: counts.quality,
	};
	const metrics: CanonicalMetric[] = [
		{ ...base, metric_name: "runsignup.unique_athletes", value: counts.uniqueAthletes },
		{ ...base, metric_name: "runsignup.verified_finishes", value: counts.verifiedFinishes },
		{ ...base, metric_name: "runsignup.events_with_results", value: counts.eventsWithResults },
		{ ...base, metric_name: "runsignup.finalized_events", value: counts.finalizedEvents },
	];
	if (counts.registrations !== null) {
		metrics.push({
			...base,
			metric_name: "runsignup.registrations",
			value: counts.registrations,
		});
	}
	if (counts.registeredParticipants !== null) {
		metrics.push({
			...base,
			metric_name: "runsignup.registered_participants",
			value: counts.registeredParticipants,
		});
	}
	return metrics;
}

// ---------------------------------------------------------------------------
// Section builders
// ---------------------------------------------------------------------------

function entryFromMetric(m: CanonicalMetric): ExportMetricEntry {
	return {
		name: m.metric_name,
		label: m.metric_name,
		value: m.value,
		unit: m.unit,
		geography: m.geography ?? "global",
		scope: m.scope,
		data_quality: m.data_quality,
	};
}

/** Join ga4.X.delta_percent cache rows onto ga4.X entries as change_percent. */
function attachGa4Changes(entries: ExportMetricEntry[]): ExportMetricEntry[] {
	const deltas = new Map<string, number>();
	for (const e of entries) {
		const m = /^ga4\.([a-zA-Z]+)\.delta_percent$/.exec(e.name);
		if (m) deltas.set(m[1], e.value);
	}
	return entries
		.filter((e) => !/\.delta_percent$/.test(e.name))
		.map((e) => {
			const m = /^ga4\.([a-zA-Z]+)$/.exec(e.name);
			const friendly = m && GA4_LABELS[m[1]] ? GA4_LABELS[m[1]] : e.name;
			return {
				...e,
				label: friendly,
				change_percent:
					m && deltas.has(m[1]) ? deltas.get(m[1]) ?? null : null,
			};
		});
}

/** Geography label for GA4 country-breakdown scopes under NA filtering. */
function naGeographyLabel(
	metricGeography: string | undefined,
	scope: string | undefined,
): string {
	if (metricGeography === "US") return "US";
	if (scope === "country=Canada") return "CA";
	if (scope === "country=Mexico") return "MX";
	return metricGeography ?? "global";
}

function filterWebsiteEntries(
	entries: ExportMetricEntry[],
	geo: GeographyFilter | null,
): ExportMetricEntry[] {
	if (geo === null || geo === "global") return entries;
	if (geo === "US") {
		return entries.filter((e) => e.geography === "US");
	}
	// NA: US rows plus Canada/Mexico country rows (relabelled, never mixed).
	return entries
		.filter((e) => {
			const label = naGeographyLabel(e.geography, e.scope);
			return label === "US" || label === "CA" || label === "MX";
		})
		.map((e) => ({ ...e, geography: naGeographyLabel(e.geography, e.scope) }));
}

function scopeLabel(scope: string | undefined): string | undefined {
	if (!scope) return undefined;
	const eq = scope.indexOf("=");
	return eq >= 0 ? scope.slice(eq + 1) : scope;
}

function buildWebsiteSection(
	resolved: ResolvedSource,
	opts: AudienceExportOptions,
): WebsiteSection {
	const entries = attachGa4Changes(
		resolved.metrics.map(entryFromMetric),
	);

	const byScope = (prefix: string) =>
		entries
			.filter((e) => e.scope?.startsWith(prefix))
			.map((e) => ({ ...e, label: scopeLabel(e.scope) ?? e.label }));

	// Every metric carries an explicit geography label; breakdowns stay
	// available under any filter so state/country detail is never lost.
	return {
		source: "ga4",
		period: periodOf(resolved.metrics, opts),
		metrics: filterWebsiteEntries(entries, opts.geography),
		breakdowns: {
			by_source_medium: byScope("sessionSourceMedium="),
			by_landing_page: byScope("landingPage="),
			by_country: filterWebsiteEntries(byScope("country="), opts.geography),
			us_by_state: byScope("region="),
		},
		data_quality: resolved.quality,
		quality_note: resolved.note,
		last_refresh: resolved.lastRefresh,
	};
}

function periodOf(
	metrics: MetricWithFreshness[],
	opts: AudienceExportOptions,
): { start: string; end: string } {
	if (metrics.length === 0) {
		return { start: opts.startDate, end: opts.endDate };
	}
	const starts = metrics.map((m) => m.period_start).sort();
	const ends = metrics.map((m) => m.period_end).sort();
	return { start: starts[0], end: ends[ends.length - 1] };
}

function buildAdvertisingSection(
	resolved: ResolvedSource,
	liveResult: GoogleAdsMetricsResult | null,
	opts: AudienceExportOptions,
): AdvertisingSection {
	const metrics = resolved.metrics.map(entryFromMetric);
	const t = liveResult?.account_totals ?? null;
	return {
		source: "google_ads",
		period: periodOf(resolved.metrics, opts),
		metrics,
		account: t
			? {
					impressions: t.impressions,
					clicks: t.clicks,
					ctr: t.ctr,
					cost_usd: t.cost_usd,
					conversions: t.conversions,
					conversion_rate: t.conversion_rate,
				}
			: null,
		campaigns: (liveResult?.campaigns ?? []).map((c) => ({
			name: c.name,
			status: c.status,
			impressions: c.impressions,
			clicks: c.clicks,
			ctr: c.ctr,
			cost_usd: c.cost_usd,
			conversions: c.conversions,
		})),
		conversion_actions: (liveResult?.conversion_actions ?? []).map((a) => ({
			conversion_action: a.conversion_action,
			action_id: a.action_id,
			conversions: a.conversions,
		})),
		by_country: metrics.filter((e) => e.scope === "account" && e.geography !== "global"),
		data_quality: resolved.quality,
		quality_note: resolved.note,
		last_refresh: resolved.lastRefresh,
	};
}

function buildSocialSection(
	metaResolved: ResolvedSource | null,
	youtubeResolved: ResolvedSource | null,
	metaOverview: MetaSocialOverview | null,
	youtubeChannelTitle: string | null,
	opts: AudienceExportOptions,
	platformFilter: "facebook" | "instagram" | "youtube" | null,
): SocialSection {
	const destinations: SocialDestination[] = [];
	let qualities: MetricQuality[] = [];

	if (metaResolved) {
		const destQualities = new Map<string, { q: MetricQuality; note?: string }>();
		if (metaOverview) {
			for (const d of metaOverview.destinations) {
				const existing = destQualities.get(d.id);
				const q = d.data_quality as MetricQuality;
				if (!existing || QUALITY_RANK[q] < QUALITY_RANK[existing.q]) {
					destQualities.set(d.id, {
						q,
						note: d.error,
					});
				}
			}
		}
		// Group cached/live metrics per destination by source_account where
		// possible; fall back to platform grouping from the overview.
		const byPlatform = new Map<string, ExportMetricEntry[]>();
		for (const m of metaResolved.metrics) {
			const e = entryFromMetric(m);
			e.geography = "global";
			const key = e.scope ?? m.source;
			const list = byPlatform.get(key) ?? [];
			list.push(e);
			byPlatform.set(key, list);
		}
		if (metaOverview) {
			for (const d of metaOverview.destinations) {
				if (platformFilter && d.platform !== platformFilter) continue;
				const scoped = byPlatform.get(d.id) ?? byPlatform.get(d.platform) ?? [];
				const fallback = metaResolved.metrics
					.filter((m) => m.source === d.platform)
					.map((m) => {
						const e = entryFromMetric(m);
						e.geography = "global";
						return e;
					});
				const dq = destQualities.get(d.id);
				destinations.push({
					platform: d.platform,
					name: d.name,
					metrics: scoped.length ? scoped : fallback,
					data_quality: dq?.q ?? metaResolved.quality,
					quality_note: dq?.note,
				});
			}
		} else {
			// Cache-only path: one destination per platform found in cache.
			const seen = new Set<string>();
			for (const m of metaResolved.metrics) {
				const platform = m.source as "facebook" | "instagram";
				if (platformFilter && platform !== platformFilter) continue;
				if (seen.has(platform)) continue;
				seen.add(platform);
				destinations.push({
					platform,
					name: platform,
					metrics: metaResolved.metrics
						.filter((x) => x.source === platform)
						.map((x) => {
							const e = entryFromMetric(x);
							e.geography = "global";
							return e;
						}),
					data_quality: metaResolved.quality,
				});
			}
		}
	}

	if (youtubeResolved && (!platformFilter || platformFilter === "youtube")) {
		destinations.push({
			platform: "youtube",
			name: youtubeChannelTitle ?? "NWANA YouTube channel",
			metrics: youtubeResolved.metrics.map((m) => {
				const e = entryFromMetric(m);
				e.geography = "global";
				return e;
			}),
			data_quality: youtubeResolved.quality,
			quality_note: youtubeResolved.note,
		});
	}

	for (const d of destinations) qualities.push(d.data_quality);
	// No destinations but a resolved failure (e.g. Meta access not
	// configured): surface the failure quality, not a generic UNAVAILABLE.
	const resolvedQualities: MetricQuality[] = [];
	if (metaResolved) resolvedQualities.push(metaResolved.quality);
	if (youtubeResolved) resolvedQualities.push(youtubeResolved.quality);
	const quality: MetricQuality = qualities.length
		? worstQuality(...qualities)
		: resolvedQualities.length
			? worstQuality(...resolvedQualities)
			: "UNAVAILABLE";

	return {
		source:
			metaResolved && youtubeResolved
				? "meta+youtube"
				: youtubeResolved
					? "youtube"
					: "meta",
		period: periodOf(
			[...(metaResolved?.metrics ?? []), ...(youtubeResolved?.metrics ?? [])],
			opts,
		),
		destinations,
		data_quality: quality,
		quality_note:
			[metaResolved?.note, youtubeResolved?.note].filter(Boolean).join(" ") ||
			undefined,
		last_refresh: [metaResolved?.lastRefresh, youtubeResolved?.lastRefresh]
			.filter(Boolean)
			.sort()
			.reverse()[0] ?? null,
	};
}

function buildParticipationSection(
	counts: ParticipationCounts,
	resolved: ResolvedSource,
	opts: AudienceExportOptions,
): ParticipationSection {
	return {
		source: "runsignup",
		period: periodOf(resolved.metrics, opts),
		metrics: resolved.metrics.map(entryFromMetric),
		unique_athletes: counts.uniqueAthletes,
		verified_finishes: counts.verifiedFinishes,
		registrations: counts.registrations,
		registered_participants: counts.registeredParticipants,
		events_with_results: counts.eventsWithResults,
		finalized_events: counts.finalizedEvents,
		series: counts.series,
		data_quality: counts.quality,
		quality_note: counts.note,
		last_refresh: counts.lastRefresh,
	};
}

// ---------------------------------------------------------------------------
// Top-level builder
// ---------------------------------------------------------------------------

const SECTION_FOR_SOURCE: Record<string, "website" | "advertising" | "social" | "participation"> = {
	ga4: "website",
	google_ads: "advertising",
	facebook: "social",
	instagram: "social",
	youtube: "social",
	runsignup: "participation",
};

export async function buildAudienceExport(
	env: AudienceExportEnv,
	opts: AudienceExportOptions,
	adapters: AudienceAdapters = liveAudienceAdapters,
	nowMs: number = Date.now(),
): Promise<AudienceExport> {
	const db = env.nwana_engine_db;
	const wantSection = (key: "website" | "advertising" | "social" | "participation"): boolean =>
		!opts.source || SECTION_FOR_SOURCE[opts.source] === key;

	// Failure isolation across sources: every source runs as its own task
	// and tasks settle independently — one rejection never blocks the rest.
	interface SectionTask {
		key: "website" | "advertising" | "social-meta" | "social-youtube" | "participation";
		payload: unknown;
	}
	const tasks: Array<Promise<SectionTask>> = [];

	if (wantSection("website")) {
		tasks.push(
			(async (): Promise<SectionTask> => {
				let report: Ga4AudienceReport | null = null;
				const resolved = await resolveSource(db, "ga4", async () => {
					const live = await fetchGa4Live(env, adapters, opts);
					report = live.report;
					return live;
				}, opts, nowMs);
				return { key: "website", payload: { resolved, report } };
			})(),
		);
	}
	if (wantSection("advertising")) {
		tasks.push(
			(async (): Promise<SectionTask> => {
				let result: GoogleAdsMetricsResult | null = null;
				const resolved = await resolveSource(db, "google_ads", async () => {
					const live = await fetchAdsLive(env, adapters, opts);
					result = live.result;
					return live;
				}, opts, nowMs);
				return { key: "advertising", payload: { resolved, result } };
			})(),
		);
	}
	if (wantSection("social")) {
		const needMeta =
			!opts.source ||
			opts.source === "facebook" ||
			opts.source === "instagram";
		const needYoutube = !opts.source || opts.source === "youtube";
		if (needMeta) {
			tasks.push(
				(async (): Promise<SectionTask> => {
					let overview: MetaSocialOverview | null = null;
					const resolved = await resolveSource(db, "meta", async () => {
						const live = await fetchMetaLive(env, adapters, opts);
						overview = live.overview;
						return live;
					}, opts, nowMs);
					return { key: "social-meta", payload: { resolved, overview } };
				})(),
			);
		}
		if (needYoutube) {
			tasks.push(
				(async (): Promise<SectionTask> => {
					let channelTitle: string | null = null;
					const resolved = await resolveSource(db, "youtube", async () => {
						const live = await fetchYouTubeLive(env, adapters, opts);
						channelTitle = live.channelTitle;
						return live;
					}, opts, nowMs);
					return { key: "social-youtube", payload: { resolved, channelTitle } };
				})(),
			);
		}
	}
	if (wantSection("participation")) {
		tasks.push(
			(async (): Promise<SectionTask> => {
				let counts: ParticipationCounts | null = null;
				const fetchedAt = new Date(nowMs).toISOString();
				const resolved = await resolveSource(db, "runsignup", async () => {
					const snapshot = await getParticipationCounts(db, nowMs);
					counts = snapshot;
					return {
						metrics: participationMetrics(snapshot, opts, fetchedAt),
						quality: snapshot.quality,
						note: snapshot.note,
						fetchedAt,
					} satisfies LiveSourceResult;
				}, opts, nowMs);
				if (!counts) {
					counts = await getParticipationCounts(db, nowMs);
				}
				return { key: "participation", payload: { resolved, counts } };
			})(),
		);
	}

	const settled = await Promise.allSettled(tasks);
	interface WebsitePayload { resolved: ResolvedSource; report: Ga4AudienceReport | null }
	interface AdsPayload { resolved: ResolvedSource; result: GoogleAdsMetricsResult | null }
	interface MetaPayload { resolved: ResolvedSource; overview: MetaSocialOverview | null }
	interface YoutubePayload { resolved: ResolvedSource; channelTitle: string | null }
	interface ParticipationPayload { resolved: ResolvedSource; counts: ParticipationCounts }
	let ga4: WebsitePayload | null = null;
	let ads: AdsPayload | null = null;
	let meta: MetaPayload | null = null;
	let youtube: YoutubePayload | null = null;
	let participation: ParticipationPayload | null = null;
	for (const entry of settled) {
		if (entry.status !== "fulfilled") continue;
		const task = entry.value;
		if (task.key === "website") ga4 = task.payload as WebsitePayload;
		else if (task.key === "advertising") ads = task.payload as AdsPayload;
		else if (task.key === "social-meta") meta = task.payload as MetaPayload;
		else if (task.key === "social-youtube") youtube = task.payload as YoutubePayload;
		else if (task.key === "participation") participation = task.payload as ParticipationPayload;
	}

	const sections: AudienceExport["sections"] = {
		website: ga4 ? buildWebsiteSection(ga4.resolved, opts) : null,
		advertising: ads ? buildAdvertisingSection(ads.resolved, ads.result, opts) : null,
		social:
			meta || youtube
				? buildSocialSection(
						meta?.resolved ?? null,
						youtube?.resolved ?? null,
						meta?.overview ?? null,
						youtube?.channelTitle ?? null,
						opts,
						opts.source === "facebook" ||
							opts.source === "instagram" ||
							opts.source === "youtube"
							? (opts.source as "facebook" | "instagram" | "youtube")
							: null,
					)
				: null,
		participation: participation
			? buildParticipationSection(participation.counts, participation.resolved, opts)
			: null,
	};

	const summary: DataQualitySummary = {
		LIVE_VERIFIED: 0,
		LIVE_PARTIAL: 0,
		STALE: 0,
		UNAVAILABLE: 0,
		SOURCE_AUTH_ERROR: 0,
		SOURCE_API_ERROR: 0,
		OWNER_ACTION_REQUIRED: [],
		NO_SUPPORTED_ACCESS_PATH: 0,
	};
	const allEntries: ExportMetricEntry[] = [
		...(sections.website?.metrics ?? []),
		...(sections.advertising?.metrics ?? []),
		...(sections.social?.destinations.flatMap((d) => d.metrics) ?? []),
		...(sections.participation?.metrics ?? []),
	];
	for (const e of allEntries) {
		if (e.data_quality === "OWNER_ACTION_REQUIRED") continue;
		summary[e.data_quality] += 1;
	}
	const sectionsWithMeta: Array<{ source: string; section: ExportSectionBase | null }> = [
		{ source: "ga4", section: sections.website },
		{ source: "google_ads", section: sections.advertising },
		{ source: "meta+youtube", section: sections.social },
		{ source: "runsignup", section: sections.participation },
	];
	for (const { source, section } of sectionsWithMeta) {
		if (
			section &&
			(section.data_quality === "OWNER_ACTION_REQUIRED" ||
				section.data_quality === "SOURCE_AUTH_ERROR")
		) {
			summary.OWNER_ACTION_REQUIRED.push({
				source,
				note: section.quality_note ?? "Owner action required — see section note.",
			});
		}
	}

	const output: AudienceExport = {
		generated_at: new Date(nowMs).toISOString(),
		reporting_period: { start: opts.startDate, end: opts.endDate },
		geography_filter: opts.geography,
		sections,
		data_quality_summary: summary,
	};
	return scrubSponsorValue(output) as AudienceExport;
}
