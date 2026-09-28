-- Migration 0046: normalized canonical metrics store (audience / analytics / ads / social / participation).
--
-- One D1-backed store for current operational truth. Every metric carries
-- its source, geography, reporting period, fetch time, and a data-quality
-- state. Failed fetches never delete last known good values: rows stay and
-- are marked STALE instead of being replaced with a generic error.
--
-- The Operating Center and the export API read from this layer — one truth.
--
-- Naming: "ga4.sessions", "google_ads.clicks", "instagram.followers",
-- "runsignup.verified_finishes", "groups.active_groups", etc.

CREATE TABLE IF NOT EXISTS audience_metrics (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	metric_name TEXT NOT NULL,
	source TEXT NOT NULL,
	source_account TEXT,
	value REAL NOT NULL,
	unit TEXT NOT NULL,
	scope TEXT NOT NULL DEFAULT '',
	geography TEXT NOT NULL DEFAULT '',
	period_start TEXT NOT NULL,
	period_end TEXT NOT NULL,
	fetched_at TEXT NOT NULL,
	source_updated_at TEXT,
	data_quality TEXT NOT NULL,
	quality_note TEXT,
	source_reference TEXT,
	UNIQUE (metric_name, source, scope, geography, period_start, period_end),
	CHECK (unit IN ('count', 'usd', 'percent', 'seconds')),
	CHECK (data_quality IN (
		'LIVE_VERIFIED',
		'LIVE_PARTIAL',
		'STALE',
		'UNAVAILABLE',
		'SOURCE_AUTH_ERROR',
		'SOURCE_API_ERROR',
		'OWNER_ACTION_REQUIRED',
		'NO_SUPPORTED_ACCESS_PATH'
	))
);

CREATE INDEX IF NOT EXISTS idx_audience_metrics_source ON audience_metrics (source);
CREATE INDEX IF NOT EXISTS idx_audience_metrics_period ON audience_metrics (period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_audience_metrics_geography ON audience_metrics (geography);

CREATE TABLE IF NOT EXISTS metric_sync_state (
	source TEXT PRIMARY KEY,
	last_success_at TEXT,
	last_attempt_at TEXT,
	last_error TEXT,
	next_refresh_at TEXT,
	stale_after_seconds INTEGER NOT NULL DEFAULT 86400
);
