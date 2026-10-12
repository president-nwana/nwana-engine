-- 0083: widen challenge_form_submissions.form_type CHECK to include
-- 'performance-levels' (expert input form for discipline performance standards,
-- /contact/performance-levels on the Charity Challenge site).
-- SQLite cannot ALTER a CHECK constraint: recreate the table and copy rows.
-- Without this, the Engine 500s on INSERT ("storage failed") even though the
-- type is whitelisted in VALID_FORM_TYPES (2026-10-10).

CREATE TABLE challenge_form_submissions_new (
	id TEXT PRIMARY KEY,
	form_type TEXT NOT NULL CHECK (form_type IN ('contact', 'organization', 'sponsor', 'partner', 'umbrella', 'miles-campaign', 'sponsor-miles', 'performance-levels')),
	status TEXT NOT NULL DEFAULT 'NEW' CHECK (status IN ('NEW', 'REVIEWED', 'CONTACTED', 'APPROVED', 'DECLINED', 'ARCHIVED')),
	payload_json TEXT NOT NULL,
	source TEXT NOT NULL DEFAULT 'challenges.nwaofna.org',
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

INSERT INTO challenge_form_submissions_new (id, form_type, status, payload_json, source, created_at, updated_at)
	SELECT id, form_type, status, payload_json, source, created_at, updated_at
	FROM challenge_form_submissions;

DROP TABLE challenge_form_submissions;

ALTER TABLE challenge_form_submissions_new RENAME TO challenge_form_submissions;

CREATE INDEX IF NOT EXISTS idx_form_submissions_type_status ON challenge_form_submissions(form_type, status, created_at DESC);
