ALTER TABLE objects ADD COLUMN season INTEGER;
ALTER TABLE objects ADD COLUMN program_family TEXT;
ALTER TABLE objects ADD COLUMN commercial_role TEXT;

CREATE INDEX IF NOT EXISTS idx_objects_season
ON objects(season);

CREATE INDEX IF NOT EXISTS idx_objects_program_family
ON objects(program_family);

CREATE INDEX IF NOT EXISTS idx_objects_commercial_role
ON objects(commercial_role);

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