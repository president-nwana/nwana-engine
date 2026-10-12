-- 0092: B2B outreach infrastructure (Phase I).
-- Doctrine: replies become Engine state; sequences stop after a reply, a
-- refusal, an unsubscribe, or a successful connection. These tables hold
-- outreach STATE (prospects, sends, suppressions, replies) — the pipeline
-- system of record remains Engine D1. No campaign sends exist yet: the
-- sender is gated behind explicit approval and loaded sequences.
CREATE TABLE IF NOT EXISTS outreach_prospects (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	track TEXT NOT NULL CHECK (track IN ('sponsor-kilometers', 'corporate-teams', 'instructor-training')),
	org_name TEXT,
	contact_name TEXT,
	contact_email TEXT,
	city_state TEXT,
	source TEXT,
	stage TEXT NOT NULL DEFAULT 'new',
	unsubscribe_token TEXT UNIQUE,
	created_at TEXT,
	updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_prospects_track ON outreach_prospects(track);
CREATE INDEX IF NOT EXISTS idx_outreach_prospects_email ON outreach_prospects(contact_email);
CREATE INDEX IF NOT EXISTS idx_outreach_prospects_stage ON outreach_prospects(stage);

CREATE TABLE IF NOT EXISTS outreach_sends (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	prospect_id INTEGER NOT NULL REFERENCES outreach_prospects(id),
	sequence_step INTEGER NOT NULL,
	subject TEXT,
	gmail_message_id TEXT,
	sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_sends_prospect ON outreach_sends(prospect_id);

CREATE TABLE IF NOT EXISTS outreach_suppressions (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	email TEXT NOT NULL UNIQUE,
	reason TEXT NOT NULL CHECK (reason IN ('unsubscribe', 'refusal', 'bounce', 'manual')),
	source TEXT,
	created_at TEXT
);

CREATE TABLE IF NOT EXISTS outreach_replies (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	prospect_id INTEGER REFERENCES outreach_prospects(id),
	gmail_message_id TEXT UNIQUE,
	from_email TEXT,
	classification TEXT CHECK (classification IN ('interested', 'question', 'refusal', 'unsubscribe', 'other')),
	body_excerpt TEXT,
	received_at TEXT,
	engine_action TEXT
);
CREATE INDEX IF NOT EXISTS idx_outreach_replies_prospect ON outreach_replies(prospect_id);

CREATE TABLE IF NOT EXISTS outreach_sequence_config (
	track TEXT NOT NULL,
	step INTEGER NOT NULL,
	delay_days INTEGER NOT NULL DEFAULT 0,
	PRIMARY KEY (track, step)
);
INSERT OR IGNORE INTO outreach_sequence_config (track, step, delay_days) VALUES
	('sponsor-kilometers', 1, 0), ('sponsor-kilometers', 2, 7), ('sponsor-kilometers', 3, 14),
	('corporate-teams', 1, 0), ('corporate-teams', 2, 7), ('corporate-teams', 3, 14),
	('instructor-training', 1, 0), ('instructor-training', 2, 7), ('instructor-training', 3, 14);
