-- Series 2026 race lifecycle state (Phase 1).
-- One row per distance tracks the active event moving through:
-- registration_open -> awaiting_results -> verifying -> levels_computed ->
-- published -> next_race_prep.
-- write_access stays UNKNOWN until a live write test confirms or denies it;
-- write_mode stays dry_run until an owner-approved apply path exists.

CREATE TABLE IF NOT EXISTS race_lifecycle (
  series TEXT NOT NULL,
  distance TEXT NOT NULL,
  race_id INTEGER NOT NULL,
  active_event_id INTEGER,
  active_event_name TEXT,
  active_event_date TEXT,
  stage TEXT NOT NULL,
  events_json TEXT,
  prep_json TEXT,
  prep_confirmed TEXT NOT NULL DEFAULT 'false',
  write_access TEXT NOT NULL DEFAULT 'UNKNOWN',
  write_mode TEXT NOT NULL DEFAULT 'dry_run',
  notes TEXT,
  synced_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (series, distance)
);

CREATE INDEX IF NOT EXISTS idx_race_lifecycle_stage
ON race_lifecycle(series, stage);
