-- Phase 2 seed: canonical revenue inventory objects from discovery 2026-09-30.
--
-- Identity rule: existing canonical Engine/D1 ID when available, otherwise
-- {type}:{source}:{source_id}. Gap records (no live object found) use
-- {type}:gap:discovery-2026-09-30 and active_status='unknown'.
-- Money metrics are NOT seeded; they derive from money_events at read time.
-- Apply once via D1 API after migration 0052. Idempotent (INSERT OR REPLACE).

INSERT OR REPLACE INTO revenue_objects
(object_key, object_type, name, source_platform, source_object_id, purchase_url,
 price_structure, active_status, monetary_capabilities, transaction_source,
 conversion_event, conversion_tracking, automation_capabilities,
 acquisition_eligibility, acquisition_eligibility_reason,
 next_revenue_action, action_status, attributable_acquisition_source,
 revenue_system, money_link, evidence)
VALUES
-- 1. DONATION: RunSignup race 212466 donation funnel (Phase 1 money truth).
('donation:runsignup:212466', 'DONATION',
 'NWANA Nordic Walking SPORT — donation funnel',
 'runsignup', '212466',
 'https://sport.nwaofna.org/Race/Donate/FL/SaintPetersburg/NWANANordicWalkingSPORT',
 'open donation amounts; verified: $5.00 gross + $0.20 donor-paid fee on 2026-09-30',
 'active',
 '["donation_received"]',
 'runsignup',
 'donation_received',
 'unknown',
 '["explicit_owner_triggered_sync"]',
 'eligible', NULL,
 'Operate repeatable donation funnel end-to-end',
 'pending',
 NULL,
 'REVENUE_ENGINE',
 '{"event_types":["donation_received"]}',
 '{"discovery":"2026-09-30","phase1_acceptance":"donation 11291415, tx runsignup:rsu_transaction:56992565, gross 500 VERIFIED, fee 20 VERIFIED, amount_paid 520 VERIFIED, net NULL/UNKNOWN"}'),

-- 2. FUNDRAISER: $50K Manhattan HQ Bridge Sprint.
('fundraiser:engine:fund-50k-bridge-sprint', 'FUNDRAISER',
 '$50K Manhattan HQ Bridge Sprint',
 'engine', 'fund-50k-bridge-sprint',
 NULL,
 '$50,000 goal; $0 raised as of 2026-09-30',
 'active',
 '["fundraiser_donation_received"]',
 'engine',
 'fundraiser_donation_received',
 'unavailable',
 '["scheduled_followups"]',
 'eligible', NULL,
 'Execute scheduled prospect follow-ups due 2026-10-06 (15 prospects: 13 sent, 1 recognition, 1 declined)',
 'pending',
 NULL,
 'REVENUE_ENGINE',
 NULL,
 '{"discovery":"2026-09-30","prospects":{"sent":13,"recognition":1,"declined":1},"followups_due":"2026-10-06"}'),

-- 3. RACE_REGISTRATION: gap — no live revenue object found.
('race_registration:gap:discovery-2026-09-30', 'RACE_REGISTRATION',
 'Race registration (no live revenue object)',
 NULL, NULL, NULL, NULL,
 'unknown', NULL, NULL, NULL, 'unavailable', NULL,
 'unknown', 'no live race-registration revenue object found in discovery',
 'none', 'none', NULL,
 'REVENUE_ENGINE', NULL,
 '{"discovery":"2026-09-30","note":"series_registrations=0; source 209464 hidden/unused"}'),

-- 4. ACADEMY_COURSE: gap — Moodle not connected, catalog empty.
('academy_course:gap:discovery-2026-09-30', 'ACADEMY_COURSE',
 'Academy course (no live revenue object)',
 NULL, NULL, NULL, NULL,
 'unknown', NULL, NULL, NULL, 'unavailable', NULL,
 'unknown', 'Moodle not connected; catalog empty',
 'none', 'none', NULL,
 'REVENUE_ENGINE', NULL,
 '{"discovery":"2026-09-30","note":"Moodle not connected; catalog empty; do not build academy systems for inventory"}'),

-- 5. LICENSE: gap — no canonical products/sales.
('license:gap:discovery-2026-09-30', 'LICENSE',
 'License (no live revenue object)',
 NULL, NULL, NULL, NULL,
 'unknown', NULL, NULL, NULL, 'unavailable', NULL,
 'unknown', 'no canonical license products or sales found',
 'none', 'none', NULL,
 'REVENUE_ENGINE', NULL,
 '{"discovery":"2026-09-30","note":"no canonical products/sales"}'),

-- 6. NW_GROUP: RunSignup MemberOrg (connection blocked).
('nw_group:runsignup:memberorg', 'NW_GROUP',
 'NWANA NW Groups — RunSignup MemberOrg',
 'runsignup', 'memberorg',
 'https://runsignup.com/MemberOrg/NWANANWGroups/Register',
 'descriptive offer: free initial Group License; optional RECOGNIZED Group $200/year (not transaction evidence)',
 'unknown',
 NULL,
 'runsignup',
 NULL,
 'unavailable',
 NULL,
 'blocked', 'Engine state connected=false; counts/revenue unavailable; source connection/read capability missing',
 'Establish source connection / read capability for MemberOrg',
 'blocked',
 NULL,
 'REVENUE_ENGINE',
 NULL,
 '{"discovery":"2026-09-30","urls":["https://runsignup.com/MemberOrg/NWANANWGroups","https://runsignup.com/MemberOrg/NWANANWGroups/Register"],"engine_state":"connected=false"}'),

-- 7. SPONSORSHIP: gap — zero assets, no verified signed deals.
('sponsorship:gap:discovery-2026-09-30', 'SPONSORSHIP',
 'Sponsorship (no live revenue object)',
 NULL, NULL, NULL, NULL,
 'unknown', NULL, NULL, NULL, 'unavailable', NULL,
 'unknown', 'sponsorship_assets=0; 10 seller prospects but no verified signed deals/revenue',
 'none', 'none', NULL,
 'SPONSORSHIP_ENGINE', NULL,
 '{"discovery":"2026-09-30","note":"sponsorship_assets=0; 10 seller prospects, no verified signed deals"}'),

-- 8. PARTNERSHIP: AARP (commercial state unknown).
('partnership:engine:aarp', 'PARTNERSHIP',
 'AARP partnership',
 'engine', 'aarp',
 NULL, NULL,
 'unknown', NULL, NULL, NULL, 'unknown', NULL,
 'unknown', 'commercial terms, conversion and revenue unknown',
 'none', 'none', NULL,
 'SPONSORSHIP_ENGINE', NULL,
 '{"discovery":"2026-09-30","note":"partner_id=aarp; commercial terms unknown until verified"}');
