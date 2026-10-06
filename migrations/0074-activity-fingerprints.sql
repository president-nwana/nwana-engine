-- Deduplication of file-based activity submissions (FIT/GPX/TCX).
-- Stores a stable fingerprint per (user, fingerprint) so the same source
-- activity file can never create a second RunSignup activity, even if
-- uploaded days later. Two genuinely different workouts always have
-- different source timestamps/activity IDs, so they are never blocked.
CREATE TABLE IF NOT EXISTS challenge_activity_fingerprints (
	rsu_user_id INTEGER NOT NULL,
	fingerprint TEXT NOT NULL,
	event_id INTEGER NOT NULL,
	tally_split_num INTEGER,
	submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	PRIMARY KEY (rsu_user_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS idx_activity_fp_user ON challenge_activity_fingerprints(rsu_user_id);
