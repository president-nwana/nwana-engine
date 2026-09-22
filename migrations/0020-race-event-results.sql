-- Migration 0020: per-event race results snapshot for the operating center
-- results page. Written by lifecycle sync (read-only from RunSignup);
-- never written by any other path.

CREATE TABLE IF NOT EXISTS race_event_results (
  series TEXT NOT NULL,
  distance TEXT NOT NULL,
  race_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  event_name TEXT,
  event_date TEXT,
  result_count INTEGER NOT NULL DEFAULT 0,
  finalized INTEGER NOT NULL DEFAULT 0,
  results_json TEXT NOT NULL DEFAULT '[]',
  synced_at TEXT,
  PRIMARY KEY (series, distance, event_id)
);

CREATE INDEX IF NOT EXISTS idx_race_event_results_distance
ON race_event_results(series, distance);
