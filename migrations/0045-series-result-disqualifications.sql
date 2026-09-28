-- Migration 0045: per-result owner disqualifications (ADR-0043).
--
-- The owner's sports decisions on a submitted result are exactly two:
-- Approve (series_result_approvals) or Disqualify (this table).
-- Absence of a decision is NOT a disqualification: the result stays Submitted.
--
-- series_result_disqualifications: one row per owner-disqualified RunSignup result.
--   A disqualified result: 0 points, excluded from valid finishes and from
--   scoring (standings upload), displayed as DSQ. DNS is never stored here:
--   a registered athlete with no submitted result after the deadline is a
--   derived DNS, not a decision.
--   source: 'oc' (Operating Center button) | 'chat' (owner statement in chat,
--   recorded by the agent) | 'import'.

CREATE TABLE IF NOT EXISTS series_result_disqualifications (
  series TEXT NOT NULL,
  distance TEXT NOT NULL,
  race_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  result_id TEXT NOT NULL,
  athlete TEXT,
  time TEXT,
  reason TEXT,
  decided_at TEXT NOT NULL,
  decided_by TEXT NOT NULL DEFAULT 'owner',
  source TEXT NOT NULL DEFAULT 'oc',
  PRIMARY KEY (series, distance, event_id, result_id)
);

CREATE INDEX IF NOT EXISTS idx_series_result_disqualifications_event
ON series_result_disqualifications(series, distance, event_id);
