-- Personal Best tracking for fixed-distance (speed) Charity Challenge events.
-- Recognition v1 (2026-10-07): (rsu_user_id, event_id) -> fastest valid result ever.
--
-- Validity rule: a result is valid iff it has a row in challenge_activities
-- with time_s NOT NULL and time_s > 0. Deleted activities are hard-deleted
-- from challenge_activities (see handleDeleteActivity), so they are naturally
-- excluded. RunSignup-rejected activities are never inserted, so they are
-- excluded too.
--
-- The row is DERIVED: recomputePersonalBest() (src/challenge-personal-best.ts)
-- rebuilds it from scratch on every insert/delete, so deleting the current
-- PB automatically recalculates from the remaining valid results.
-- previous_best_s = the personal record standing when the current best was
-- achieved (NOT the second-fastest time: a later slower result never rewrites
-- it). improvement_s = previous_best_s - best_time_s.
-- pb_achieved_at = best_activity_date (the date the current PB was achieved):
-- baseline date, new-PB date, unchanged on slower results, surviving-PB date
-- after a delete-recalc. Never a stale "first ever" timestamp.
-- performance_level is set ONLY for the 4 Nordic Walking charity events
-- (1K/3K/5K/10K) using the exact Series 2026 thresholds, read-only;
-- NULL for every other event/discipline (no invented thresholds).
CREATE TABLE IF NOT EXISTS challenge_personal_bests (
	rsu_user_id INTEGER NOT NULL,
	event_id INTEGER NOT NULL,
	best_time_s INTEGER NOT NULL,
	best_tally_split_num INTEGER NOT NULL,
	best_activity_date TEXT NOT NULL,
	previous_best_s INTEGER,
	improvement_s INTEGER,
	performance_level TEXT,
	pb_achieved_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	PRIMARY KEY (rsu_user_id, event_id)
);
CREATE INDEX IF NOT EXISTS idx_challenge_pb_event_time ON challenge_personal_bests(event_id, best_time_s);
