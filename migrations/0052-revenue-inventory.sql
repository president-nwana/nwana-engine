-- Phase 2 Executable Revenue Inventory (Revenue Engine v1).
--
-- One canonical inventory of every NWANA revenue-producing object.
-- Required object types (Final Development Directive):
--   DONATION, FUNDRAISER, RACE_REGISTRATION, ACADEMY_COURSE,
--   LICENSE, NW_GROUP, SPONSORSHIP, PARTNERSHIP
--
-- Design rules:
-- - revenue_objects is the canonical registry. One row per revenue object.
--   Identity: existing canonical Engine/D1 ID when available, otherwise
--   {type}:{source}:{source_id}. Never infer meaning from names/URLs/IDs.
-- - Money metrics (transaction count, gross, refunds, net, 7/30/90d) are NOT
--   stored here. They are derived at read time from the canonical Phase-1
--   money_events / money_transactions tables (ADR-0044: money tables are the
--   monetary truth; nothing duplicates them).
-- - revenue_object_actions is append-only action history. The inventory must
--   drive actions, not become a passive catalog: every object carries
--   next_revenue_action + action_status, and transitions are logged here.
-- - Missing truth is recorded as unknown/unavailable/blocked, never as
--   zeros or guesses. Gap records (no live object found in discovery) are
--   explicit rows with active_status='unknown'.
-- - revenue_system separates REVENUE_ENGINE from SPONSORSHIP_ENGINE.
--   Revenue Engine automation must not apply mass acquisition / mass
--   follow-up / passive-funnel rules to SPONSORSHIP_ENGINE objects.
--
-- Vocabularies (enforced by CHECK):
--   active_status:            active | inactive | hidden | unknown
--   conversion_tracking:      tracked | untracked | unavailable | unknown
--   acquisition_eligibility:  eligible | ineligible | blocked | unknown
--   action_status:            pending | in_progress | done | blocked | none
--   revenue_system:           REVENUE_ENGINE | SPONSORSHIP_ENGINE

CREATE TABLE IF NOT EXISTS revenue_objects (
	object_key TEXT PRIMARY KEY,
	object_type TEXT NOT NULL
		CHECK (object_type IN (
			'DONATION', 'FUNDRAISER', 'RACE_REGISTRATION', 'ACADEMY_COURSE',
			'LICENSE', 'NW_GROUP', 'SPONSORSHIP', 'PARTNERSHIP'
		)),
	name TEXT NOT NULL,
	source_platform TEXT,
	source_object_id TEXT,
	purchase_url TEXT,
	price_structure TEXT,
	active_status TEXT NOT NULL DEFAULT 'unknown'
		CHECK (active_status IN ('active', 'inactive', 'hidden', 'unknown')),
	monetary_capabilities TEXT,
	transaction_source TEXT,
	conversion_event TEXT,
	conversion_tracking TEXT NOT NULL DEFAULT 'unknown'
		CHECK (conversion_tracking IN ('tracked', 'untracked', 'unavailable', 'unknown')),
	automation_capabilities TEXT,
	acquisition_eligibility TEXT NOT NULL DEFAULT 'unknown'
		CHECK (acquisition_eligibility IN ('eligible', 'ineligible', 'blocked', 'unknown')),
	acquisition_eligibility_reason TEXT,
	next_revenue_action TEXT,
	action_status TEXT NOT NULL DEFAULT 'none'
		CHECK (action_status IN ('pending', 'in_progress', 'done', 'blocked', 'none')),
	attributable_acquisition_source TEXT,
	revenue_system TEXT NOT NULL
		CHECK (revenue_system IN ('REVENUE_ENGINE', 'SPONSORSHIP_ENGINE')),
	-- money_link: JSON rule describing how this object links to canonical
	-- money truth, e.g. {"event_types":["donation_received"]}.
	-- NULL means no money linkage established.
	money_link TEXT,
	evidence TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_revenue_objects_type
	ON revenue_objects(object_type);
CREATE INDEX IF NOT EXISTS idx_revenue_objects_system
	ON revenue_objects(revenue_system);
CREATE INDEX IF NOT EXISTS idx_revenue_objects_action_status
	ON revenue_objects(action_status);

CREATE TABLE IF NOT EXISTS revenue_object_actions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	object_key TEXT NOT NULL REFERENCES revenue_objects(object_key),
	action TEXT NOT NULL,
	status TEXT NOT NULL
		CHECK (status IN ('pending', 'in_progress', 'done', 'blocked', 'none')),
	note TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_revenue_object_actions_object
	ON revenue_object_actions(object_key, created_at);
