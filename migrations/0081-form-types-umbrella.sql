-- 0081: widen challenge_form_submissions.form_type CHECK to include the
-- umbrella intent-form types (umbrella, miles-campaign, sponsor-miles).
-- SQLite cannot ALTER a CHECK constraint: recreate the table and copy rows.
-- Without this, the Engine 500s on INSERT ("storage failed") and the charity
-- worker falls back to a thank-you message -- silent drop (2026-10-08).

CREATE TABLE challenge_form_submissions_new (
	id TEXT PRIMARY KEY,
	form_type TEXT NOT NULL CHECK (form_type IN ('contact', 'organization', 'sponsor', 'partner', 'umbrella', 'miles-campaign', 'sponsor-miles')),
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
