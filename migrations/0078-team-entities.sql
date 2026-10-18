-- 0078: team_entities cache for the Teams stats indicator (all four team systems).
-- Sources of truth are all RunSignup (race 216323); this table is the read cache.
-- system: 'challenge' | 'relay' | 'fundraising' | 'umbrella'
CREATE TABLE IF NOT EXISTS team_entities (
  system TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  name TEXT NOT NULL,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (system, entity_id)
);
