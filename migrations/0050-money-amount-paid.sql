-- 0050: Correct the Phase 1 monetary semantics (Revenue Engine v1).
--
-- The real donation (race 212466, donation 11291415, 2026-09-30) proved that
-- RunSignup `amount_paid` is the TOTAL CHARGED TO THE DONOR (520c = 500c
-- donation + 20c donor-paid processing fee). It is NOT net revenue retained
-- by NWANA. Storing it in `net_cents` was a semantic error.
--
-- Correction:
--   * new columns amount_paid_cents / amount_paid_status preserve the source
--     fact under its correct name;
--   * net_cents / net_status return to NULL / UNKNOWN: the donations/list
--     source provides no settlement / net-retained truth, and net is never
--     derived from amount_paid.
-- The backfill moves the mislabeled value instead of hardcoding it, so the
-- verified source fact (520c, VERIFIED) is preserved exactly.

ALTER TABLE money_events ADD COLUMN amount_paid_cents INTEGER;
ALTER TABLE money_events ADD COLUMN amount_paid_status TEXT NOT NULL DEFAULT 'UNKNOWN'
	CHECK (amount_paid_status IN ('VERIFIED', 'UNKNOWN'));

ALTER TABLE money_transactions ADD COLUMN amount_paid_cents INTEGER;
ALTER TABLE money_transactions ADD COLUMN amount_paid_status TEXT NOT NULL DEFAULT 'UNKNOWN'
	CHECK (amount_paid_status IN ('VERIFIED', 'UNKNOWN'));

-- Backfill the verified real donation: relabel amount_paid, unclaim net.
UPDATE money_events
SET amount_paid_cents = net_cents,
	amount_paid_status = net_status,
	net_cents = NULL,
	net_status = 'UNKNOWN'
WHERE transaction_key = 'runsignup:donation:11291415'
  AND net_status = 'VERIFIED';

UPDATE money_transactions
SET amount_paid_cents = net_cents,
	amount_paid_status = net_status,
	net_cents = NULL,
	net_status = 'UNKNOWN'
WHERE transaction_key = 'runsignup:donation:11291415'
  AND net_status = 'VERIFIED';
