-- RunSignup OAuth2 token storage (2026-10-05).
-- Singleton row (id=1): the Engine's server-to-server OAuth credentials
-- for Series 2026 (scopes rsu_api_read + rsu_api_write).
-- Access token lives ~1 month; refresh token ~20 years (per RunSignup docs).
-- The Engine auto-refreshes before expiry; the refresh token is never
-- exposed via API, UI, or logs.
CREATE TABLE IF NOT EXISTS runsignup_oauth (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	access_token TEXT NOT NULL,
	refresh_token TEXT NOT NULL,
	expires_at TEXT NOT NULL,
	scopes TEXT NOT NULL,
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
