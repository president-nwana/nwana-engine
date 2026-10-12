-- 0087: D1 cache for slow RunSignup-backed aggregate stats.
-- First consumer: series-stats (total registration count for the Charity
-- Challenge homepage). The RunSignup participants call takes 1–40s, so the
-- endpoint serves the last confirmed value from this table and refreshes
-- it in the background (stale-while-revalidate, 10-minute TTL).
-- value_json holds the stat payload, e.g. {"total_registrations": 9}.
-- refresh_started_at guards against parallel refresh pile-ups.

CREATE TABLE IF NOT EXISTS challenge_stats_cache (
	cache_key TEXT PRIMARY KEY,
	value_json TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	refresh_started_at TEXT
);
