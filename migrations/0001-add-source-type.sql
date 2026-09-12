ALTER TABLE objects
ADD COLUMN source_type TEXT NOT NULL DEFAULT 'generic';

UPDATE objects
SET source_type = 'race'
WHERE source = 'runsignup';

DROP INDEX IF EXISTS idx_objects_source_unique;

CREATE UNIQUE INDEX idx_objects_source_unique
ON objects(source, source_type, source_id)
WHERE source_id IS NOT NULL;