-- Unified authentication: email/password for all normal users (2026-10-02).
--
-- Decision: all normal users authenticate with email+password. The owner key
-- remains only as bootstrap/recovery for platform administration.
--
-- Roles: platform_admin | tenant_owner | tenant_admin | business_unit_user | demo_user
--   platform_admin: platform/SaaS administration (tenants, users, modules, licensing).
--   tenant_owner / tenant_admin: full tenant workspace administration.
--   business_unit_user: operates within allowlisted business units.
--   demo_user: read-only demo workspace (demo tenant), never mutates production.
--
-- Passwords: PBKDF2-HMAC-SHA-256, 210k iterations, per-user salt.
-- Only the hash is stored; plaintext passwords never persist.

ALTER TABLE tenant_users ADD COLUMN email TEXT;
ALTER TABLE tenant_users ADD COLUMN password_hash TEXT;

-- Expand role vocabulary. SQLite cannot alter CHECK inline; recreate via
-- new-table copy to enforce the new vocabulary.
CREATE TABLE tenant_users_new (
	user_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
	display_name TEXT NOT NULL,
	role TEXT NOT NULL DEFAULT 'business_unit_user' CHECK (
		role IN ('platform_admin', 'tenant_owner', 'tenant_admin', 'business_unit_user', 'demo_user')
	),
	unit_ids TEXT NOT NULL DEFAULT '[]',
	token_hash TEXT UNIQUE,
	email TEXT UNIQUE,
	password_hash TEXT,
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	note TEXT
);

INSERT INTO tenant_users_new (
	user_id, tenant_id, display_name, role, unit_ids, token_hash, status, created_at, note
) SELECT
	user_id, tenant_id, display_name,
	CASE WHEN role = 'tenant_user' THEN 'business_unit_user' ELSE role END,
	unit_ids, token_hash, status, created_at, note
FROM tenant_users;

DROP TABLE tenant_users;
ALTER TABLE tenant_users_new RENAME TO tenant_users;

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_users_email ON tenant_users(email);
