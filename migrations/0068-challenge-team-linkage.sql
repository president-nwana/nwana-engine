-- Team linkage for relay/team aggregation (2026-10-04).
-- Captured at submit time from RunSignup participant team data.
-- Relay logic is UNVERIFIED until a real 4-person team exists in production.
ALTER TABLE challenge_activities ADD COLUMN team_id INTEGER;
ALTER TABLE challenge_activities ADD COLUMN team_name TEXT;
