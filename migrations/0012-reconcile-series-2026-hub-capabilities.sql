-- Reconcile Series 2026 hub capability state with verified platform reality.
-- RunSignup provides registration as a platform capability, but NWANA hides it
-- and does not use this public hub as a registration or results destination.

INSERT INTO object_capabilities (
  object_id, capability_type, available, configured,
  read_state, write_state, permission_state,
  distribution_eligible, source_platform, metadata
)
SELECT
  'NWANA-RACE-000001',
  'PUBLIC_WEBSITE',
  1, 1,
  'available', 'permission-dependent', 'pending',
  1, 'runsignup',
  '{"evidence":"verified-public-hub"}'
WHERE EXISTS (
  SELECT 1 FROM objects WHERE object_id = 'NWANA-RACE-000001'
)
ON CONFLICT(object_id, capability_type) DO UPDATE SET
  available=excluded.available,
  configured=excluded.configured,
  read_state=excluded.read_state,
  write_state=excluded.write_state,
  permission_state=excluded.permission_state,
  distribution_eligible=excluded.distribution_eligible,
  source_platform=excluded.source_platform,
  metadata=excluded.metadata,
  updated_at=CURRENT_TIMESTAMP;

UPDATE object_capabilities
SET available = 1,
    configured = 0,
    read_state = 'available',
    write_state = 'permission-dependent',
    permission_state = 'pending',
    distribution_eligible = 0,
    source_platform = 'runsignup',
    metadata = '{"evidence":"platform-capability","public_visibility":"hidden","operational_use":false}',
    updated_at = CURRENT_TIMESTAMP
WHERE object_id = 'NWANA-RACE-000001'
  AND capability_type = 'REGISTRATION';

INSERT INTO object_capabilities (
  object_id, capability_type, available, configured,
  read_state, write_state, permission_state,
  distribution_eligible, source_platform, metadata
)
SELECT
  'NWANA-RACE-000001',
  'RESULTS',
  0, 0,
  'unavailable', 'unavailable', 'not_applicable',
  0, 'runsignup',
  '{"evidence":"verified-not-results-container"}'
WHERE EXISTS (
  SELECT 1 FROM objects WHERE object_id = 'NWANA-RACE-000001'
)
ON CONFLICT(object_id, capability_type) DO UPDATE SET
  available=excluded.available,
  configured=excluded.configured,
  read_state=excluded.read_state,
  write_state=excluded.write_state,
  permission_state=excluded.permission_state,
  distribution_eligible=excluded.distribution_eligible,
  source_platform=excluded.source_platform,
  metadata=excluded.metadata,
  updated_at=CURRENT_TIMESTAMP;

UPDATE object_capabilities
SET configured = 0,
    read_state = 'unknown',
    write_state = 'unknown',
    permission_state = 'unknown',
    distribution_eligible = 1,
    metadata = '{"evidence":"platform-capability","configuration_detection":"not-yet-connected"}',
    updated_at = CURRENT_TIMESTAMP
WHERE object_id = 'NWANA-RACE-000001'
  AND capability_type = 'SPONSORSHIP';
