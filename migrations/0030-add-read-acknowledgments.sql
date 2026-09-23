-- Migration 0030: owner read acknowledgments for the activity feed.
--
-- The Board screen shows "what requires reading". The owner explicitly
-- marks items as read; the acknowledgment is durable in D1 and owner-wide
-- (there is no verified per-member identity, so per-member read state is
-- not claimed).
--
-- An acknowledgment records the activity item ID (as produced by
-- getActivityFeed: e.g. "req-...", "upload-...", "audit-..."), when the
-- owner marked it read, and an optional note.

CREATE TABLE IF NOT EXISTS read_acknowledgments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL UNIQUE,
  acknowledged_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  note TEXT
);

CREATE INDEX IF NOT EXISTS idx_read_acknowledgments_at
ON read_acknowledgments(acknowledged_at DESC);
