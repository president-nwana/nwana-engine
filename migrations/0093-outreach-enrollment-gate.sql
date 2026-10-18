-- 0093: Outreach enrollment gate.
-- A prospect may enter a sequence ONLY by explicit enrollment. Before
-- this migration the sender had NO start gate: any emailable prospect
-- with a non-stop stage became due for step 1 as soon as sequence files
-- were loaded, so a launch was indistinguishable from flipping the
-- --live/env gates. Enrollment makes the launch a conscious act: the
-- operator enrolls a specific list (script mode --enroll / --enroll-tier-a
-- in process_outreach_sends.py), and eligible() refuses everyone else
-- regardless of stage, fit tier, or dates.
-- sequence_enrolled_at doubles as the cadence anchor: day 0 of the
-- sequence is the enrollment date, so steps land on enrollment +0/+7/+14
-- per outreach_sequence_config.delay_days (absolute offsets).
-- enrolled_by is the audit label of who performed the enrollment.
-- Both columns default NULL = NOT enrolled (all 140 existing prospects).
ALTER TABLE outreach_prospects ADD COLUMN sequence_enrolled_at TEXT;
ALTER TABLE outreach_prospects ADD COLUMN enrolled_by TEXT;
