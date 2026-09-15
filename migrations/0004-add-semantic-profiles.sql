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
