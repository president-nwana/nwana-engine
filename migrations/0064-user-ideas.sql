-- Personal ideas for users (2026-10-02): each person has their own ideas,
-- which can be promoted to tenants. Separate from platform-level ventures.
CREATE TABLE IF NOT EXISTS user_ideas (
	idea_id TEXT PRIMARY KEY,
	user_id TEXT NOT NULL,
	name TEXT NOT NULL,
	summary TEXT NOT NULL DEFAULT '',
	stage TEXT NOT NULL DEFAULT 'idea' CHECK (stage IN ('idea', 'maturing', 'tenant', 'archived')),
	tenant_id TEXT,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_user_ideas_user ON user_ideas(user_id);
