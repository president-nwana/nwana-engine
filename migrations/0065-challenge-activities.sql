-- Challenge Series activity→sub-event mapping (2026-10-04).
-- RunSignup API rejects bundle registrations against sub-event event_ids, so
-- activities are written under the bundle event_id. This table records the
-- intended sub-event at submit time for weekly aggregation. No D1 mapping is
-- used for classification beyond this verified necessity.
CREATE TABLE IF NOT EXISTS challenge_activities (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	tally_split_num INTEGER NOT NULL UNIQUE,
	race_id INTEGER NOT NULL,
	submit_event_id INTEGER NOT NULL,
	sub_event_id INTEGER NOT NULL,
	registration_id INTEGER NOT NULL,
	rsu_user_id INTEGER NOT NULL,
	activity_date TEXT NOT NULL,
	distance_m INTEGER,
	time_s INTEGER,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_challenge_activities_user_date ON challenge_activities(rsu_user_id, activity_date);
CREATE INDEX IF NOT EXISTS idx_challenge_activities_sub_event ON challenge_activities(sub_event_id, activity_date);
