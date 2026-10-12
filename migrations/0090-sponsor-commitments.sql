-- 0090: Sponsor Every Kilometer — confirmed sponsorship commitments.
-- A commitment is the sponsor's OWN confirmed figure (never a preset rate).
-- Receipts are NOT stored here: received amounts are computed at read time
-- from canonical money_events (donation_received rows attributed by
-- fundraiser_id). fundraiser_id is the RunSignup race_fundraiser_id resolved
-- by exact fundraiser_url match against the RunSignup fundraisers API;
-- NULL means the URL could not be reliably resolved (received stays 0).
CREATE TABLE IF NOT EXISTS sponsor_commitments (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	submission_id TEXT,
	company_name TEXT,
	contact_name TEXT,
	contact_email TEXT,
	scope TEXT CHECK (scope IN ('all_kilometers', 'discipline_event', 'season')),
	committed_amount_cents INTEGER,
	period_note TEXT,
	status TEXT NOT NULL DEFAULT 'confirmed',
	fundraiser_url TEXT,
	fundraiser_id INTEGER,
	reference_code TEXT UNIQUE,
	created_at TEXT,
	updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_sponsor_commitments_ref ON sponsor_commitments(reference_code);
CREATE INDEX IF NOT EXISTS idx_sponsor_commitments_fundraiser ON sponsor_commitments(fundraiser_id);
