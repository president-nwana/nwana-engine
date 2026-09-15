-- Stage 8: existing NW Groups products.

INSERT INTO objects (
  object_id,
  object_type,
  title,
  source,
  source_type,
  source_id,
  status,
  current_version,
  parent_object_id,
  program_family,
  commercial_role,
  metadata
) VALUES

(
  'NWANA-GROUP-CREATION',
  'GROUP-PRODUCT',
  'Create a NW Group',
  'manual',
  'generic',
  'group-creation',
  'active',
  '1.0',
  'NWANA-NW-GROUPS',
  'NW_GROUPS',
  'ACQUISITION',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-GROUP-RECOGNIZED',
  'GROUP-PRODUCT',
  'RECOGNIZED NW Group',
  'manual',
  'generic',
  'group-recognized',
  'active',
  '1.0',
  'NWANA-NW-GROUPS',
  'NW_GROUPS',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true,"renewable":true}'
)

ON CONFLICT(object_id) DO UPDATE SET
  object_type=excluded.object_type,
  title=excluded.title,
  source=excluded.source,
  source_type=excluded.source_type,
  source_id=excluded.source_id,
  status=excluded.status,
  current_version=excluded.current_version,
  parent_object_id=excluded.parent_object_id,
  program_family=excluded.program_family,
  commercial_role=excluded.commercial_role,
  metadata=excluded.metadata,
  updated_at=CURRENT_TIMESTAMP;
