-- MemberOrg membership/license operational truth (2026-10-02).
--
-- $0 membership/license records are REAL issuances (complimentary, Elite
-- Athlete, Lifetime, sponsored/free) and must be visible in Machine as
-- operational truth. They create $0-gross license_purchased events in
-- money_events (existence preserved) but NO revenue.
--
-- This table holds the per-record operational detail (level/type, dates,
-- status) that money_events does not carry. It is NOT a money store:
-- revenue is derived exclusively from money_events (verified amount_paid).
-- One row per (club_id, membership_id); upserted on every sync.

CREATE TABLE IF NOT EXISTS memberorg_memberships (
	club_id TEXT NOT NULL,
	membership_id TEXT NOT NULL,
	-- Human-readable membership level/type, e.g. "Annual Athlete License - Regular".
	level_name TEXT,
	level_id TEXT,
	-- Verified amount paid (cents). Revenue iff > 0.
	amount_paid_cents INTEGER,
	-- Level price (cents). Reference only; NOT revenue.
	membership_cost_cents INTEGER,
	-- Membership period.
	start_date TEXT,
	end_date TEXT,
	-- Computed status at sync time: ACTIVE | EXPIRED | FUTURE | UNKNOWN.
	status TEXT NOT NULL DEFAULT 'UNKNOWN',
	-- 1 when amount_paid_cents > 0, else 0.
	is_paid INTEGER NOT NULL DEFAULT 0,
	-- Canonical money identity for cross-reference (no join needed for revenue).
	transaction_key TEXT,
	source_ref TEXT,
	last_synced_at TEXT NOT NULL,
	PRIMARY KEY (club_id, membership_id)
);

CREATE INDEX IF NOT EXISTS idx_memberorg_memberships_status
	ON memberorg_memberships (club_id, status);
CREATE INDEX IF NOT EXISTS idx_memberorg_memberships_paid
	ON memberorg_memberships (club_id, is_paid);
