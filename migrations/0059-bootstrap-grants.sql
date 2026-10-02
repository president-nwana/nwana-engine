-- 0059: one-time bootstrap grants (2026-10-02).
--
-- The owner key must never be typed into a browser or appear in HTML,
-- URLs, logs, browser storage, or client-side JavaScript. Instead, an
-- authorized internal process (holding the owner key server-side) mints a
-- single-use, short-lived bootstrap grant. The grant token is delivered to
-- the person performing first-admin setup over an authenticated channel;
-- they enter it in the /login bootstrap form alongside email/password/
-- display name. The grant is consumed on use; after the first
-- platform_admin exists, bootstrap closes permanently (checked on every
-- attempt by bootstrapClosed()).

CREATE TABLE IF NOT EXISTS bootstrap_grants (
	grant_id TEXT PRIMARY KEY,
	token_hash TEXT NOT NULL,
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
	expires_at TEXT NOT NULL,
	used_at TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_bootstrap_grants_expires
	ON bootstrap_grants(expires_at);
