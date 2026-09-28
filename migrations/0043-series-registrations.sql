-- 0043: Series 2026 registration / participant data layer.
--
-- Registrations and participants are stored separately from race_event_results.
-- Definitions (never mix):
--   registration          = one RunSignup registration record (race_id, registration_id)
--   registered participant = one distinct RunSignup user (user_id) with >= 1 active registration
--   athlete with results  = distinct athlete name in finalized race_event_results
--   verified finish       = one finalized result record in race_event_results
--
-- Source: RunSignup "Get Race Participants"
--   GET https://api.runsignup.com/rest/race/:race_id/participants
-- Free API (Apache free-use license). OAuth2 Bearer auth (race director grant).
-- Personal data kept minimal: user_id + name only (no emails, no payment details).

CREATE TABLE IF NOT EXISTS series_registrations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	race_id INTEGER NOT NULL,
	race_name TEXT,
	event_id INTEGER NOT NULL,
	event_name TEXT,
	distance_label TEXT NOT NULL,
	registration_id INTEGER NOT NULL,
	user_id INTEGER,
	first_name TEXT,
	last_name TEXT,
	status TEXT,
	registration_date TEXT,
	last_modified TEXT,
	synced_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	UNIQUE (race_id, registration_id)
);

CREATE INDEX IF NOT EXISTS idx_series_registrations_race
	ON series_registrations (race_id);
CREATE INDEX IF NOT EXISTS idx_series_registrations_event
	ON series_registrations (event_id);
CREATE INDEX IF NOT EXISTS idx_series_registrations_user
	ON series_registrations (user_id);
CREATE INDEX IF NOT EXISTS idx_series_registrations_status
	ON series_registrations (status);

CREATE TABLE IF NOT EXISTS series_registration_sync_log (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	started_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	finished_at TEXT,
	race_id INTEGER,
	distance_label TEXT,
	status TEXT NOT NULL DEFAULT 'started',
	registrations_fetched INTEGER NOT NULL DEFAULT 0,
	error TEXT
);
