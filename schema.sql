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

CREATE INDEX IF NOT EXISTS idx_objects_source
ON objects(source, source_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_objects_source_unique
ON objects(source, source_type, source_id)
WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_versions_object
ON object_versions(object_id);

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