-- 0033: seller / partner pipeline moves from hardcoded TS constants to D1.
-- Seed rows are a faithful copy of the SELLERS / PARTNERS constants that lived
-- in src/operating-center-screens.ts (verified real records, 2026-09-27).
-- zubie_five_answers stays in code: it is a one-off historical Q&A artifact,
-- not pipeline state (ADR-0028 pattern for curated one-off records).

CREATE TABLE IF NOT EXISTS sellers (
	id TEXT PRIMARY KEY,
	company TEXT NOT NULL,
	contact TEXT,
	role TEXT,
	stage TEXT NOT NULL,
	stage_updated_at TEXT,
	last_event TEXT,
	last_event_date TEXT,
	next_step TEXT,
	next_date TEXT,
	source_of_relationship TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS partners (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	subject TEXT,
	stage TEXT NOT NULL,
	stage_updated_at TEXT,
	last_event TEXT,
	last_event_date TEXT,
	sort_order INTEGER NOT NULL DEFAULT 0,
	created_at TEXT NOT NULL,
	updated_at TEXT NOT NULL
);

INSERT INTO sellers (id, company, contact, role, stage, stage_updated_at, last_event, last_event_date, next_step, next_date, source_of_relationship, sort_order, created_at, updated_at) VALUES
('integrity-9', 'Integrity 9', 'David Hayob', 'Chief Revenue Officer', 'Meeting confirmed', '2026-09-21T00:00:00.000Z', 'Owner confirmed Fri 2026-09-25 2:00-3:00pm CT (3:00pm ET, 10:00pm Riga). Awaiting the Teams link from David.', '2026-09-21', 'Join the call with the Latvian board members; decide on exclusivity terms (minimum commitments, milestones, termination rights) if they ask.', '2026-09-25', NULL, 1, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z'),
('zubie-five', 'Zubie Five', 'Adam Zubiate', 'Founder', 'Reply received — numbers requested', '2026-09-22T00:00:00.000Z', 'Adam replied 2026-09-22 asking for group-network size, virtual Series reach and registrations, and any brand relationships before a first call. Proposed call Tue-Thu, week of Sep 28.', '2026-09-22', 'Send the requested numbers (this report answers them) and book the call at zubiefive.com/meet.', NULL, NULL, 2, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z'),
('sea-theory', 'Sea Theory', 'Brianna Appel', 'Founder', 'Evaluating', '2026-09-17T00:00:00.000Z', 'Reply 2026-09-16: submit property and inventory via their portal for review by their sponsorship operators. Inventory document prepared 2026-09-17.', '2026-09-17', 'Owner decides whether to register on the Sea Theory portal (one opportunity at a time).', NULL, NULL, 3, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z'),
('elevate', 'Elevate', 'newbiz@oneelevate.com', 'Sponsorship sales agency', 'Contacted — no reply', '2026-09-16T00:00:00.000Z', 'Sent 2026-09-03; follow-up sent 2026-09-16. Only an autoresponder received.', '2026-09-16', 'None scheduled.', NULL, NULL, 4, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z'),
('playfly', 'Playfly', 'Contact@playfly.com', 'Sponsorship sales agency', 'Contacted — no reply', '2026-09-16T00:00:00.000Z', 'Sent 2026-09-03; follow-up sent 2026-09-16. No reply.', '2026-09-16', 'None scheduled.', NULL, NULL, 5, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z'),
('arco-global-media', 'Arco Global Media', 'ben@arcoglobalmedia.com', 'Sponsorship sales agency', 'Contacted — no reply', '2026-09-16T00:00:00.000Z', 'Sent 2026-09-03; follow-up sent 2026-09-16. No reply.', '2026-09-16', 'None scheduled.', NULL, NULL, 6, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z'),
('the-sho-agency', 'The Sho Agency', 'hello@theshoagency.com', 'Sponsorship sales agency', 'Contacted — no reply', '2026-09-16T00:00:00.000Z', 'Sent 2026-09-03; follow-up sent 2026-09-16. No reply.', '2026-09-16', 'None scheduled.', NULL, NULL, 7, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z'),
('sportsman-solutions', 'Sportsman Solutions', 'info@sportsmansolutions.com', 'Commission seller', 'Contacted — no reply', '2026-09-16T00:00:00.000Z', 'Sent 2026-09-03; follow-up sent 2026-09-16. No reply.', '2026-09-16', 'None scheduled.', NULL, NULL, 8, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z'),
('nxs-management', 'NXS Management', 'nick@nxs.management', 'Sponsorship sales agency', 'Contacted — no reply', '2026-09-16T00:00:00.000Z', 'Sent 2026-09-03; follow-up sent 2026-09-16. No reply. A further follow-up draft is staged, awaiting the owner''s Send.', '2026-09-16', 'Owner decides whether to send the staged follow-up.', NULL, NULL, 9, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z'),
('ssec', 'SSEC', 'info@gosponsorship.com', 'Commission seller', 'Contacted — no reply', '2026-09-16T00:00:00.000Z', 'Sent 2026-09-16 by the owner from the Gmail app.', '2026-09-16', 'None scheduled.', NULL, NULL, 10, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z');

INSERT INTO partners (id, name, subject, stage, stage_updated_at, last_event, last_event_date, sort_order, created_at, updated_at) VALUES
('aarp', 'AARP', 'National member-benefit partnership: Series + instructor course discount', 'Draft — no recipient yet', '2026-09-17T00:00:00.000Z', 'Draft staged in Gmail 2026-09-17 from the owner''s mailbox. The proposed discount figure is not confirmed and no verified public AARP partnerships address was found, so the draft has no recipient.', '2026-09-17', 1, '2026-09-27T00:00:00.000Z', '2026-09-27T00:00:00.000Z');
