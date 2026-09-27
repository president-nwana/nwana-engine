-- Migration 0042: resumable chunked distance rebuild progress.
-- The full-distance Series 2026 rebuild cannot fit in one Worker invocation:
-- the Free plan caps external subrequests at 50/invocation (measured
-- 2026-09-27: 3 events ≈ the whole budget). The rebuild therefore runs in
-- chunks; this table tracks the cursor so chunks resume and the legacy
-- scoring-type cleanup runs only after the FINAL chunk of a fully clean
-- rebuild. ADR-0041.
CREATE TABLE IF NOT EXISTS series_rebuild_progress (
  series     TEXT NOT NULL,
  distance   TEXT NOT NULL,
  cursor     INTEGER NOT NULL DEFAULT 0,
  errors     INTEGER NOT NULL DEFAULT 0,
  status     TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  updated_at TEXT NOT NULL,
  PRIMARY KEY (series, distance)
);
