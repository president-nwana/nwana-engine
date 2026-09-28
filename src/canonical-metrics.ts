// Canonical normalized metrics layer.
//
// One D1-backed store of current operational truth for audience, analytics,
// ads, social, participation, membership, groups, and Academy data.
//
// Rules enforced here:
// - Metrics are upserted by (metric_name, source, scope, geography,
//   period_start, period_end). No duplicates, no history table — the store
//   holds the current value per period; history is reconstructed from
//   period_start/period_end ranges when needed.
// - A failed fetch NEVER deletes last known good values. Rows stay and are
//   marked STALE instead of being replaced with a generic error.
// - Every consumer (Operating Center, export API) reads from this layer,
//   so there is no second dashboard truth.
//
// Quality states:
//   LIVE_VERIFIED          value fetched live and verified against the source
//   LIVE_PARTIAL           live but with a documented official limitation
//   STALE                  last known good value; fetch failed or is overdue
//   UNAVAILABLE            source has no data for this metric
//   SOURCE_AUTH_ERROR      token/credential invalid or missing
//   SOURCE_API_ERROR       source API returned an error
//   OWNER_ACTION_REQUIRED  blocked on a specific owner action (see quality_note)
//   NO_SUPPORTED_ACCESS_PATH verified: no official $0 access path exists

export type MetricQuality =
	| "LIVE_VERIFIED"
	| "LIVE_PARTIAL"
	| "STALE"
	| "UNAVAILABLE"
	| "SOURCE_AUTH_ERROR"
	| "SOURCE_API_ERROR"
	| "OWNER_ACTION_REQUIRED"
	| "NO_SUPPORTED_ACCESS_PATH";

export type MetricUnit = "count" | "usd" | "percent" | "seconds";

export interface CanonicalMetric {
	metric_name: string; // "ga4.sessions", "google_ads.clicks", "instagram.followers", ...
	source: string; // "ga4" | "google_ads" | "facebook" | "instagram" | "threads" | "linkedin" | "youtube" | "runsignup" | "academy" | "membership" | "groups"
	source_account?: string;
	value: number;
	unit: MetricUnit;
	scope?: string;
	geography?: string; // "US" | "US-CA" | "NA" | "global" | undefined
	period_start: string; // YYYY-MM-DD
	period_end: string; // YYYY-MM-DD
	fetched_at: string; // ISO timestamp
	source_updated_at?: string;
	data_quality: MetricQuality;
	quality_note?: string;
	source_reference?: string;
}

export interface MetricSyncState {
	source: string;
	last_success_at: string | null;
	last_attempt_at: string | null;
	last_error: string | null;
	next_refresh_at: string | null;
	stale_after_seconds: number;
}

export interface MetricFilters {
	source?: string;
	geography?: string;
	period_start?: string;
	period_end?: string;
	metric_name?: string;
}

export interface MetricWithFreshness extends CanonicalMetric {
	is_stale: boolean;
	stale_after_seconds: number;
	sync: MetricSyncState | null;
}

/** Per-source freshness thresholds in seconds. */
export const STALE_THRESHOLDS: Record<string, number> = {
	ga4: 21600, // 6h
	google_ads: 21600, // 6h
	facebook: 86400, // 24h
	instagram: 86400, // 24h
	youtube: 86400, // 24h
	linkedin: 604800, // 7d
	runsignup: 3600, // 1h
	threads: 86400, // 24h
	academy: 86400, // 24h
	membership: 86400, // 24h
	groups: 86400, // 24h
};

export const DEFAULT_STALE_SECONDS = 86400;

const LIVE_QUALITIES: ReadonlySet<MetricQuality> = new Set(["LIVE_VERIFIED", "LIVE_PARTIAL"]);

function nowIso(): string {
	return new Date().toISOString();
}

/** Normalize nullable key parts so upserts are idempotent (NULL never equals NULL). */
function keyPart(value: string | undefined | null): string {
	return value ?? "";
}

export function staleSecondsFor(source: string, sync: MetricSyncState | null): number {
	if (sync && Number.isFinite(sync.stale_after_seconds) && sync.stale_after_seconds > 0) {
		return sync.stale_after_seconds;
	}
	return STALE_THRESHOLDS[source] ?? DEFAULT_STALE_SECONDS;
}

function isFetchedStale(fetchedAt: string, staleAfterSeconds: number, nowMs: number): boolean {
	const fetchedMs = Date.parse(fetchedAt);
	if (Number.isNaN(fetchedMs)) return true;
	return nowMs - fetchedMs > staleAfterSeconds * 1000;
}

/** Human-readable explanation of a data-quality state, for UI display. */
export function qualityLabel(q: MetricQuality): string {
	switch (q) {
		case "LIVE_VERIFIED":
			return "Live — verified against the source right now.";
		case "LIVE_PARTIAL":
			return "Live — partial: the source has an official limitation documented in the note.";
		case "STALE":
			return "Stale — last known good value kept; the latest fetch failed or is overdue.";
		case "UNAVAILABLE":
			return "Unavailable — the source reports no data for this metric.";
		case "SOURCE_AUTH_ERROR":
			return "Authentication error — the stored token or credential is invalid or missing.";
		case "SOURCE_API_ERROR":
			return "Source API error — the last request to the source failed.";
		case "OWNER_ACTION_REQUIRED":
			return "Owner action required — see the note for the exact step to unblock.";
		case "NO_SUPPORTED_ACCESS_PATH":
			return "No supported access path — verified: no official $0 way to fetch this exists.";
		default:
			return "Unknown quality state.";
	}
}

/**
 * Upsert metrics by the unique key
 * (metric_name, source, scope, geography, period_start, period_end).
 * Also refreshes metric_sync_state for every touched source:
 * last_attempt_at always, last_success_at when at least one LIVE_* metric
 * was recorded, last_error cleared.
 */
export async function recordMetrics(db: D1Database, metrics: CanonicalMetric[]): Promise<void> {
	if (metrics.length === 0) return;
	const now = nowIso();

	for (const m of metrics) {
		await db
			.prepare(
				`INSERT INTO audience_metrics
					(metric_name, source, source_account, value, unit, scope, geography,
					 period_start, period_end, fetched_at, source_updated_at,
					 data_quality, quality_note, source_reference)
				VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				ON CONFLICT (metric_name, source, scope, geography, period_start, period_end)
				DO UPDATE SET
					source_account = excluded.source_account,
					value = excluded.value,
					unit = excluded.unit,
					fetched_at = excluded.fetched_at,
					source_updated_at = excluded.source_updated_at,
					data_quality = excluded.data_quality,
					quality_note = excluded.quality_note,
					source_reference = excluded.source_reference`,
			)
			.bind(
				m.metric_name,
				m.source,
				m.source_account ?? null,
				m.value,
				m.unit,
				keyPart(m.scope),
				keyPart(m.geography),
				m.period_start,
				m.period_end,
				m.fetched_at,
				m.source_updated_at ?? null,
				m.data_quality,
				m.quality_note ?? null,
				m.source_reference ?? null,
			)
			.run();
	}

	const bySource = new Map<string, CanonicalMetric[]>();
	for (const m of metrics) {
		const list = bySource.get(m.source) ?? [];
		list.push(m);
		bySource.set(m.source, list);
	}

	for (const [source, list] of bySource) {
		const hasLive = list.some((m) => LIVE_QUALITIES.has(m.data_quality));
		const threshold = STALE_THRESHOLDS[source] ?? DEFAULT_STALE_SECONDS;
		const nextRefresh = new Date(Date.parse(now) + threshold * 1000).toISOString();
		await db
			.prepare(
				`INSERT INTO metric_sync_state
					(source, last_success_at, last_attempt_at, last_error, next_refresh_at, stale_after_seconds)
				VALUES (?, ?, ?, NULL, ?, ?)
				ON CONFLICT (source) DO UPDATE SET
					last_attempt_at = excluded.last_attempt_at,
					last_success_at = COALESCE(excluded.last_success_at, metric_sync_state.last_success_at),
					last_error = NULL,
					stale_after_seconds = metric_sync_state.stale_after_seconds,
					next_refresh_at = excluded.next_refresh_at`,
			)
			.bind(source, hasLive ? now : null, now, nextRefresh, threshold)
			.run();
	}
}

interface MetricRow {
	metric_name: string;
	source: string;
	source_account: string | null;
	value: number;
	unit: MetricUnit;
	scope: string;
	geography: string;
	period_start: string;
	period_end: string;
	fetched_at: string;
	source_updated_at: string | null;
	data_quality: MetricQuality;
	quality_note: string | null;
	source_reference: string | null;
}

function rowToMetric(row: MetricRow): CanonicalMetric {
	return {
		metric_name: row.metric_name,
		source: row.source,
		source_account: row.source_account ?? undefined,
		value: row.value,
		unit: row.unit,
		scope: row.scope === "" ? undefined : row.scope,
		geography: row.geography === "" ? undefined : row.geography,
		period_start: row.period_start,
		period_end: row.period_end,
		fetched_at: row.fetched_at,
		source_updated_at: row.source_updated_at ?? undefined,
		data_quality: row.data_quality,
		quality_note: row.quality_note ?? undefined,
		source_reference: row.source_reference ?? undefined,
	};
}

/** Read cached metrics. Filters are exact matches; all are optional. */
export async function getCachedMetrics(
	db: D1Database,
	filters: MetricFilters = {},
): Promise<CanonicalMetric[]> {
	const clauses: string[] = [];
	const args: unknown[] = [];
	if (filters.source !== undefined) {
		clauses.push("source = ?");
		args.push(filters.source);
	}
	if (filters.metric_name !== undefined) {
		clauses.push("metric_name = ?");
		args.push(filters.metric_name);
	}
	if (filters.geography !== undefined) {
		clauses.push("geography = ?");
		args.push(keyPart(filters.geography));
	}
	if (filters.period_start !== undefined) {
		clauses.push("period_start = ?");
		args.push(filters.period_start);
	}
	if (filters.period_end !== undefined) {
		clauses.push("period_end = ?");
		args.push(filters.period_end);
	}
	const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
	const result = await db
		.prepare(
			`SELECT metric_name, source, source_account, value, unit, scope, geography,
				period_start, period_end, fetched_at, source_updated_at,
				data_quality, quality_note, source_reference
			FROM audience_metrics ${where}
			ORDER BY source, metric_name, period_start`,
		)
		.bind(...args)
		.all<MetricRow>();
	return (result.results ?? []).map(rowToMetric);
}

/** Read the sync state for one source, or for all sources when omitted. */
export async function getMetricSyncState(
	db: D1Database,
	source?: string,
): Promise<MetricSyncState[]> {
	const sql =
		source === undefined
			? `SELECT source, last_success_at, last_attempt_at, last_error, next_refresh_at, stale_after_seconds
				FROM metric_sync_state`
			: `SELECT source, last_success_at, last_attempt_at, last_error, next_refresh_at, stale_after_seconds
				FROM metric_sync_state WHERE source = ?`;
	const stmt = db.prepare(sql);
	const result =
		source === undefined ? await stmt.all<MetricSyncState>() : await stmt.bind(source).all<MetricSyncState>();
	return result.results ?? [];
}

/**
 * Cached metrics annotated with freshness: is_stale is true when fetched_at
 * is older than the per-source threshold (sync state override wins, then
 * STALE_THRESHOLDS, then the default). The sync state per source is attached.
 */
export async function getMetricsWithFreshness(
	db: D1Database,
	filters: MetricFilters = {},
	nowMs: number = Date.now(),
): Promise<{ metrics: MetricWithFreshness[]; sync_state: MetricSyncState[] }> {
	const metrics = await getCachedMetrics(db, filters);
	const syncState = await getMetricSyncState(db);
	const syncBySource = new Map(syncState.map((s) => [s.source, s]));
	const annotated = metrics.map((m) => {
		const sync = syncBySource.get(m.source) ?? null;
		const staleAfterSeconds = staleSecondsFor(m.source, sync);
		return {
			...m,
			is_stale: isFetchedStale(m.fetched_at, staleAfterSeconds, nowMs),
			stale_after_seconds: staleAfterSeconds,
			sync,
		};
	});
	return { metrics: annotated, sync_state: syncState };
}

/**
 * Record a fetch attempt for a source.
 *
 * - ok = true: marks last_success_at, clears last_error.
 * - ok = false: records last_error and downgrades any LIVE_* rows for the
 *   source to STALE — values are kept, never deleted or replaced with an
 *   error placeholder.
 */
export async function markSourceAttempt(
	db: D1Database,
	source: string,
	ok: boolean,
	error?: string,
): Promise<void> {
	const now = nowIso();
	const threshold = STALE_THRESHOLDS[source] ?? DEFAULT_STALE_SECONDS;
	const nextRefresh = new Date(Date.parse(now) + threshold * 1000).toISOString();

	if (ok) {
		await db
			.prepare(
				`INSERT INTO metric_sync_state
					(source, last_success_at, last_attempt_at, last_error, next_refresh_at, stale_after_seconds)
				VALUES (?, ?, ?, NULL, ?, ?)
				ON CONFLICT (source) DO UPDATE SET
					last_success_at = excluded.last_success_at,
					last_attempt_at = excluded.last_attempt_at,
					last_error = NULL,
					next_refresh_at = excluded.next_refresh_at`,
			)
			.bind(source, now, now, nextRefresh, threshold)
			.run();
		return;
	}

	await db
		.prepare(
			`INSERT INTO metric_sync_state
				(source, last_success_at, last_attempt_at, last_error, next_refresh_at, stale_after_seconds)
			VALUES (?, NULL, ?, ?, ?, ?)
			ON CONFLICT (source) DO UPDATE SET
				last_attempt_at = excluded.last_attempt_at,
				last_error = excluded.last_error,
				next_refresh_at = excluded.next_refresh_at`,
		)
		.bind(source, now, error ?? "fetch failed", nextRefresh, threshold)
		.run();

	// Keep last known good values; mark them STALE, never an error placeholder.
	const note = `Live fetch failed at ${now} — keeping last known good value${error ? `: ${error}` : ""}.`;
	await db
		.prepare(
			`UPDATE audience_metrics
			SET data_quality = 'STALE', quality_note = ?
			WHERE source = ? AND data_quality IN ('LIVE_VERIFIED', 'LIVE_PARTIAL')`,
		)
		.bind(note, source)
		.run();
}
