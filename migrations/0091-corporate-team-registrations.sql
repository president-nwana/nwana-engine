-- 0091: Corporate Umbrella Teams — registration status mirror.
-- Filled at corporate-teams form submission; refreshed by matching synced
-- RunSignup race teams (challenge_teams) by exact normalized team name =
-- company name (the name the registrant is instructed to give the team).
-- This is organization-name matching for a self-chosen team name, never
-- person identity matching.
CREATE TABLE IF NOT EXISTS corporate_team_registrations (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	submission_id TEXT,
	company_name TEXT,
	contact_email TEXT,
	team_id INTEGER,
	team_status TEXT NOT NULL DEFAULT 'awaiting_team' CHECK (team_status IN ('awaiting_team', 'team_live')),
	team_url TEXT,
	member_count INTEGER NOT NULL DEFAULT 0,
	created_at TEXT,
	updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_corporate_team_regs_status ON corporate_team_registrations(team_status);
CREATE INDEX IF NOT EXISTS idx_corporate_team_regs_name ON corporate_team_registrations(company_name);
