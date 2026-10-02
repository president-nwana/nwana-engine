-- Demo dataset for investor presentations (2026-10-02).
--
-- ISOLATION (owner directive):
--  1. Every demo table is pinned to tenant_id='demo-running-org' by CHECK.
--     Cross-tenant leakage is structurally impossible.
--  2. demo_revenue is SAMPLE revenue. It is NOT money_events and is NEVER
--     read by /api/operating-center/money/* or any NWANA revenue path.
--  3. Seed-only: no API write routes exist. demo_user is read-only.
--  4. Every human-visible value carries a (SAMPLE DATA) suffix.

CREATE TABLE IF NOT EXISTS demo_events (
	event_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL DEFAULT 'demo-running-org'
		CHECK (tenant_id = 'demo-running-org') REFERENCES tenants(tenant_id),
	business_unit_id TEXT NOT NULL DEFAULT 'demo-running-events'
		REFERENCES business_units(business_unit_id),
	name TEXT NOT NULL,
	event_type TEXT NOT NULL,
	event_date TEXT,
	location TEXT,
	distance TEXT,
	status TEXT NOT NULL DEFAULT 'upcoming'
		CHECK (status IN ('upcoming', 'ongoing', 'completed', 'cancelled')),
	participants_count INTEGER NOT NULL DEFAULT 0,
	revenue_cents INTEGER,
	notes TEXT
);

CREATE TABLE IF NOT EXISTS demo_memberships (
	membership_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL DEFAULT 'demo-running-org'
		CHECK (tenant_id = 'demo-running-org') REFERENCES tenants(tenant_id),
	business_unit_id TEXT NOT NULL DEFAULT 'demo-running-membership'
		REFERENCES business_units(business_unit_id),
	member_name TEXT NOT NULL,
	level_name TEXT NOT NULL,
	level_type TEXT,
	amount_paid_cents INTEGER NOT NULL DEFAULT 0,
	is_paid INTEGER NOT NULL DEFAULT 0 CHECK (is_paid IN (0, 1)),
	start_date TEXT,
	end_date TEXT,
	status TEXT NOT NULL DEFAULT 'UNKNOWN'
		CHECK (status IN ('ACTIVE', 'EXPIRED', 'FUTURE', 'UNKNOWN'))
);

CREATE TABLE IF NOT EXISTS demo_academy_courses (
	course_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL DEFAULT 'demo-running-org'
		CHECK (tenant_id = 'demo-running-org') REFERENCES tenants(tenant_id),
	business_unit_id TEXT NOT NULL DEFAULT 'demo-running-academy'
		REFERENCES business_units(business_unit_id),
	title TEXT NOT NULL,
	level TEXT,
	duration_weeks INTEGER,
	price_cents INTEGER NOT NULL DEFAULT 0,
	enrolled_count INTEGER NOT NULL DEFAULT 0,
	instructor TEXT,
	status TEXT NOT NULL DEFAULT 'scheduled'
		CHECK (status IN ('scheduled', 'in_progress', 'completed'))
);

CREATE TABLE IF NOT EXISTS demo_participants (
	participant_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL DEFAULT 'demo-running-org'
		CHECK (tenant_id = 'demo-running-org') REFERENCES tenants(tenant_id),
	display_name TEXT NOT NULL,
	event_id TEXT REFERENCES demo_events(event_id),
	course_id TEXT REFERENCES demo_academy_courses(course_id),
	membership_id TEXT REFERENCES demo_memberships(membership_id),
	role TEXT,
	registered_at TEXT
);

CREATE TABLE IF NOT EXISTS demo_revenue (
	revenue_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL DEFAULT 'demo-running-org'
		CHECK (tenant_id = 'demo-running-org') REFERENCES tenants(tenant_id),
	business_unit_id TEXT NOT NULL REFERENCES business_units(business_unit_id),
	category TEXT NOT NULL
		CHECK (category IN ('event_registration', 'membership', 'course_fee', 'donation')),
	label TEXT NOT NULL,
	amount_cents INTEGER NOT NULL,
	occurred_at TEXT,
	linked_event_id TEXT REFERENCES demo_events(event_id),
	linked_membership_id TEXT REFERENCES demo_memberships(membership_id),
	linked_course_id TEXT REFERENCES demo_academy_courses(course_id)
);

CREATE TABLE IF NOT EXISTS demo_actions (
	action_id TEXT PRIMARY KEY,
	tenant_id TEXT NOT NULL DEFAULT 'demo-running-org'
		CHECK (tenant_id = 'demo-running-org') REFERENCES tenants(tenant_id),
	business_unit_id TEXT NOT NULL REFERENCES business_units(business_unit_id),
	title TEXT NOT NULL,
	action_type TEXT,
	due_date TEXT,
	status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'done')),
	assignee TEXT
);

CREATE INDEX IF NOT EXISTS idx_demo_events_unit ON demo_events(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_demo_memberships_unit ON demo_memberships(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_demo_courses_unit ON demo_academy_courses(business_unit_id);
CREATE INDEX IF NOT EXISTS idx_demo_participants_tenant ON demo_participants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_demo_revenue_unit ON demo_revenue(business_unit_id, category);
CREATE INDEX IF NOT EXISTS idx_demo_actions_unit ON demo_actions(business_unit_id, status);

-- Seed: events
INSERT OR IGNORE INTO demo_events (event_id, name, event_type, event_date, location, distance, status, participants_count, revenue_cents) VALUES
('demo-evt-spring5k-2026', 'Spring 5K Community Run (SAMPLE DATA)', 'fun_run', '2026-04-18', 'Sample City, ST (SAMPLE DATA)', '5K', 'completed', 342, 855000),
('demo-evt-summer10k-2026', 'Summer Sunset 10K (SAMPLE DATA)', 'race', '2026-07-11', 'Sample City, ST (SAMPLE DATA)', '10K', 'completed', 518, 1554000),
('demo-evt-fallhalf-2026', 'Autumn Half Marathon (SAMPLE DATA)', 'race', '2026-10-24', 'Sample City, ST (SAMPLE DATA)', '21.1K', 'upcoming', 0, 0),
('demo-evt-winterclinic-2026', 'Winter Form Clinic (SAMPLE DATA)', 'clinic', '2026-12-05', 'Sample City, ST (SAMPLE DATA)', NULL, 'upcoming', 0, 0);

-- Seed: memberships (6 records · 4 paid · 2 free · $215.00 sample revenue)
INSERT OR IGNORE INTO demo_memberships (membership_id, member_name, level_name, level_type, amount_paid_cents, is_paid, start_date, end_date, status) VALUES
('demo-mem-0001', 'Sample Member 001 (SAMPLE DATA)', 'Annual Runner (SAMPLE DATA)', 'annual', 4500, 1, '2026-01-15', '2027-01-15', 'ACTIVE'),
('demo-mem-0002', 'Sample Member 002 (SAMPLE DATA)', 'Annual Runner (SAMPLE DATA)', 'annual', 4500, 1, '2026-03-02', '2027-03-02', 'ACTIVE'),
('demo-mem-0003', 'Sample Member 003 (SAMPLE DATA)', 'Family Plan (SAMPLE DATA)', 'annual', 8000, 1, '2026-02-10', '2027-02-10', 'ACTIVE'),
('demo-mem-0004', 'Sample Member 004 (SAMPLE DATA)', 'Elite Athlete (SAMPLE DATA)', 'elite', 0, 0, '2026-01-01', '2026-12-31', 'ACTIVE'),
('demo-mem-0005', 'Sample Member 005 (SAMPLE DATA)', 'Lifetime Member (SAMPLE DATA)', 'lifetime', 0, 0, '2025-06-01', NULL, 'ACTIVE'),
('demo-mem-0006', 'Sample Member 006 (SAMPLE DATA)', 'Annual Runner (SAMPLE DATA)', 'annual', 4500, 1, '2025-01-20', '2026-01-20', 'EXPIRED');

-- Seed: academy courses
INSERT OR IGNORE INTO demo_academy_courses (course_id, title, level, duration_weeks, price_cents, enrolled_count, instructor, status) VALUES
('demo-course-foundations', 'Running Foundations (SAMPLE DATA)', 'beginner', 8, 12000, 48, 'Sample Coach Rivera (SAMPLE DATA)', 'in_progress'),
('demo-course-halfprep', 'Half Marathon Prep (SAMPLE DATA)', 'intermediate', 12, 18000, 32, 'Sample Coach Chen (SAMPLE DATA)', 'scheduled'),
('demo-course-youth', 'Youth Striders (SAMPLE DATA)', 'beginner', 6, 0, 25, 'Sample Coach Rivera (SAMPLE DATA)', 'scheduled');

-- Seed: participants
INSERT OR IGNORE INTO demo_participants (participant_id, display_name, event_id, role, registered_at) VALUES
('demo-part-0001', 'Sample Runner 001 (SAMPLE DATA)', 'demo-evt-spring5k-2026', 'runner', '2026-03-01'),
('demo-part-0002', 'Sample Runner 002 (SAMPLE DATA)', 'demo-evt-spring5k-2026', 'runner', '2026-03-05'),
('demo-part-0003', 'Sample Runner 003 (SAMPLE DATA)', 'demo-evt-spring5k-2026', 'runner', '2026-03-10'),
('demo-part-0004', 'Sample Runner 004 (SAMPLE DATA)', 'demo-evt-summer10k-2026', 'runner', '2026-05-15'),
('demo-part-0005', 'Sample Runner 005 (SAMPLE DATA)', 'demo-evt-summer10k-2026', 'runner', '2026-05-20'),
('demo-part-0012', 'Sample Volunteer 001 (SAMPLE DATA)', 'demo-evt-summer10k-2026', 'volunteer', '2026-06-01');
INSERT OR IGNORE INTO demo_participants (participant_id, display_name, course_id, role, registered_at) VALUES
('demo-part-0007', 'Sample Student 001 (SAMPLE DATA)', 'demo-course-foundations', 'student', '2026-08-15'),
('demo-part-0008', 'Sample Student 002 (SAMPLE DATA)', 'demo-course-foundations', 'student', '2026-08-18'),
('demo-part-0009', 'Sample Student 003 (SAMPLE DATA)', 'demo-course-foundations', 'student', '2026-08-20');
INSERT OR IGNORE INTO demo_participants (participant_id, display_name, membership_id, role, registered_at) VALUES
('demo-part-0010', 'Sample Member 001 (SAMPLE DATA)', 'demo-mem-0001', 'member', '2026-01-15'),
('demo-part-0011', 'Sample Member 002 (SAMPLE DATA)', 'demo-mem-0002', 'member', '2026-03-02');

-- Seed: revenue (SAMPLE ONLY — never canonical money)
INSERT OR IGNORE INTO demo_revenue (revenue_id, business_unit_id, category, label, amount_cents, occurred_at, linked_event_id) VALUES
('demo-rev-0001', 'demo-running-events', 'event_registration', 'Spring 5K registrations (SAMPLE DATA)', 855000, '2026-04-18', 'demo-evt-spring5k-2026'),
('demo-rev-0002', 'demo-running-events', 'event_registration', 'Summer 10K registrations (SAMPLE DATA)', 1554000, '2026-07-11', 'demo-evt-summer10k-2026'),
('demo-rev-0007', 'demo-running-events', 'donation', 'Summer 10K charity add-ons (SAMPLE DATA)', 123000, '2026-07-11', 'demo-evt-summer10k-2026');
INSERT OR IGNORE INTO demo_revenue (revenue_id, business_unit_id, category, label, amount_cents, occurred_at, linked_membership_id) VALUES
('demo-rev-0003', 'demo-running-membership', 'membership', 'Annual memberships Q1 (SAMPLE DATA)', 17000, '2026-03-31', 'demo-mem-0001'),
('demo-rev-0004', 'demo-running-membership', 'membership', 'Annual memberships Q2 (SAMPLE DATA)', 4500, '2026-06-30', 'demo-mem-0002');
INSERT OR IGNORE INTO demo_revenue (revenue_id, business_unit_id, category, label, amount_cents, occurred_at, linked_course_id) VALUES
('demo-rev-0005', 'demo-running-academy', 'course_fee', 'Running Foundations tuition (SAMPLE DATA)', 576000, '2026-09-01', 'demo-course-foundations'),
('demo-rev-0006', 'demo-running-academy', 'course_fee', 'Half Marathon Prep early-bird (SAMPLE DATA)', 144000, '2026-09-15', 'demo-course-halfprep');

-- Seed: actions
INSERT OR IGNORE INTO demo_actions (action_id, business_unit_id, title, action_type, due_date, status, assignee) VALUES
('demo-act-0001', 'demo-running-events', 'Confirm Autumn Half Marathon permits (SAMPLE DATA)', 'planning', '2026-08-15', 'in_progress', 'Sample Coordinator (SAMPLE DATA)'),
('demo-act-0002', 'demo-running-events', 'Follow up with Summer 10K sponsors (SAMPLE DATA)', 'follow_up', '2026-08-01', 'open', 'Sample Coordinator (SAMPLE DATA)'),
('demo-act-0003', 'demo-running-membership', 'Send renewal reminders — Q4 expiries (SAMPLE DATA)', 'outreach', '2026-10-01', 'open', 'Sample Membership Lead (SAMPLE DATA)'),
('demo-act-0004', 'demo-running-academy', 'Publish Winter Form Clinic curriculum (SAMPLE DATA)', 'planning', '2026-11-01', 'open', 'Sample Coach Rivera (SAMPLE DATA)'),
('demo-act-0005', 'demo-running-academy', 'Review Youth Striders scholarship slots (SAMPLE DATA)', 'review', '2026-09-20', 'done', 'Sample Coach Chen (SAMPLE DATA)');

-- Mark demo units as pilot with sample revenue model.
UPDATE business_units
SET operating_status = 'pilot',
	revenue_model = 'sample / demonstration only'
WHERE tenant_id = 'demo-running-org';
