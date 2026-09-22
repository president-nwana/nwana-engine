-- ADR-0013: persist the registration URL the lifecycle sync observes from
-- RunSignup (race.url, race-level) on each event snapshot row, so the
-- next-race promo published at result-publication time can link to
-- registration from stored D1 data alone. Factual only: the URL is what
-- RunSignup returned during sync, never constructed.
ALTER TABLE race_event_results ADD COLUMN registration_url TEXT;
