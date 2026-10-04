-- Fundraiser attribution for donation leaderboard (2026-10-04).
-- fundraiser_id is a RunSignup identifier (not PII) linking a donation to
-- the individual fundraiser it was made to. Required for correct weekly
-- aggregation by fundraiser (not by transaction).
ALTER TABLE money_events ADD COLUMN fundraiser_id TEXT;
CREATE INDEX IF NOT EXISTS idx_money_events_fundraiser ON money_events(fundraiser_id, occurred_at);
