-- Migration 0044: per-result owner approvals + event submission deadlines.
--
-- ADR-0042: the owner's single reserved action is approving the athlete's
-- result. Approvals are first-class records; the Machine's downstream
-- lifecycle is authorized by them and never invents them.
--
-- series_result_approvals: one row per owner-approved RunSignup result.
--   source: 'oc' (Operating Center button) | 'chat' (owner statement in chat,
--   recorded by the agent) | 'import'.
-- series_event_deadlines: submission deadline per event for trigger B.
--   source: which RunSignup API field supplied the deadline (verified, never
--   hardcoded). NULL deadline = unknown; trigger B cannot fire.

CREATE TABLE IF NOT EXISTS series_result_approvals (
  series TEXT NOT NULL,
  distance TEXT NOT NULL,
  race_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  result_id TEXT NOT NULL,
  athlete TEXT,
  time TEXT,
  approved_at TEXT NOT NULL,
  approved_by TEXT NOT NULL DEFAULT 'owner',
  source TEXT NOT NULL DEFAULT 'oc',
  PRIMARY KEY (series, distance, event_id, result_id)
);

CREATE INDEX IF NOT EXISTS idx_series_result_approvals_event
ON series_result_approvals(series, distance, event_id);

CREATE TABLE IF NOT EXISTS series_event_deadlines (
  series TEXT NOT NULL,
  distance TEXT NOT NULL,
  race_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  submission_deadline TEXT,
  deadline_source TEXT,
  checked_at TEXT NOT NULL,
  PRIMARY KEY (series, distance, event_id)
);

-- series_auto_process_log: audit trail of the Machine's autonomous
-- downstream runs (ADR-0042). One row per step per event run.
CREATE TABLE IF NOT EXISTS series_auto_process_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series TEXT NOT NULL,
  distance TEXT NOT NULL,
  race_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  trigger TEXT NOT NULL,
  step TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_series_auto_process_log_event
ON series_auto_process_log(series, distance, event_id, created_at);
