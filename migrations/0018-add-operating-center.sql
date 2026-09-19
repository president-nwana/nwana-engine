-- Owner-facing operating center foundation.
-- No timers, polling, external delivery, or paid service is introduced here.

CREATE TABLE IF NOT EXISTS initiatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  initiative_id TEXT NOT NULL UNIQUE,
  input_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  desired_result TEXT,
  status TEXT NOT NULL DEFAULT 'NEW',
  submitted_by TEXT NOT NULL,
  source_filename TEXT,
  analysis TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_initiatives_status_created
ON initiatives(status, created_at);

CREATE TABLE IF NOT EXISTS board_meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  meeting_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  scheduled_for TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  opened_at TEXT,
  closed_at TEXT,
  minutes TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_board_meetings_status_schedule
ON board_meetings(status, scheduled_for);

CREATE TABLE IF NOT EXISTS board_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL UNIQUE,
  meeting_id TEXT,
  initiative_id TEXT,
  submission_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  requested_outcome TEXT,
  submitted_by TEXT NOT NULL,
  requested_meeting_date TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES board_meetings(meeting_id),
  FOREIGN KEY (initiative_id) REFERENCES initiatives(initiative_id)
);

CREATE INDEX IF NOT EXISTS idx_board_submissions_status_date
ON board_submissions(status, requested_meeting_date, created_at);

CREATE TABLE IF NOT EXISTS board_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id TEXT NOT NULL UNIQUE,
  meeting_id TEXT NOT NULL,
  submission_id TEXT,
  decision_text TEXT NOT NULL,
  outcome TEXT NOT NULL,
  vote_record TEXT,
  responsible_person TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'CONFIRMED',
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (meeting_id) REFERENCES board_meetings(meeting_id),
  FOREIGN KEY (submission_id) REFERENCES board_submissions(submission_id)
);

CREATE INDEX IF NOT EXISTS idx_board_decisions_meeting_status
ON board_decisions(meeting_id, status);

CREATE TABLE IF NOT EXISTS decision_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_request_id TEXT NOT NULL UNIQUE,
  initiative_id TEXT,
  work_item_id TEXT,
  decision_scope TEXT NOT NULL,
  question TEXT NOT NULL,
  options TEXT,
  evidence TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING',
  requested_from TEXT NOT NULL DEFAULT 'OWNER',
  resolved_by TEXT,
  resolved_at TEXT,
  resolution TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (initiative_id) REFERENCES initiatives(initiative_id)
);

CREATE INDEX IF NOT EXISTS idx_decision_requests_status_scope
ON decision_requests(status, decision_scope);

CREATE TABLE IF NOT EXISTS work_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  work_item_id TEXT NOT NULL UNIQUE,
  initiative_id TEXT,
  board_decision_id TEXT,
  object_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  work_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'READY',
  execution_mode TEXT NOT NULL DEFAULT 'PLAN_ONLY',
  assigned_to TEXT,
  due_date TEXT,
  blocker TEXT,
  outcome TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (initiative_id) REFERENCES initiatives(initiative_id),
  FOREIGN KEY (board_decision_id) REFERENCES board_decisions(decision_id),
  FOREIGN KEY (object_id) REFERENCES objects(object_id)
);

CREATE INDEX IF NOT EXISTS idx_work_items_status_due
ON work_items(status, due_date);

CREATE INDEX IF NOT EXISTS idx_work_items_initiative
ON work_items(initiative_id);
