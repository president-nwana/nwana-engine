-- Record finalized result sets that predate NWANA Engine publication ownership.
-- This creates an idempotent publication ledger; it does not publish or call Meta.

CREATE TABLE IF NOT EXISTS result_publication_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_key TEXT NOT NULL UNIQUE,
  series TEXT NOT NULL,
  status TEXT NOT NULL,
  race_id INTEGER NOT NULL,
  event_id INTEGER NOT NULL,
  result_set_id INTEGER NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_result_publication_history_series_status
ON result_publication_history(series, status);

CREATE INDEX IF NOT EXISTS idx_result_publication_history_source
ON result_publication_history(race_id, event_id, result_set_id);
