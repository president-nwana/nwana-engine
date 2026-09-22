-- ADR-0015: Fund as a first-class NWANA machine object.
-- A Fund is created at the moment the fundraising idea exists, and its
-- prospect pipeline is tracked through the machine lifecycle:
--   prospect -> verified -> drafted -> sent -> follow_up -> committed
--   -> stewardship -> recognition
-- The owner still presses Send and signs: the machine never sends
-- outreach itself, it tracks state, surfaces the next action, and routes
-- committed funds into stewardship and public recognition.
CREATE TABLE IF NOT EXISTS funds (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	slug TEXT NOT NULL UNIQUE,
	goal_amount REAL NOT NULL,
	raised_amount REAL NOT NULL DEFAULT 0,
	currency TEXT NOT NULL DEFAULT 'USD',
	status TEXT NOT NULL DEFAULT 'active',
	description TEXT,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS fund_prospects (
	id TEXT PRIMARY KEY,
	fund_id TEXT NOT NULL REFERENCES funds(id),
	name TEXT NOT NULL,
	email TEXT,
	stage TEXT NOT NULL DEFAULT 'prospect',
	ask_amount REAL,
	ask_tier TEXT,
	subject TEXT,
	one_pager_version TEXT,
	sent_at TEXT,
	stage_updated_at TEXT NOT NULL,
	notes TEXT
);
CREATE INDEX IF NOT EXISTS idx_fund_prospects_fund_stage
	ON fund_prospects(fund_id, stage);
