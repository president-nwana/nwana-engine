-- Academy instructor snapshot (Moodle course id=2, Beginner Instructor Certification).
-- Privacy: stores ONLY Moodle user IDs + certification flags. No names, no emails.
-- certified=1 means Practical Video Submission graded "Competent" (technique review passed).
-- Sync is performed by an external scheduler (Moodle WS token cannot live in the worker).
CREATE TABLE IF NOT EXISTS academy_instructor_snapshot (
	user_id INTEGER NOT NULL,
	course_id INTEGER NOT NULL,
	certified INTEGER NOT NULL DEFAULT 0,
	synced_at TEXT NOT NULL,
	PRIMARY KEY (user_id, course_id)
);
