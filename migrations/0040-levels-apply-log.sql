-- Append-only audit log for the owner-approved Series 2026 levels apply path
-- (src/series-2026-apply.ts). Every apply attempt is recorded with its per-step
-- report: COMPLETED (all writes succeeded), FAILED (a step failed and the
-- remaining steps were aborted), or REJECTED (a gate refused the run before
-- any external write). Nothing here changes the lifecycle stage: the next
-- owner-triggered sync derives it from fresh RunSignup facts (ADR-0008).

CREATE TABLE IF NOT EXISTS levels_apply_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series TEXT NOT NULL,
  distance TEXT NOT NULL,
  race_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  result_set_id INTEGER,
  result_count INTEGER NOT NULL DEFAULT 0,
  steps_json TEXT NOT NULL,
  status TEXT NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_levels_apply_log_distance
ON levels_apply_log(series, distance, created_at);
