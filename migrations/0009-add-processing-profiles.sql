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
