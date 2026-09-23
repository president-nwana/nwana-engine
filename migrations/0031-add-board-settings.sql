-- Migration 0031: board meeting cadence settings.
--
-- The weekly Board loop reads its cadence from board_settings so the
-- schedule can change without a code deploy. Defaults match the only
-- board time the owner ever named: weekly, Sunday 2:00 PM New York time.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS plus INSERT OR IGNORE, safe to
-- re-run.

CREATE TABLE IF NOT EXISTS board_settings (
	key TEXT PRIMARY KEY,
	value TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT OR IGNORE INTO board_settings (key, value) VALUES
	('meeting_cadence', 'weekly'),
	('meeting_weekday', 'Sunday'),
	('meeting_time', '14:00'),
	('meeting_timezone', 'America/New_York'),
	('meeting_title', 'Weekly Board meeting');
