-- 0023: first-seen marker for race events, so the engine announces only
-- genuinely new events (ADR-0012). Existing events are backfilled from
-- race_event_results at deploy time; nothing is announced retroactively.
CREATE TABLE IF NOT EXISTS race_event_first_seen (
	series TEXT NOT NULL,
	distance TEXT NOT NULL,
	race_id INTEGER NOT NULL,
	event_id INTEGER NOT NULL,
	event_name TEXT,
	event_date TEXT,
	first_seen_at TEXT NOT NULL,
	PRIMARY KEY (series, distance, event_id)
);

CREATE INDEX IF NOT EXISTS idx_race_event_first_seen_at
	ON race_event_first_seen (first_seen_at);
