-- Atomic fingerprint reservation for concurrency-safe deduplication.
-- status: 'pending' (reservation held, RunSignup submit in-flight),
--         'completed' (RunSignup submit succeeded),
--         'failed' (RunSignup submit definitively failed, retry allowed).
-- The reservation is acquired via INSERT OR IGNORE before the RunSignup
-- call; only the request that wins the insert may call RunSignup.
ALTER TABLE challenge_activity_fingerprints ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';
-- Backfill: existing rows predate the reservation scheme; they represent
-- completed submissions.
UPDATE challenge_activity_fingerprints SET status = 'completed' WHERE status IS NULL;
