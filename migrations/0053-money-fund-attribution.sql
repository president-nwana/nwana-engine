-- Phase 4: Fund attribution for canonical money transactions.
--
-- Owner decision 2026-09-30: all verified donation_received on race 212466
-- are automatically credited to fund-50k-bridge-sprint.
--
-- Design: fund_id is set at ingest time on money_transactions. The
-- funds.raised_amount is RECALCULATED from canonical money truth
-- (SUM(gross_cents) - SUM(refund_cents) for the fund), never incremented.
-- This makes the credit idempotent across syncs, retries, refunds,
-- reversals, and chargebacks: re-running the recalculation always yields
-- the same total as the canonical state.
--
-- funds.raised_amount is in DOLLARS (REAL); money_transactions amounts are
-- in CENTS (INTEGER). The recalculation divides by 100.0.

ALTER TABLE money_transactions ADD COLUMN fund_id TEXT;
CREATE INDEX IF NOT EXISTS idx_money_transactions_fund ON money_transactions(fund_id);
