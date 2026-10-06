-- Challenge Teams cache: RunSignup is source of truth, D1 is searchable index.
-- Sync is on-demand (no polling): POST /api/challenge/v1/teams/sync refreshes from RunSignup.

CREATE TABLE IF NOT EXISTS challenge_teams (
	team_id INTEGER PRIMARY KEY,
	team_name TEXT NOT NULL,
	team_type_id INTEGER NOT NULL,
	team_type TEXT NOT NULL DEFAULT '',
	member_count INTEGER NOT NULL DEFAULT 0,
	last_modified_ts INTEGER,
	synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_challenge_teams_name ON challenge_teams(team_name);
CREATE INDEX IF NOT EXISTS idx_challenge_teams_type ON challenge_teams(team_type_id);

-- Which RunSignup users belong to / manage which teams (for "My Teams").
CREATE TABLE IF NOT EXISTS challenge_team_members (
	team_id INTEGER NOT NULL,
	rsu_user_id INTEGER NOT NULL,
	is_captain INTEGER NOT NULL DEFAULT 0,
	synced_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
	PRIMARY KEY (team_id, rsu_user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_team_members_user ON challenge_team_members(rsu_user_id);
