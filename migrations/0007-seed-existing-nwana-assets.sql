-- Stage 8C: Register existing NWANA assets not yet represented in external adapters

INSERT OR IGNORE INTO objects (
  object_id,
  object_type,
  title,
  source,
  source_type,
  source_id,
  status,
  current_version,
  program_family,
  commercial_role,
  metadata
) VALUES

(
  'NWANA-ACADEMY-CORE',
  'ACADEMY',
  'NWANA Academy',
  'manual',
  'generic',
  'academy.nwaofna.org',
  'active',
  '1.0',
  'ACADEMY',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-LICENSE-SYSTEM',
  'LICENSE-SYSTEM',
  'NWANA License System',
  'manual',
  'generic',
  'nwana-license-system',
  'active',
  '1.0',
  'LICENSING',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-NW-GROUPS',
  'GROUP-NETWORK',
  'NWANA NW Groups',
  'manual',
  'generic',
  'nwana-nw-groups',
  'active',
  '1.0',
  'NW_GROUPS',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-CHALLENGES',
  'CHALLENGE-PROGRAM',
  'NWANA Challenges',
  'manual',
  'generic',
  'nwana-challenges',
  'active',
  '1.0',
  'CHALLENGES',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-EVENTS',
  'EVENT-PROGRAM',
  'NWANA Events',
  'manual',
  'generic',
  'nwana-events',
  'active',
  '1.0',
  'NWANA_EVENTS',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
);

INSERT OR IGNORE INTO objects (
  object_id,
  object_type,
  title,
  source,
  source_type,
  source_id,
  status,
  current_version,
  program_family,
  commercial_role,
  metadata
) VALUES

(
  'NWANA-PROFESSIONAL-PATHWAYS',
  'PROFESSIONAL-PATHWAYS',
  'NWANA Professional Pathways',
  'manual',
  'generic',
  'nwana-professional-pathways',
  'active',
  '1.0',
  'PROFESSIONAL_DEVELOPMENT',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-MEDIA-PRESS',
  'MEDIA-PRESS',
  'NWANA Media and Press',
  'manual',
  'generic',
  'nwana-media-press',
  'active',
  '1.0',
  'MEDIA_PRESS',
  'DISTRIBUTION',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-VOLUNTEERS',
  'VOLUNTEER-PROGRAM',
  'NWANA Volunteer Program',
  'manual',
  'generic',
  'nwana-volunteers',
  'active',
  '1.0',
  'VOLUNTEERS',
  'ACQUISITION',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-ORGANIZER-PATHWAY',
  'ORGANIZER-PATHWAY',
  'NWANA Organizer and Sanctioning Pathway',
  'manual',
  'generic',
  'nwana-organizer-pathway',
  'active',
  '1.0',
  'ORGANIZER_DEVELOPMENT',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-PUBLIC-TRUST',
  'PUBLIC-TRUST',
  'NWANA Safe Sport and Anti-Doping Framework',
  'manual',
  'generic',
  'nwana-public-trust',
  'active',
  '1.0',
  'PUBLIC_TRUST',
  'SUPPORT',
  '{"registry_seed":"stage8","existing_asset":true}'
);
