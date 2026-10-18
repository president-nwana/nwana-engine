-- 0097: Phase 1B — Territory data foundation and canonical NW Groups model.
-- Owner-approved unified TZ (edition 7, 2026-10-17), sections 2, 3, 10.1, 12, 13 (Phase 1B).
-- ADR-0050. PREPARED ONLY — DO NOT APPLY TO PRODUCTION D1 until the parent
-- agent reviews this package (workspace/research/phase1b-territory-foundation/).
--
-- What this migration does, in order:
--   1. Creates the read-only superseded archive and copies EVERY live row of
--      nw_groups (incl. recognized_date / payment_account_state values) and
--      the old-model seed objects of migrations 0008/0011 into it BEFORE any
--      destructive change. Archive tables have no foreign keys into live
--      tables and no live code path may read them for status/creation/public
--      output (TZ section 12, acceptance criterion 1: technical isolation).
--   2. Creates territories (CONTINENTAL root -> NATIONAL -> STATE -> COUNTY
--      -> CITY / LOCAL_COMMUNITY), place<->county links, the role-template
--      catalog and role instances (TZ 10.1), persons, applications and
--      programs (TZ section 3).
--   3. Rebuilds nw_groups on the new vocabulary: territory_id NOT NULL,
--      status FORMING/ACTIVE only, group_number within territory, is_default
--      flag. Columns recognized_date and payment_account_state are REMOVED
--      from the live table (their values survive only in the archive).
--      developing -> FORMING; recognized has no successor (TZ section 12).
--   4. Seeds the CONTINENTAL (NWANA center) and NATIONAL (USA) territories
--      and the role-template catalog.
--   5. Handles the two trial rows nwg-miami / nwg-hallandale-beach per
--      ADR-0050 point 8: archived in step 1, then NOT carried into the new
--      live table. Miami and Hallandale Beach re-enter the live registry
--      only as ordinary default groups created by the Phase 1B load
--      (group_ids nwg-1245000 / nwg-1228452), like every other US city.
--   6. Adds nullable territory_id to outreach_prospects and money_events as
--      the Phase 2 backfill seam. TZ section 3 rule "every money record has
--      a territory, no exceptions" becomes NOT NULL only after the Phase 2
--      backfill; this migration deliberately does not fake that enforcement.
--
-- SQLite/D1 notes: D1 follows SQLite semantics. A CHECK-constraint change on
-- an existing table requires a table rebuild (create new, copy, drop,
-- rename). Foreign keys referencing nw_groups(group_id) exist in
-- nw_group_instructors / nw_group_sponsors (both empty in production at
-- inspection, 2026-10-17); the rebuild keeps group_id as PRIMARY KEY with
-- the same name and type so those references remain valid. Run the whole
-- file as one D1 migration batch; verify with the queries in
-- docs/LOAD_PLAN_AND_DRY_COUNTS.md before any load.

-- ---------------------------------------------------------------------------
-- 1. Superseded archive (read-only, technically isolated)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS archive_superseded_records (
  archive_id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_table TEXT NOT NULL,          -- e.g. 'nw_groups', 'objects'
  source_key TEXT NOT NULL,            -- primary key of the archived row
  payload_json TEXT NOT NULL,          -- full row as JSON, verbatim
  superseded_reason TEXT NOT NULL,     -- TZ section 12 fate for this element
  archived_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (source_table, source_key)
);

-- Full-row snapshot of the live nw_groups table as it exists pre-migration.
-- json_object enumerates the 0095 columns explicitly so the archive stays
-- complete even if this file is re-run after a partial attempt.
INSERT OR IGNORE INTO archive_superseded_records
  (source_table, source_key, payload_json, superseded_reason)
SELECT
  'nw_groups',
  group_id,
  json_object(
    'group_id', group_id, 'runsignup_club_id', runsignup_club_id,
    'name', name, 'slug', slug, 'category_key', category_key,
    'status', status, 'city', city, 'state', state, 'zip', zip,
    'country', country, 'latitude', latitude, 'longitude', longitude,
    'description', description, 'public_url', public_url,
    'runsignup_url', runsignup_url, 'donate_url', donate_url,
    'fundraising_url', fundraising_url, 'leader_name', leader_name,
    'leader_role', leader_role, 'contact_email', contact_email,
    'activities_json', activities_json, 'programs_json', programs_json,
    'events_json', events_json, 'news_json', news_json,
    'challenge_participation', challenge_participation,
    'series_participation', series_participation,
    'payment_account_state', payment_account_state,
    'active', active, 'created_at', created_at,
    'recognized_date', recognized_date
  ),
  'Old decentralized model superseded by owner-approved TZ ed.7 (2026-10-17), section 12; ADR-0050. Trial rows per ADR-0050 point 8.'
FROM nw_groups;

-- Old-model seed objects (migrations 0008/0011): the group-creation product,
-- the RECOGNIZED group product/license objects. Other 0008 objects (Academy
-- courses, pathways, athlete/professional licenses) are NOT old-group-model
-- seeds and are not archived or touched here.
INSERT OR IGNORE INTO archive_superseded_records
  (source_table, source_key, payload_json, superseded_reason)
SELECT
  'objects',
  object_id,
  json_object(
    'object_id', object_id, 'object_type', object_type, 'title', title,
    'source', source, 'source_type', source_type, 'source_id', source_id,
    'status', status, 'current_version', current_version,
    'parent_object_id', parent_object_id, 'season', season,
    'program_family', program_family, 'commercial_role', commercial_role,
    'metadata', metadata, 'created_at', created_at, 'updated_at', updated_at
  ),
  'Seed object of the superseded decentralized group model (TZ section 12: seed objects of migrations 0008/0011 are retired or redefined; none may let a future developer restore the old model).'
FROM objects
WHERE object_id IN (
  'NWANA-GROUP-CREATION',
  'NWANA-GROUP-RECOGNIZED',
  'NWANA-LICENSE-RECOGNIZED-GROUP',
  'NWANA-LICENSE-GROUP-INDIVIDUAL'
);

-- Retire those seeds from the live registry: status change only, rows stay
-- for referential history, and the archive copy above is the audit record.
-- 'superseded_archived' is not read by any live rule (TZ acceptance 1).
UPDATE objects
SET status = 'superseded_archived', updated_at = CURRENT_TIMESTAMP
WHERE object_id IN (
  'NWANA-GROUP-CREATION',
  'NWANA-GROUP-RECOGNIZED',
  'NWANA-LICENSE-RECOGNIZED-GROUP',
  'NWANA-LICENSE-GROUP-INDIVIDUAL'
) AND status != 'superseded_archived';

-- ---------------------------------------------------------------------------
-- 2. Territories
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS territories (
  territory_id TEXT PRIMARY KEY,       -- stable readable id, see load plan
  type TEXT NOT NULL CHECK (type IN
    ('CONTINENTAL','NATIONAL','STATE','COUNTY','CITY','LOCAL_COMMUNITY')),
  parent_territory_id TEXT REFERENCES territories(territory_id),
  name TEXT NOT NULL,                  -- official name (display form)
  official_name TEXT,                  -- verbatim source name, suffix incl.
  -- Official codes (US Census Bureau): GEOID is state(2)+county(3) for
  -- counties, state(2)+place(5) for places; ANSI code where published.
  geoid TEXT,
  ansi_code TEXT,
  state_fips TEXT,                     -- 2-digit, for STATE and below
  county_fips TEXT,                    -- 3-digit within state, COUNTY and below
  place_fips TEXT,                     -- 5-digit within state, CITY/LOCAL only
  usps TEXT,                           -- state postal abbreviation
  latitude REAL,                       -- Census internal point
  longitude REAL,
  -- CITY vs LOCAL_COMMUNITY derivation (Gazetteer FUNCSTAT): 'A' active
  -- incorporated place -> CITY; CDP and other statistical/inactive places
  -- -> LOCAL_COMMUNITY. place_kind keeps the source distinction auditable.
  place_kind TEXT CHECK (place_kind IN
    ('incorporated','cdp','consolidated_balance','inactive','district_place'))
    ,
  -- How this place's PRIMARY county was determined (CITY/LOCAL only):
  -- 'census_codes_file' | 'internal_point_pip' | 'single_county_state' |
  -- 'manual_override'. Full county list lives in territory_place_counties.
  primary_county_method TEXT,
  public_status TEXT NOT NULL DEFAULT 'listed'
    CHECK (public_status IN ('listed','unlisted')),
  source TEXT NOT NULL DEFAULT 'census_gazetteer_2024',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (type, geoid)
);
CREATE INDEX IF NOT EXISTS idx_territories_parent ON territories(parent_territory_id);
CREATE INDEX IF NOT EXISTS idx_territories_type ON territories(type);
CREATE INDEX IF NOT EXISTS idx_territories_state ON territories(state_fips, type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_territories_geoid
  ON territories(geoid) WHERE geoid IS NOT NULL;

-- Every county a place touches (a place may span several counties). The
-- territory tree itself is single-parent: parent = primary county. This
-- link table preserves the full truth so nothing is lost by that choice.
CREATE TABLE IF NOT EXISTS territory_place_counties (
  place_territory_id TEXT NOT NULL REFERENCES territories(territory_id),
  county_territory_id TEXT NOT NULL REFERENCES territories(territory_id),
  is_primary INTEGER NOT NULL DEFAULT 0,
  method TEXT NOT NULL,                -- 'census_codes_file' | 'internal_point_pip'
  PRIMARY KEY (place_territory_id, county_territory_id)
);
CREATE INDEX IF NOT EXISTS idx_tpc_county ON territory_place_counties(county_territory_id);

-- Root of the hierarchy (TZ 2.3, section 6): implemented from the start.
INSERT OR IGNORE INTO territories
  (territory_id, type, parent_territory_id, name, official_name, source)
VALUES
  ('terr-continental-nwana', 'CONTINENTAL', NULL,
   'NWANA Center (North America)', 'NWANA Center (North America)', 'tz_section_2_3'),
  ('terr-us', 'NATIONAL', 'terr-continental-nwana',
   'NWANA USA', 'United States of America', 'tz_section_2_3');

-- ---------------------------------------------------------------------------
-- 3. Role templates and role instances (TZ 10.1: roles are pre-written for
--    every entity, including a FORMING group with zero participants)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS role_templates (
  template_id TEXT PRIMARY KEY,        -- e.g. 'group_director'
  scope_type TEXT NOT NULL CHECK (scope_type IN
    ('CONTINENTAL','NATIONAL','STATE','COUNTY','CITY','LOCAL_COMMUNITY','GROUP')),
  title TEXT NOT NULL,
  employment_type TEXT NOT NULL CHECK (employment_type IN
    ('EMPLOYEE','CONTRACTOR','VOLUNTEER')),
  is_paid INTEGER NOT NULL DEFAULT 1,  -- paid once funded; never % of donations
  duties TEXT NOT NULL,
  requirements TEXT,
  appointment TEXT NOT NULL,           -- how a person enters the role
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

-- One row per (entity, template): the pre-written role attached to a
-- territory or a group before any person or funding exists. Person and
-- funding links are filled only by a real appointment (TZ 3.2 rule 3: an
-- application alone creates no NWANA obligation).
CREATE TABLE IF NOT EXISTS role_instances (
  instance_id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL REFERENCES role_templates(template_id),
  territory_id TEXT REFERENCES territories(territory_id),
  group_id TEXT,                       -- FK added logically; nw_groups is
                                       -- rebuilt below, so no hard FK here
                                       -- to keep migration order safe. The
                                       -- load script validates every value.
  status TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN
    ('PLANNED','FUNDED','OPEN','FILLED','SUSPENDED')),
  person_id TEXT,
  budget_line_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (territory_id IS NOT NULL OR group_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_role_instances_territory ON role_instances(territory_id);
CREATE INDEX IF NOT EXISTS idx_role_instances_group ON role_instances(group_id);
CREATE INDEX IF NOT EXISTS idx_role_instances_status ON role_instances(status);

-- Role catalog (TZ 10.1). One catalog for the whole country; never rewritten
-- per city. Pay parameters are NOT in the catalog: they come from the
-- parametric Territory Budget model (TZ 9) once approved.
INSERT OR IGNORE INTO role_templates
  (template_id, scope_type, title, employment_type, is_paid, duties, requirements, appointment, sort_order)
VALUES
  -- CONTINENTAL (NWANA center)
  ('president', 'CONTINENTAL', 'President', 'EMPLOYEE', 1,
   'Leads NWANA: strategy, standards, national partnerships, final decisions.',
   'Founder/president of NWANA.', 'Office held by the NWANA president.', 1),
  ('academy_director', 'CONTINENTAL', 'Academy Director', 'EMPLOYEE', 1,
   'Owns instructor education, certification standards and Academy quality.',
   'Certified Nordic Walking instructor; Academy teaching experience.',
   'Appointed by the President.', 2),
  ('engine_operations_lead', 'CONTINENTAL', 'Engine Operations Lead', 'EMPLOYEE', 1,
   'Owns the NWANA Engine, Operating Center, data quality and automation.',
   'Systems operations experience.', 'Appointed by the President.', 3),
  ('national_finance_lead', 'CONTINENTAL', 'National Finance Lead', 'EMPLOYEE', 1,
   'Owns budgets, territory money accounting, reporting to funders.',
   'Nonprofit finance experience.', 'Appointed by the President.', 4),
  ('national_marketing_lead', 'CONTINENTAL', 'National Marketing Lead', 'EMPLOYEE', 1,
   'Owns national content, campaigns and public surfaces.',
   'Content/marketing experience.', 'Appointed by the President.', 5),
  ('standards_safety_lead', 'CONTINENTAL', 'Standards & Safety Lead', 'EMPLOYEE', 1,
   'Owns safety standards, insurance coverage tracking, SafeSport compliance.',
   'Safety/compliance experience.', 'Appointed by the President.', 6),
  -- NATIONAL (NWANA USA)
  ('national_director', 'NATIONAL', 'National Director (USA)', 'EMPLOYEE', 1,
   'Coordinates the US network: states, national sponsors, national programs.',
   'Organizational leadership experience.', 'Appointed by the President.', 1),
  ('national_fundraising_lead', 'NATIONAL', 'National Fundraising Lead', 'EMPLOYEE', 1,
   'Runs the national Fundraising Machine: sources, outreach, funder reporting. Flat pay only; percentage-of-donations fundraising is prohibited (TZ 9.3).',
   'Fundraising/B2B development experience.', 'Appointed by the President.', 2),
  ('national_sponsorship_lead', 'NATIONAL', 'National Sponsorship Lead', 'EMPLOYEE', 1,
   'Owns national sponsorship assets, packages and renewals.',
   'Sponsorship sales experience.', 'Appointed by the President.', 3),
  ('national_partnerships_lead', 'NATIONAL', 'National Partnerships Lead', 'EMPLOYEE', 1,
   'Owns national partner organizations and distribution relationships.',
   'Partnership development experience.', 'Appointed by the President.', 4),
  ('national_program_lead', 'NATIONAL', 'National Program Lead', 'EMPLOYEE', 1,
   'Owns national-level programs run without a group (TZ 3.1 Program).',
   'Program management experience.', 'Appointed by the President.', 5),
  -- STATE
  ('state_coordinator', 'STATE', 'State Coordinator', 'EMPLOYEE', 1,
   'Coordinates NWANA work in the state: counties, partners, facilities, state-level funding sources.',
   'Coordination experience in the state.', 'Appointed by NWANA after funding is available; applications enter the candidate pool (TZ 10.3).', 1),
  ('state_fundraising_coordinator', 'STATE', 'State Fundraising Coordinator', 'EMPLOYEE', 1,
   'Finds and qualifies funding sources for state territories; flat pay only.',
   'Local fundraising/B2B experience.', 'Appointed by NWANA after funding is available.', 2),
  ('state_partnerships_coordinator', 'STATE', 'State Partnerships Coordinator', 'EMPLOYEE', 1,
   'Builds relationships with state organizations, cities and facilities.',
   'Partnership experience.', 'Appointed by NWANA after funding is available.', 3),
  -- COUNTY
  ('county_coordinator', 'COUNTY', 'County Coordinator', 'EMPLOYEE', 1,
   'Coordinates NWANA work in the county: cities, local partners, facilities, county-level funding.',
   'Coordination experience in the county.', 'Appointed by NWANA after funding is available; applications enter the candidate pool.', 1),
  ('county_partnerships_coordinator', 'COUNTY', 'County Partnerships Coordinator', 'CONTRACTOR', 1,
   'Builds relationships with county organizations and facilities.',
   'Partnership experience.', 'Appointed by NWANA after funding is available.', 2),
  -- CITY / LOCAL_COMMUNITY (territory level, distinct from group roles)
  ('territory_coordinator', 'CITY', 'Territory Coordinator', 'CONTRACTOR', 1,
   'Coordinates NWANA presence in the city territory: local signals, partners, facilities, launch readiness.',
   'Local coordination experience.', 'Appointed by NWANA after funding is available; applications enter the candidate pool.', 1),
  ('territory_coordinator_local', 'LOCAL_COMMUNITY', 'Territory Coordinator', 'CONTRACTOR', 1,
   'Coordinates NWANA presence in the local community territory: local signals, partners, facilities, launch readiness.',
   'Local coordination experience.', 'Appointed by NWANA after funding is available; applications enter the candidate pool.', 1),
  -- GROUP (attached to every NW Group, incl. FORMING with 0 participants)
  ('group_director', 'GROUP', 'Group Director', 'EMPLOYEE', 1,
   'Organizes the group''s activity on behalf of NWANA: coordinates instructors, works with local organizations and facilities within authority, owns schedule and participant recruitment, equipment, standards and safety, operating reporting through the Engine, execution of the approved budget. Never a club founder; does not fundraise for own salary, form a legal entity, or buy equipment personally (TZ 10.2).',
   'Per the universal Territory Budget role profile; economics decided separately (TZ 16.2). Until decided: applications are accepted into the candidate pool only, no vacancy is published.',
   'Pipeline: Submitted -> Screening -> Candidate Pool -> Funding Available -> Offer & Agreement -> Appointed (TZ 10.3). First applicant is never appointed automatically; no exclusive territory rights.', 1),
  ('lead_instructor', 'GROUP', 'Lead Instructor', 'CONTRACTOR', 1,
   'Leads the group''s training sessions and mentors its instructors.',
   'NWANA Academy certified instructor.', 'Appointed by NWANA from certified instructors.', 2),
  ('instructor', 'GROUP', 'Instructor', 'CONTRACTOR', 1,
   'Delivers Nordic Walking sessions for the group under NWANA standards.',
   'NWANA Academy Beginner Instructor certification (or in training under a Lead Instructor).',
   'Appointed by NWANA into an existing group; an instructor never founds a group (TZ 10.5).', 3),
  ('group_administrator', 'GROUP', 'Group Administrator', 'CONTRACTOR', 1,
   'Handles group administration: registrations, attendance, communications in the Engine.',
   'Administrative experience.', 'Appointed by NWANA / Group Director.', 4),
  ('group_outreach_coordinator', 'GROUP', 'Group Outreach Coordinator', 'CONTRACTOR', 1,
   'Local outreach for the group: organizations, facilities, participant recruitment.',
   'Local outreach experience.', 'Appointed by NWANA / Group Director.', 5),
  ('volunteer_coordinator', 'GROUP', 'Volunteer Coordinator', 'VOLUNTEER', 0,
   'Coordinates the group''s volunteers and their tasks.',
   'Local volunteer experience.', 'Accepted by the Group Director from volunteer applications.', 6),
  ('volunteer', 'GROUP', 'Volunteer', 'VOLUNTEER', 0,
   'Helps the group with sessions, events and community activity.',
   'None.', 'Accepted by the Group Director from volunteer applications.', 7);

-- ---------------------------------------------------------------------------
-- 4. Persons, applications, programs (TZ 3.1)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS persons (
  person_id TEXT PRIMARY KEY,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  home_territory_id TEXT REFERENCES territories(territory_id),
  home_group_id TEXT,                  -- set by Individual License purchase
                                       -- (the license marks the person in
                                       -- their home group, TZ 10.6)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_persons_email ON persons(email);

-- Application -> Territory is MANDATORY (territory_id NOT NULL).
-- Application -> Group is optional and set only when the application is
-- about a specific group (TZ 3.1), EXCEPT participant joins: for a
-- participant joining a city/local territory the default group is the
-- mandatory link, enforced by the CHECK below (kind='participant_join'
-- requires group_id). Director-candidate pipeline statuses follow TZ 10.3.
CREATE TABLE IF NOT EXISTS applications (
  application_id TEXT PRIMARY KEY,
  person_id TEXT REFERENCES persons(person_id),
  territory_id TEXT NOT NULL REFERENCES territories(territory_id),
  group_id TEXT,
  kind TEXT NOT NULL CHECK (kind IN
    ('role_candidate','participant_join','volunteer','business','organization','sport')),
  role_template_id TEXT REFERENCES role_templates(template_id),
  pipeline_status TEXT CHECK (pipeline_status IN
    ('Submitted','Screening','Candidate Pool','Funding Available',
     'Offer & Agreement','Appointed','Received','Reviewed','Closed')),
  payload_json TEXT,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (kind != 'participant_join' OR group_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_applications_territory ON applications(territory_id);
CREATE INDEX IF NOT EXISTS idx_applications_group ON applications(group_id);
CREATE INDEX IF NOT EXISTS idx_applications_kind_status
  ON applications(kind, pipeline_status);

CREATE TABLE IF NOT EXISTS programs (
  program_id TEXT PRIMARY KEY,
  territory_id TEXT NOT NULL REFERENCES territories(territory_id),
  group_id TEXT,                       -- optional by design (TZ 3.1):
                                       -- Territory -> Program is normal
  name TEXT NOT NULL,
  activity_type TEXT,
  status TEXT NOT NULL DEFAULT 'PLANNED'
    CHECK (status IN ('PLANNED','FUNDED','ACTIVE','PAUSED','DONE')),
  budget_ref TEXT,
  schedule_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_programs_territory ON programs(territory_id);
CREATE INDEX IF NOT EXISTS idx_programs_group ON programs(group_id);

-- ---------------------------------------------------------------------------
-- 5. nw_groups rebuild on the canonical vocabulary
--    (SQLite cannot ALTER a CHECK constraint; rebuild is the only way.
--     Every pre-migration row is already archived in step 1.)
-- ---------------------------------------------------------------------------

CREATE TABLE nw_groups_new (
  group_id TEXT PRIMARY KEY,
  territory_id TEXT NOT NULL REFERENCES territories(territory_id),
  group_number INTEGER NOT NULL DEFAULT 1,   -- number within the territory
  is_default INTEGER NOT NULL DEFAULT 0,     -- the standing-decision group
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  -- Category survives ONLY as informational taxonomy / request channel
  -- (TZ section 12). It is not a product, license split or ownership right.
  category_key TEXT REFERENCES nw_group_categories(category_key),
  status TEXT NOT NULL DEFAULT 'FORMING' CHECK (status IN ('FORMING','ACTIVE')),
  -- A RunSignup club exists only from activation (TZ 11.3); NULL until then.
  runsignup_club_id INTEGER,
  -- Denormalized display fields, copied from the territory at creation so
  -- the existing public worker keeps working; territory stays the truth.
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  latitude REAL,
  longitude REAL,
  description TEXT,
  public_url TEXT,
  runsignup_url TEXT,
  donate_url TEXT,
  fundraising_url TEXT,
  -- leader_* keep their columns with NEW semantics (TZ section 12):
  -- the NWANA-appointed director / lead instructor, never a founder.
  leader_name TEXT,
  leader_role TEXT,
  director_person_id TEXT REFERENCES persons(person_id),
  contact_email TEXT,
  activities_json TEXT,
  programs_json TEXT,
  events_json TEXT,
  news_json TEXT,
  challenge_participation TEXT,
  series_participation TEXT,
  -- 'active' is retained as the public-listing flag the groups worker
  -- already filters on (active=1); it is NOT a model status.
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  activated_at TEXT,                   -- set only when ACTIVE conditions
                                       -- of TZ 2.4 are all met
  UNIQUE (territory_id, group_number)
  -- REMOVED as operating mechanisms (TZ section 12), values archived:
  --   recognized_date, payment_account_state / 'own_account'.
  -- Money of every group is accounted by territory inside NWANA; a group
  -- never operates its own payment account.
);
CREATE INDEX idx_nw_groups_territory ON nw_groups_new(territory_id);
CREATE INDEX idx_nw_groups_status2 ON nw_groups_new(status);
CREATE INDEX idx_nw_groups_state2 ON nw_groups_new(state);
CREATE INDEX idx_nw_groups_category2 ON nw_groups_new(category_key);

-- Carry-over rule: NO pre-migration row is copied into the new live table.
-- Production holds exactly two rows (nwg-miami, nwg-hallandale-beach), both
-- owner-declared trial records with no continuity obligations (ADR-0050
-- point 8), both 'developing', neither recognized, no own_account. They
-- are preserved in archive_superseded_records (step 1) and their cities
-- re-enter via the standard Phase 1B default-group load. If this migration
-- is ever run against a database that DOES contain a recognized or
-- own_account row, STOP: that contradicts the 2026-10-17 inspection and
-- needs a fresh owner decision before any carry-over mapping is written.
-- Guard (fails the batch loudly if such a row exists):
--   (Run manually before applying; D1/SQLite has no ASSERT.)
--   SELECT group_id, status, payment_account_state FROM nw_groups
--   WHERE status='recognized' OR payment_account_state='own_account';
--   -- expected: 0 rows.

DROP TABLE nw_groups;
ALTER TABLE nw_groups_new RENAME TO nw_groups;

-- The 0095 indexes on the old table were dropped with it; the *_2 indexes
-- above were created on nw_groups_new and survive the rename in SQLite.
-- Recreate the remaining compatibility indexes under their original names
-- where they do not collide:
CREATE INDEX IF NOT EXISTS idx_nw_groups_city ON nw_groups(city);
CREATE INDEX IF NOT EXISTS idx_nw_groups_zip ON nw_groups(zip);
CREATE INDEX IF NOT EXISTS idx_nw_groups_active_status ON nw_groups(active, status);

-- nw_group_categories: semantics note. The table itself is unchanged; its
-- 14 categories are informational taxonomy only from this migration on
-- (TZ section 12). No schema change is required to enforce that: the
-- enforcement is that no license product or group-creation rule may read
-- category_key, which is a code-review rule, recorded here and in ADR-0050.

-- ---------------------------------------------------------------------------
-- 6. Phase 2 seams (nullable now, enforced after backfill — see header)
-- ---------------------------------------------------------------------------

ALTER TABLE outreach_prospects ADD COLUMN territory_id TEXT
  REFERENCES territories(territory_id);
CREATE INDEX IF NOT EXISTS idx_outreach_prospects_territory
  ON outreach_prospects(territory_id);

-- money_events exists since migration 0049. Guarded by convention: if the
-- table is absent in some environment this statement fails the batch, which
-- is the desired loud failure (do not silently skip money linkage).
ALTER TABLE money_events ADD COLUMN territory_id TEXT
  REFERENCES territories(territory_id);
CREATE INDEX IF NOT EXISTS idx_money_events_territory
  ON money_events(territory_id);

-- End of 0097. Next: the Phase 1B load (territories + default groups +
-- role instances) generated by scripts/generate_territory_load.py in this
-- package. The load is a separate, reviewable SQL file; it is NOT part of
-- this migration.
