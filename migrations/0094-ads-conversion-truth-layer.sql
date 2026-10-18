-- 0094: Google Ads completed-conversion truth layer (Phase 1, owner-approved
-- 2026-10-16; spec: goals/charity-challenge-google-ads-launch/hidden_files/
-- completed-conversions-research-2026-10-16.md).
--
-- Purpose: feed Google Ads TRUE completed events (Challenge registration,
-- fundraiser creation, donation) instead of GA4 click proxies, via offline
-- click-conversion import (gclid/gbraid/wbraid path only; hashed-email
-- Enhanced Conversions are Phase 2 and are NOT part of this migration).
--
--   ad_clicks               one row per ad click ID seen on
--                           challenges.nwaofna.org (first sight only).
--   ad_click_bindings       rsu_user_id -> click ID, bound when that browser
--                           signs in via RunSignup OAuth on the Challenge
--                           site. Latest bind wins (Google attributes to the
--                           last click anyway). One row per user.
--   challenge_registrations persisted race-216323 registrations WITHOUT the
--                           money pipeline's paid-only filter (the Challenge
--                           is free, so money_events never sees them).
--   challenge_fundraisers   race-216323 fundraisers with first-seen
--                           semantics: RunSignup's consumed payload carries
--                           no created_at, so first_seen_at IS the creation
--                           timestamp (poll cadence ~10 min).
--   ads_conversion_outbox   one row per completed event, deduped by
--                           event_key, joined to a click ID when a binding
--                           exists. status: pending -> uploaded; unmatched
--                           (no click join yet; re-matched on every build);
--                           expired (click older than Google's 90-day
--                           import window).
--
-- No PII: no names, no emails. Identity is the numeric RunSignup user id
-- the Engine already uses everywhere else.

CREATE TABLE IF NOT EXISTS ad_clicks (
	click_id TEXT PRIMARY KEY,
	kind TEXT NOT NULL CHECK (kind IN ('gclid', 'gbraid', 'wbraid')),
	first_seen_at TEXT NOT NULL,
	landing_path TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ad_click_bindings (
	rsu_user_id INTEGER PRIMARY KEY,
	click_id TEXT NOT NULL,
	bound_at TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ad_click_bindings_click
	ON ad_click_bindings(click_id);

CREATE TABLE IF NOT EXISTS challenge_registrations (
	registration_id INTEGER PRIMARY KEY,
	rsu_user_id INTEGER,
	event_id INTEGER,
	registration_date TEXT,
	first_seen_at TEXT NOT NULL,
	last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenge_registrations_user
	ON challenge_registrations(rsu_user_id);

CREATE TABLE IF NOT EXISTS challenge_fundraisers (
	fundraiser_id TEXT PRIMARY KEY,
	owner_rsu_user_id INTEGER,
	is_team INTEGER NOT NULL DEFAULT 0,
	fundraiser_name TEXT,
	first_seen_at TEXT NOT NULL,
	last_seen_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_challenge_fundraisers_owner
	ON challenge_fundraisers(owner_rsu_user_id);

CREATE TABLE IF NOT EXISTS ads_conversion_outbox (
	event_key TEXT PRIMARY KEY,
	ads_action TEXT NOT NULL CHECK (ads_action IN ('registration', 'fundraiser', 'donation')),
	click_id TEXT,
	click_kind TEXT,
	rsu_user_id INTEGER,
	occurred_at TEXT NOT NULL,
	value_cents INTEGER,
	currency TEXT NOT NULL DEFAULT 'USD',
	status TEXT NOT NULL DEFAULT 'unmatched'
		CHECK (status IN ('pending', 'uploaded', 'unmatched', 'expired')),
	attempts INTEGER NOT NULL DEFAULT 0,
	last_error TEXT,
	uploaded_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ads_outbox_status
	ON ads_conversion_outbox(status, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ads_outbox_action
	ON ads_conversion_outbox(ads_action, status);
