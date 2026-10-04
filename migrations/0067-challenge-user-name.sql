-- Participant name for leaderboard display (2026-10-04).
-- Populated at activity submit time from RunSignup participant data.
ALTER TABLE challenge_activities ADD COLUMN user_name TEXT;
