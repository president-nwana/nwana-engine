-- RunSignup OAuth2 authorization state (2026-10-05).
-- Short-lived CSRF states for the one-time owner authorization flow.
CREATE TABLE IF NOT EXISTS runsignup_oauth_state (
	state TEXT PRIMARY KEY,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
