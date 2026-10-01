-- 0054: Multi-tenant layer — tenants + business_units (MVP).
--
-- Converts NWANA Engine from a single-organization operating system into a
-- reusable multi-tenant sports operating platform WITHOUT touching existing
-- NWANA production tables, flows, or money truth.
--
-- Design rules (ADR-0046):
-- - Additive only. No ALTER of existing tables. No backfill of legacy rows.
-- - tenants.business_units are NOT stored as a redundant column: the enabled
--   business units of a tenant are derived at read time from business_units.
--   (One source of truth, no dual bookkeeping.)
-- - business_units.unit_type is an OPEN vocabulary (TEXT, no CHECK): future
--   unit types (Events, Media, Membership, Clubs/Groups, Sponsorship,
--   Fundraising, Education, Commerce, Professional League, custom) must not
--   require a schema change.
-- - Money is NEVER stored per business unit. BU money summaries are derived
--   at read time from canonical money_events / money_transactions via the
--   revenue_objects linked in connected_assets (ADR-0044: money tables are
--   the monetary truth; nothing duplicates them).
-- - connected_assets references revenue_objects.object_key values. Legacy
--   revenue_objects rows are untouched; linkage lives only in the JSON
--   column here.
-- - Unknown / not-connected / not-operating states are stored explicitly.
--   Never seed synthetic revenue, athletes, transactions, or customers.
-- - The demo tenant (demo-running-org) is a configuration/schema proof only,
--   status='demo', with zero assets and zero money linkage.
--
-- Vocabularies (enforced by CHECK):
--   tenants.status:               active | suspended | archived | demo
--   tenants.plan_license_status:  owner | trial | active | expired | none
--   business_units.operating_status:
--                                 operating | pilot | not_operating | unknown
--   business_units.legal_entity_status:
--                                 NOT_FORMED | PLANNED | ACTIVE

CREATE TABLE IF NOT EXISTS tenants (
	tenant_id TEXT PRIMARY KEY,
	legal_name TEXT NOT NULL,
	display_name TEXT NOT NULL,
	organization_type TEXT NOT NULL DEFAULT 'nonprofit',
	sport_domain TEXT,
	status TEXT NOT NULL DEFAULT 'active'
		CHECK (status IN ('active', 'suspended', 'archived', 'demo')),
	-- JSON metadata: logo_url, colors, etc.
	branding TEXT,
	-- JSON: owner/admin contact metadata.
	owner_admin TEXT,
	-- JSON: external systems / integrations, e.g.
	-- [{"system":"runsignup","status":"connected"}, ...]
	external_systems TEXT,
	-- Licensing readiness (product/data boundary only; no billing system).
	plan_license_status TEXT NOT NULL DEFAULT 'none'
		CHECK (plan_license_status IN ('owner', 'trial', 'active', 'expired', 'none')),
	-- JSON array of enabled module ids.
	enabled_modules TEXT,
	license_start TEXT,
	license_end TEXT,
	-- Placeholder only. No payment processor in this phase.
	billing_model TEXT,
	white_label INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS business_units (
	business_unit_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
	-- Open vocabulary on purpose: GOVERNING_BODY, ACADEMY, TECHNOLOGY,
	-- LEAGUE_COMPETITION, SALES_DISTRIBUTION, MARKETPLACE, MEMBERSHIP,
	-- EVENTS, MEDIA, SPONSORSHIP, FUNDRAISING, EDUCATION, COMMERCE,
	-- PROFESSIONAL_LEAGUE, or any future custom type. No CHECK constraint.
	unit_type TEXT NOT NULL,
	name TEXT NOT NULL,
	operating_status TEXT NOT NULL DEFAULT 'unknown'
		CHECK (operating_status IN ('operating', 'pilot', 'not_operating', 'unknown')),
	legal_entity_status TEXT NOT NULL DEFAULT 'NOT_FORMED'
		CHECK (legal_entity_status IN ('NOT_FORMED', 'PLANNED', 'ACTIVE')),
	owner_legal_ref TEXT,
	revenue_model TEXT,
	-- JSON array of revenue_objects.object_key values, e.g.
	-- ["donation:runsignup:212466"]. Empty array = no linked assets.
	connected_assets TEXT NOT NULL DEFAULT '[]',
	-- JSON array of integration refs, e.g.
	-- [{"integration":"runsignup","status":"connected"}, ...]
	connected_integrations TEXT NOT NULL DEFAULT '[]',
	-- Money/audience are derived at read time; these columns hold only
	-- explicit override notes. NULL = derive.
	money_state TEXT,
	audience_state TEXT,
	-- JSON array of next-action strings.
	next_actions TEXT NOT NULL DEFAULT '[]',
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_business_units_tenant
	ON business_units(tenant_id);
CREATE INDEX IF NOT EXISTS idx_business_units_type
	ON business_units(unit_type);

-- Seed: NWANA as the first live tenant. INSERT OR IGNORE so re-running the
-- migration never clobbers owner edits.
INSERT OR IGNORE INTO tenants (
	tenant_id, legal_name, display_name, organization_type, sport_domain,
	status, branding, owner_admin, external_systems,
	plan_license_status, enabled_modules, license_start, license_end,
	billing_model, white_label
) VALUES (
	'nwana',
	'Nordic Walking Association of North America',
	'NWANA',
	'nonprofit_501c3',
	'nordic_walking',
	'active',
	'{"notes":"Branding served by existing Operating Center theme."}',
	'{"role":"President","note":"Owner/admin metadata lives with the organization, not the Engine."}',
	'[{"system":"runsignup","status":"connected","note":"Race 212466 donations verified live 2026-09-30"},{"system":"google_ads","status":"connected","note":"2 paused campaigns, $0 spend"},{"system":"google_analytics","status":"connected","note":"GA4 read-only, property 534556675"},{"system":"cloudflare","status":"connected","note":"Workers + D1, $0 operating cost"}]',
	'owner',
	'["revenue","registry","series","academy","funds","sponsorship","media","operating_center"]',
	'2026-09-29',
	NULL,
	'none',
	0
);

-- Seed: the six initial NWANA business units. Asset linkage references the
-- canonical Phase-2 revenue inventory object_keys (seeded 2026-09-30).
-- Gap records (no live object found in discovery) are linked explicitly so
-- the BU screen can show the honest gap instead of inventing state.
INSERT OR IGNORE INTO business_units (
	business_unit_id, tenant_id, unit_type, name,
	operating_status, legal_entity_status, owner_legal_ref, revenue_model,
	connected_assets, connected_integrations, money_state, audience_state,
	next_actions
) VALUES
(
	'nwana-governing', 'nwana', 'GOVERNING_BODY', 'NWANA / Governing Body',
	'operating', 'ACTIVE', 'NWANA 501(c)(3)',
	'donations + fundraising',
	'["donation:runsignup:212466","fundraiser:engine:fund-50k-bridge-sprint"]',
	'[{"integration":"runsignup","status":"connected"},{"integration":"google_ads","status":"connected","note":"Founding Circle campaign paused, $0 spend"}]',
	NULL, NULL,
	'["Repeatable donation funnel: enable acquisition campaign (owner decision), prove one new real donation end-to-end (Phase 4)"]'
),
(
	'nwana-academy', 'nwana', 'ACADEMY', 'Academy',
	'pilot', 'NOT_FORMED', NULL,
	'courses (future)',
	'["academy_course:gap:discovery-2026-09-30"]',
	'[]',
	NULL, NULL,
	'["Resolve academy_course gap: verify whether a live Academy revenue object exists before building automation"]'
),
(
	'nwana-engine-tech', 'nwana', 'TECHNOLOGY', 'Engine / Technology',
	'operating', 'NOT_FORMED', NULL,
	'internal platform (no direct revenue)',
	'[]',
	'[{"integration":"cloudflare","status":"connected","note":"Workers + D1, verified $0 operating cost"}]',
	NULL, NULL,
	'["Keep operating cost verified $0 on every deployment"]'
),
(
	'nwana-league', 'nwana', 'LEAGUE_COMPETITION', 'League / Competition',
	'pilot', 'NOT_FORMED', NULL,
	'race registrations (future)',
	'["race_registration:gap:discovery-2026-09-30"]',
	'[{"integration":"runsignup","status":"connected","note":"11 Series 2026 races verified live"}]',
	NULL, NULL,
	'["Resolve race_registration gap: verify a live registration revenue object before building league automation"]'
),
(
	'nwana-sales', 'nwana', 'SALES_DISTRIBUTION', 'Sales / Distribution',
	'pilot', 'NOT_FORMED', NULL,
	'partnerships + sponsorship (future)',
	'["partnership:engine:aarp","sponsorship:gap:discovery-2026-09-30"]',
	'[]',
	NULL, NULL,
	'["Resolve sponsorship gap: verify a live sponsorship revenue object before mass outreach"]'
),
(
	'nwana-marketplace', 'nwana', 'MARKETPLACE', 'Marketplace',
	'not_operating', 'NOT_FORMED', NULL,
	'unknown',
	'[]',
	'[]',
	NULL, NULL,
	'["Marketplace is explicitly out of scope for Revenue Engine v1"]'
);

-- Seed: second tenant proving generic reuse. Configuration/schema proof
-- only — NOT a production customer. Zero assets, zero money, zero audience.
INSERT OR IGNORE INTO tenants (
	tenant_id, legal_name, display_name, organization_type, sport_domain,
	status, branding, owner_admin, external_systems,
	plan_license_status, enabled_modules, license_start, license_end,
	billing_model, white_label
) VALUES (
	'demo-running-org',
	'Demo Running Organization',
	'Demo Running Org',
	'demo',
	'running',
	'demo',
	'{"notes":"Demo tenant: no branding connected."}',
	'{"note":"Demo tenant: no owner/admin."}',
	'[]',
	'trial',
	'["membership","events","academy"]',
	'2026-10-01',
	NULL,
	'none',
	1
);

INSERT OR IGNORE INTO business_units (
	business_unit_id, tenant_id, unit_type, name,
	operating_status, legal_entity_status, owner_legal_ref, revenue_model,
	connected_assets, connected_integrations, money_state, audience_state,
	next_actions
) VALUES
(
	'demo-running-membership', 'demo-running-org', 'MEMBERSHIP', 'Membership',
	'not_operating', 'NOT_FORMED', NULL,
	'unknown',
	'[]', '[]', NULL, NULL,
	'["Demo tenant: connect a membership source to activate this unit"]'
),
(
	'demo-running-events', 'demo-running-org', 'EVENTS', 'Events',
	'not_operating', 'NOT_FORMED', NULL,
	'unknown',
	'[]', '[]', NULL, NULL,
	'["Demo tenant: connect an events source to activate this unit"]'
),
(
	'demo-running-academy', 'demo-running-org', 'ACADEMY', 'Academy',
	'not_operating', 'NOT_FORMED', NULL,
	'unknown',
	'[]', '[]', NULL, NULL,
	'["Demo tenant: connect an academy source to activate this unit"]'
);
