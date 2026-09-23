-- Migration 0028: board protocol completion and member file uploads.
--
-- Albert's directive 2026-09-22:
--   1. By every Sunday 2:00 PM New York time the machine forms the meeting
--      protocol from all pending submissions (protocol_formed_at marks the
--      moment the protocol was assembled by the Sunday formation job).
--   2. After the meeting the machine processes the protocol and starts the
--      work it is authorized and capable of doing. board_decisions gets
--      machine_action (chosen when the decision is recorded: what the
--      machine may start itself) and machine_result (what it actually did).
--      Sends, money, and external actions stay human-confirmed.
--   3. Board members upload files (contacts or any material); the machine
--      routes each file: contacts to RunSignup lists, tasks into tracked
--      work, discussion material onto the meeting agenda, news material
--      into media drafts. board_uploads records every upload and its
--      routing outcome.

ALTER TABLE board_meetings ADD COLUMN protocol_formed_at TEXT;
ALTER TABLE board_decisions ADD COLUMN machine_action TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE board_decisions ADD COLUMN machine_result TEXT;

CREATE TABLE IF NOT EXISTS board_uploads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  upload_id TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  mime TEXT,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  uploaded_by TEXT,
  routing TEXT NOT NULL DEFAULT 'UNCLASSIFIED',
  routing_status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (routing_status IN ('PENDING', 'ROUTED', 'NEEDS_OWNER')),
  routed_detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_board_uploads_routing
ON board_uploads(routing_status, created_at);
