-- Open Challenge activity type (2026-10-04).
-- Activity type is selected at logging time for personal history/analytics only.
-- Open Challenge has no sport leaderboard; type is not used for ranking.
ALTER TABLE challenge_activities ADD COLUMN activity_type TEXT;
