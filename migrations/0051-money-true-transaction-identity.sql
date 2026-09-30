-- 0051: Remap the verified real donation to the true source transaction identity.
--
-- Verified against the LIVE production payload for donation 11291415
-- (race 212466, inspected 2026-09-30 via the owner-gated diagnostic route;
-- donor PII never read):
--   rsu_transaction_id = 56992565        (RunSignup's own transaction record id)
--   transaction_id     = ay_BDP9MNBQMND3QF35_0  (payment gateway reference)
-- Per the canonical identity rule (money-model.ts), rsu_transaction_id is
-- preferred. The donation was previously canonicalized under the deterministic
-- `donation:{id}` fallback identity because the adapter did not read these
-- fields at acceptance time.
--
-- This remap preserves the $5 real-donation evidence: event_key values are
-- donation-record based (`runsignup:evt:donation_received:donation:11291415`)
-- and are NOT changed — the idempotency proof stays verbatim. Only the
-- transaction-level identity columns move.
--
-- Applied 2026-09-30 via the temporary owner-gated admin route, which derived
-- the target identifiers from the live source record itself (no transcribed
-- values). If the source had provided no true transaction identifier, this
-- migration would have been a no-op and the fallback identity retained.

UPDATE money_transactions
SET transaction_key = 'runsignup:rsu_transaction:56992565',
	source_transaction_id = 'rsu_transaction:56992565',
	updated_at = datetime('now')
WHERE transaction_key = 'runsignup:donation:11291415';

UPDATE money_events
SET transaction_key = 'runsignup:rsu_transaction:56992565',
	source_transaction_id = 'rsu_transaction:56992565'
WHERE transaction_key = 'runsignup:donation:11291415';
