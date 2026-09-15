-- Stage 8D: Existing Academy and License assets

INSERT OR IGNORE INTO objects (
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
  'NWANA-ACADEMY-INTRO',
  'ACADEMY-COURSE',
  'Introduction to Nordic Walking',
  'manual',
  'generic',
  'academy-introduction',
  'active',
  '1.0',
  'NWANA-ACADEMY-CORE',
  'ACADEMY',
  'ACQUISITION',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-ACADEMY-BEGINNER',
  'ACADEMY-COURSE',
  'Beginner Certification',
  'manual',
  'generic',
  'academy-beginner-certification',
  'active',
  '1.0',
  'NWANA-ACADEMY-CORE',
  'ACADEMY',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-PATHWAY-INSTRUCTOR',
  'PROFESSIONAL-PATHWAY',
  'Instructor Pathway',
  'manual',
  'generic',
  'pathway-instructor',
  'active',
  '1.0',
  'NWANA-PROFESSIONAL-PATHWAYS',
  'PROFESSIONAL_DEVELOPMENT',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-PATHWAY-COACH',
  'PROFESSIONAL-PATHWAY',
  'Coach Pathway',
  'manual',
  'generic',
  'pathway-coach',
  'active',
  '1.0',
  'NWANA-PROFESSIONAL-PATHWAYS',
  'PROFESSIONAL_DEVELOPMENT',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-PATHWAY-JUDGE',
  'PROFESSIONAL-PATHWAY',
  'Competition Judge Pathway',
  'manual',
  'generic',
  'pathway-judge',
  'active',
  '1.0',
  'NWANA-PROFESSIONAL-PATHWAYS',
  'PROFESSIONAL_DEVELOPMENT',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-PATHWAY-RACE-DIRECTOR',
  'PROFESSIONAL-PATHWAY',
  'Race Director Pathway',
  'manual',
  'generic',
  'pathway-race-director',
  'active',
  '1.0',
  'NWANA-PROFESSIONAL-PATHWAYS',
  'PROFESSIONAL_DEVELOPMENT',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-PATHWAY-TECHNICAL-OFFICIAL',
  'PROFESSIONAL-PATHWAY',
  'Competition Technical Official Pathway',
  'manual',
  'generic',
  'pathway-technical-official',
  'active',
  '1.0',
  'NWANA-PROFESSIONAL-PATHWAYS',
  'PROFESSIONAL_DEVELOPMENT',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true}'
),

(
  'NWANA-LICENSE-PROFESSIONAL',
  'LICENSE-PRODUCT',
  'NWANA Professional License',
  'manual',
  'generic',
  'license-professional',
  'active',
  '1.0',
  'NWANA-LICENSE-SYSTEM',
  'LICENSING',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true,"renewable":true}'
),

(
  'NWANA-LICENSE-ATHLETE',
  'LICENSE-PRODUCT',
  'NWANA Athlete License',
  'manual',
  'generic',
  'license-athlete',
  'active',
  '1.0',
  'NWANA-LICENSE-SYSTEM',
  'LICENSING',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true,"renewable":true}'
),

(
  'NWANA-LICENSE-GROUP-INDIVIDUAL',
  'LICENSE-PRODUCT',
  'NW Groups Individual License',
  'manual',
  'generic',
  'license-group-individual',
  'active',
  '1.0',
  'NWANA-LICENSE-SYSTEM',
  'LICENSING',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true,"renewable":true}'
),

(
  'NWANA-LICENSE-RECOGNIZED-GROUP',
  'LICENSE-PRODUCT',
  'RECOGNIZED NW Group License',
  'manual',
  'generic',
  'license-recognized-group',
  'active',
  '1.0',
  'NWANA-LICENSE-SYSTEM',
  'LICENSING',
  'SELLABLE',
  '{"registry_seed":"stage8","existing_asset":true,"renewable":true}'
);
