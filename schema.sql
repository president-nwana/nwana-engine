CREATE TABLE IF NOT EXISTS objects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL UNIQUE,
  object_type TEXT NOT NULL,
  title TEXT,
  source TEXT,
  source_type TEXT NOT NULL DEFAULT 'generic',
  source_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  current_version TEXT NOT NULL DEFAULT '1.0',
  parent_object_id TEXT,
  season INTEGER,
  program_family TEXT,
  commercial_role TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS object_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version_id TEXT NOT NULL UNIQUE,
  object_id TEXT NOT NULL,
  version_number TEXT NOT NULL,
  content_snapshot TEXT,
  hash TEXT,
  created_by TEXT,
  previous_version_id TEXT,
  reason_for_change TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (object_id) REFERENCES objects(object_id)
);

CREATE TABLE IF NOT EXISTS relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  relationship_id TEXT NOT NULL UNIQUE,
  subject_object_id TEXT NOT NULL,
  relationship_type TEXT NOT NULL,
  target_object_id TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trust_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trust_id TEXT NOT NULL UNIQUE,
  object_id TEXT NOT NULL,
  version_id TEXT,
  hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  hash TEXT,
  timestamp_request TEXT,
  timestamp_verified INTEGER NOT NULL DEFAULT 0,
  proof_location TEXT,
  blockchain_anchor TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audit_id TEXT NOT NULL UNIQUE,
  object_id TEXT,
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  status TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS system_counters (
  object_type TEXT PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_objects_type
ON objects(object_type);

CREATE INDEX IF NOT EXISTS idx_objects_season
ON objects(season);

CREATE INDEX IF NOT EXISTS idx_objects_program_family
ON objects(program_family);

CREATE INDEX IF NOT EXISTS idx_objects_commercial_role
ON objects(commercial_role);

CREATE INDEX IF NOT EXISTS idx_objects_source
ON objects(source, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_source_unique
ON objects(source, source_type, source_id)
WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_versions_object
ON object_versions(object_id);


CREATE TABLE IF NOT EXISTS object_capabilities (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL,
  capability_type TEXT NOT NULL,
  available INTEGER NOT NULL DEFAULT 0,
  configured INTEGER NOT NULL DEFAULT 0,
  read_state TEXT NOT NULL DEFAULT 'unknown',
  write_state TEXT NOT NULL DEFAULT 'unknown',
  permission_state TEXT NOT NULL DEFAULT 'unknown',
  distribution_eligible INTEGER NOT NULL DEFAULT 0,
  source_platform TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (object_id) REFERENCES objects(object_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_object_capabilities_unique
ON object_capabilities(object_id, capability_type);

CREATE INDEX IF NOT EXISTS idx_object_capabilities_type
ON object_capabilities(capability_type);

CREATE INDEX IF NOT EXISTS idx_object_capabilities_object
ON object_capabilities(object_id);
CREATE INDEX IF NOT EXISTS idx_relationships_subject
ON relationships(subject_object_id);

CREATE INDEX IF NOT EXISTS idx_relationships_target
ON relationships(target_object_id);

CREATE INDEX IF NOT EXISTS idx_trust_object
ON trust_records(object_id);

CREATE INDEX IF NOT EXISTS idx_audit_object
ON audit_events(object_id);


CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL UNIQUE,
  job_type TEXT NOT NULL,
  module TEXT NOT NULL,
  object_id TEXT,
  version_id TEXT,
  source_event_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  priority INTEGER NOT NULL DEFAULT 100,
  payload TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 10,
  next_run_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_jobs_due
ON jobs(status, next_run_at, priority, id);

CREATE INDEX IF NOT EXISTS idx_jobs_type
ON jobs(job_type);

CREATE INDEX IF NOT EXISTS idx_jobs_object
ON jobs(object_id);

CREATE INDEX IF NOT EXISTS idx_jobs_source_event
ON jobs(source_event_id);
CREATE TABLE IF NOT EXISTS timestamp_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL UNIQUE,
  trust_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  version_id TEXT,
  hash TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'opentimestamps',
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  requested_at TEXT,
  completed_at TEXT,
  next_run_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_timestamp_jobs_status
ON timestamp_jobs(status);

CREATE INDEX IF NOT EXISTS idx_timestamp_jobs_due
ON timestamp_jobs(status, next_run_at);

CREATE INDEX IF NOT EXISTS idx_timestamp_jobs_object
ON timestamp_jobs(object_id);

CREATE INDEX IF NOT EXISTS idx_timestamp_jobs_trust
ON timestamp_jobs(trust_id);

CREATE TABLE IF NOT EXISTS blockchain_anchors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anchor_id TEXT NOT NULL UNIQUE,
  trust_id TEXT NOT NULL,
  job_id TEXT NOT NULL,
  object_id TEXT NOT NULL,
  version_id TEXT,
  blockchain TEXT NOT NULL DEFAULT 'bitcoin',
  status TEXT NOT NULL DEFAULT 'pending',
  block_height INTEGER,
  block_hash TEXT,
  transaction_id TEXT,
  attestation_time TEXT,
  verified_at TEXT,
  confirmations INTEGER NOT NULL DEFAULT 0,
  proof_data TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_trust
ON blockchain_anchors(trust_id);

CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_job
ON blockchain_anchors(job_id);

CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_object
ON blockchain_anchors(object_id);

CREATE INDEX IF NOT EXISTS idx_blockchain_anchors_status
ON blockchain_anchors(status);

-- Universal proof / anchoring records.
-- Provider-specific blockchain details belong in provider_metadata,
-- not in Registry Core columns.
CREATE TABLE IF NOT EXISTS proof_anchors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anchor_id TEXT NOT NULL UNIQUE,
  trust_id TEXT NOT NULL,
  job_id TEXT,
  object_id TEXT NOT NULL,
  version_id TEXT,
  provider TEXT NOT NULL,
  network TEXT,
  anchor_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  external_anchor_id TEXT,
  anchored_at TEXT,
  verified_at TEXT,
  proof_data TEXT,
  provider_metadata TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_proof_anchors_trust
ON proof_anchors(trust_id);

CREATE INDEX IF NOT EXISTS idx_proof_anchors_job
ON proof_anchors(job_id);

CREATE INDEX IF NOT EXISTS idx_proof_anchors_object
ON proof_anchors(object_id);

CREATE INDEX IF NOT EXISTS idx_proof_anchors_provider
ON proof_anchors(provider, network);

CREATE INDEX IF NOT EXISTS idx_proof_anchors_status
ON proof_anchors(status);

CREATE UNIQUE INDEX IF NOT EXISTS idx_relationships_unique ON relationships(subject_object_id, relationship_type, target_object_id);
-- Explicit semantic meaning for externally sourced objects.
-- Source adapters describe what exists externally.
-- Semantic profiles describe what that object means to NWANA.
-- These values override discovery/title-based semantic inference.
CREATE TABLE IF NOT EXISTS semantic_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  object_type TEXT,
  program_family TEXT,
  commercial_role TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_semantic_profiles_source_unique
ON semantic_profiles(source, source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_semantic_profiles_program_family
ON semantic_profiles(program_family);

CREATE INDEX IF NOT EXISTS idx_semantic_profiles_object_type
ON semantic_profiles(object_type);


-- Stage 8: Rules Engine

-- Stage 8A: Rules Engine Core
-- Object -> Rule -> Audience -> Action -> Job

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,

  match_object_type TEXT,
  match_program_family TEXT,
  match_commercial_role TEXT,
  match_capability_type TEXT,
  match_status TEXT,

  conditions TEXT,
  metadata TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rules_enabled_priority
ON rules(enabled, priority);

CREATE INDEX IF NOT EXISTS idx_rules_object_type
ON rules(match_object_type);

CREATE INDEX IF NOT EXISTS idx_rules_program_family
ON rules(match_program_family);

CREATE INDEX IF NOT EXISTS idx_rules_commercial_role
ON rules(match_commercial_role);


CREATE TABLE IF NOT EXISTS rule_audiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audience_id TEXT NOT NULL UNIQUE,
  rule_id TEXT NOT NULL,
  audience_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (rule_id) REFERENCES rules(rule_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_audiences_unique
ON rule_audiences(rule_id, audience_type);

CREATE INDEX IF NOT EXISTS idx_rule_audiences_rule
ON rule_audiences(rule_id);

CREATE INDEX IF NOT EXISTS idx_rule_audiences_type
ON rule_audiences(audience_type);


CREATE TABLE IF NOT EXISTS rule_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id TEXT NOT NULL UNIQUE,
  rule_id TEXT NOT NULL,
  audience_id TEXT,

  action_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  destination TEXT,

  execution_mode TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,

  metadata TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (rule_id) REFERENCES rules(rule_id),
  FOREIGN KEY (audience_id) REFERENCES rule_audiences(audience_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_actions_unique
ON rule_actions(
  rule_id,
  audience_id,
  action_type,
  channel,
  destination
);

CREATE INDEX IF NOT EXISTS idx_rule_actions_rule
ON rule_actions(rule_id);

CREATE INDEX IF NOT EXISTS idx_rule_actions_audience
ON rule_actions(audience_id);

CREATE INDEX IF NOT EXISTS idx_rule_actions_channel
ON rule_actions(channel);

CREATE INDEX IF NOT EXISTS idx_rule_actions_execution_mode
ON rule_actions(execution_mode);


-- Stage 8: Processing Profiles

-- Stage 8: universal processing profiles.
-- Processing profiles define how an NWANA object is processed.
-- They are separate from:
--   semantic_profiles = what an object means to NWANA
--   object_capabilities = what an object can technically do
--   distribution rules = who should receive an object and what outreach action to take
--
-- Examples:
--   Series 2026 result processing
--   Series 2027 result processing
--   distance-specific result thresholds
--   challenge-specific level/progress logic
--
-- Business logic belongs in configuration/metadata so future seasons and
-- challenge types do not require Registry schema changes.

CREATE TABLE IF NOT EXISTS processing_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  domain TEXT NOT NULL,
  profile_type TEXT NOT NULL,
  program_family TEXT,
  season INTEGER,
  status TEXT NOT NULL DEFAULT 'active',
  configuration TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_processing_profiles_domain
ON processing_profiles(domain);

CREATE INDEX IF NOT EXISTS idx_processing_profiles_type
ON processing_profiles(profile_type);

CREATE INDEX IF NOT EXISTS idx_processing_profiles_program_family
ON processing_profiles(program_family);

CREATE INDEX IF NOT EXISTS idx_processing_profiles_season
ON processing_profiles(season);

CREATE TABLE IF NOT EXISTS object_processing_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  profile_role TEXT NOT NULL DEFAULT 'PRIMARY',
  priority INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (object_id) REFERENCES objects(object_id),
  FOREIGN KEY (profile_id) REFERENCES processing_profiles(profile_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_object_processing_profiles_unique
ON object_processing_profiles(object_id, profile_id, profile_role);

CREATE INDEX IF NOT EXISTS idx_object_processing_profiles_object
ON object_processing_profiles(object_id);

CREATE INDEX IF NOT EXISTS idx_object_processing_profiles_profile
ON object_processing_profiles(profile_id);

CREATE INDEX IF NOT EXISTS idx_object_processing_profiles_enabled
ON object_processing_profiles(enabled);


-- Idempotency and history for result publication ownership.
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


-- Per-destination idempotency for result publication.

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


-- Encrypted long-lived OAuth credentials for owner-connected integrations.
CREATE TABLE IF NOT EXISTS integration_credentials (
  provider TEXT PRIMARY KEY,
  encrypted_refresh_token TEXT NOT NULL,
  iv TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- Owner-facing operating center foundation.

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
