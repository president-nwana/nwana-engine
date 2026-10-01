-- ADR-0047: role-based tenant navigation.
-- Tenant users authenticate with scoped access tokens (one reusable path,
-- no passwords). Platform admins keep the owner key and the full
-- Operating Center; tenant users get the /portal, scoped to their tenant
-- and to their explicitly allowlisted business units.

CREATE TABLE IF NOT EXISTS tenant_users (
	-- Opaque internal id; never shown to tenant users.
	user_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL REFERENCES tenants(tenant_id),
	display_name TEXT NOT NULL,
	-- Vocabulary today: tenant_user only. Platform admins authenticate with
	-- the owner key, not with a row here.
	role TEXT NOT NULL DEFAULT 'tenant_user' CHECK (role IN ('tenant_user')),
	-- JSON array of business_unit_id. Explicit allowlist: empty = no units.
	-- Effective units = tenant business_units filtered by this list.
	unit_ids TEXT NOT NULL DEFAULT '[]',
	-- SHA-256 hex of the access token. The plaintext token is shown once at
	-- creation and never stored.
	token_hash TEXT NOT NULL UNIQUE,
	status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	note TEXT
);

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant ON tenant_users(tenant_id);
