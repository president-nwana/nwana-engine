-- Per-destination delivery ledger for idempotent Series 2026 result publication.
-- No data is sent by this migration.

CREATE TABLE IF NOT EXISTS result_publication_deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  publication_key TEXT NOT NULL,
  destination TEXT NOT NULL,
  status TEXT NOT NULL,
  external_id TEXT,
  last_error TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (publication_key) REFERENCES result_publication_history(publication_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_result_publication_deliveries_unique
ON result_publication_deliveries(publication_key, destination);

CREATE INDEX IF NOT EXISTS idx_result_publication_deliveries_status
ON result_publication_deliveries(status);
