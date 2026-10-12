-- 0088: widen challenge_form_submissions.form_type CHECK to include
-- 'instructor-training-org' (Instructor Training Organizations self-service
-- registration, /partners/instructor-training on the Charity Challenge site)
-- and create the instructor_training_orgs pipeline table.
-- SQLite cannot ALTER a CHECK constraint: recreate the table and copy rows.
-- (a) rebuild challenge_form_submissions (pattern of 0085/0086).

CREATE TABLE challenge_form_submissions_new (
	id TEXT PRIMARY KEY,
	form_type TEXT NOT NULL CHECK (form_type IN ('contact', 'organization', 'sponsor', 'partner', 'umbrella', 'miles-campaign', 'sponsor-miles', 'performance-levels', 'individual-instructor-application', 'instructor-story', 'board-listing', 'instructor-training-org')),
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

-- (b) Instructor Training Organizations pipeline: one row per registered
-- organization. moodle_status 'pending' until the agent-side processor
-- creates the Moodle group + enrolment key and emails the code to the
-- contact; then 'active' with moodle_group_id / enrolment_key filled.
CREATE TABLE IF NOT EXISTS instructor_training_orgs (
	id INTEGER PRIMARY KEY,
	submission_id INTEGER,
	org_name TEXT,
	org_type TEXT,
	contact_name TEXT,
	contact_email TEXT,
	phone TEXT,
	city_state TEXT,
	headcount INTEGER,
	notes TEXT,
	moodle_group_id INTEGER,
	enrolment_key TEXT,
	moodle_status TEXT DEFAULT 'pending',
	enrolled_count INTEGER DEFAULT 0,
	created_at TEXT,
	updated_at TEXT
);
