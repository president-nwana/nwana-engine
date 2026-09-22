-- ADR-0017: Sponsorship Asset as a first-class NWANA machine object.
-- One machine-generated seller package per parent object
-- (object_type, object_id), idempotent via the UNIQUE constraint.
-- Lifecycle: draft -> packaged -> offered -> negotiating -> committed
-- -> fulfilled -> renewal. renewal is terminal.
-- The machine generates and tracks; it never contacts sellers or sponsors.
CREATE TABLE IF NOT EXISTS sponsorship_assets (
	id TEXT PRIMARY KEY,
	object_type TEXT NOT NULL,
	object_id TEXT NOT NULL,
	title TEXT NOT NULL,
	description TEXT NOT NULL,
	audience TEXT NOT NULL,
	delivers TEXT NOT NULL,
	reference_pricing TEXT NOT NULL,
	stage TEXT NOT NULL DEFAULT 'draft',
	stage_updated_at TEXT NOT NULL,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL,
	UNIQUE (object_type, object_id)
);
CREATE INDEX IF NOT EXISTS idx_sponsorship_assets_stage
	ON sponsorship_assets(stage);
