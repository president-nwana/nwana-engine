-- 0098: Phase 2 — Florida Money Engine, minimal working loop.
-- Owner-approved unified TZ (edition 7, 2026-10-17), sections 3, 5.2-5.4,
-- 7.2, 8, 13 (Phase 2), 14 (criteria 3, 7, 8). ADR-0045 (canonical money
-- store: this migration extends it, never forks it), ADR-0050.
--
-- What this migration does, in order:
--   1. Creates funding_lane_gates: the lane map of TZ section 8 as data.
--      A gate row states whether a funding lane may SOLICIT in a scope.
--      The Florida charitable donation lane is CLOSED until FDACS
--      registration is approved (Phase 1A gate memo, 2026-10-17).
--      Sponsorship and contract lanes carry their own gates and are NOT
--      blocked by the donation gate (TZ 4.1). Grants sit under the owner's
--      stop order (TZ 5.5): tracking only, no applications.
--   2. Rebuilds money_events with three additional receipt event types
--      (sponsorship_received, contract_payment_received, grant_received)
--      and three attribution columns: funding_lane, restriction,
--      source_prospect_id. Sponsorship is a commercial lane (TZ 5.4) and
--      must never be booked as donation_received: that would falsify the
--      donation totals the Operating Center reports (TZ criterion 7).
--      Every existing row and index is preserved verbatim.
--   3. Adds the same attribution columns (+ territory_id, the Phase 2 seam
--      of migration 0097) to money_transactions, the current-state
--      projection of money_events.
--
-- STAGED, NOT APPLIED at authoring time: production D1 writes were blocked
-- by the Cloudflare free-tier daily row-write limit (hit 2026-10-17 by the
-- Phase 1B load; resets 2026-10-19 00:00 UTC). Apply via the ordered steps
-- in workspace/research/phase2-money-engine-2026-10-17/sql/APPLY-ORDER.md.
-- The backfill that fills territory_id / funding_lane for existing rows is
-- scripts/backfill_territory_attribution.py in the same package; it runs
-- AFTER this migration and is fully guarded (IS NULL), so order is safe.

-- ---------------------------------------------------------------------------
-- 1. Lane gates (TZ section 8 as data)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS funding_lane_gates (
	lane TEXT NOT NULL CHECK (lane IN ('donation', 'sponsorship', 'contract', 'grant', 'in-kind')),
	scope TEXT NOT NULL,             -- 'FL', a state USPS, or 'ALL'
	status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'OWNER_STOP')),
	basis TEXT NOT NULL,             -- why this status holds; shown in the OC
	source TEXT NOT NULL,            -- document the status rests on
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (lane, scope)
);

INSERT OR IGNORE INTO funding_lane_gates (lane, scope, status, basis, source) VALUES
	('donation', 'FL', 'CLOSED',
	 'Florida ch. 496: NWANA has no approved FDACS charitable solicitation registration (never registered; registry check 2026-10-17 found no record). Mass charitable donation solicitations in Florida are blocked until FDACS-10100 is approved and the s. 496.411 disclosure block is live. This gate does not block sponsorship, contract or other B2B lanes.',
	 'Phase 1A gate memo 2026-10-17 (G1); TZ 4.1, 8.1'),
	('donation', 'ALL', 'CLOSED',
	 'No state charitable-solicitation gate has been passed for a mass donation wave in any state. Each state requires its own check before its first wave; the Florida conclusion does not transfer (TZ 8.2). Unsolicited gifts are bookkeeping, not a wave; see the record-receipt rule.',
	 'TZ 8.2'),
	('sponsorship', 'FL', 'OPEN',
	 'Sponsorship is a commercial B2B lane with consideration, not a charitable contribution. Its own gate: offers must be truthful, promise nothing beyond the real status of the territory and program, and never be framed as a charitable appeal (reclassification caution, Fla. Stat. 496.404(d)). No FDACS donation registration applies to this lane.',
	 'Phase 1A gate memo 2026-10-17 (2.7); TZ 4.1, 5.4'),
	('contract', 'FL', 'OPEN',
	 'B2B service contracts (instructor training delivery, program services) are sales of services, not solicitation of contributions; governed by contract law and the terms of each agreement, not by the donation gate.',
	 'Phase 1A gate memo 2026-10-17 (2.7); TZ 8.1'),
	('grant', 'ALL', 'OWNER_STOP',
	 'Owner stop order 2026-10-15: no grant applications, no letters, no insurance purchases for grants. The grants module tracks and calendars only.',
	 'TZ 5.5; owner order 2026-10-15');

-- ---------------------------------------------------------------------------
-- 2. money_events rebuild: new receipt event types + attribution columns
-- ---------------------------------------------------------------------------

CREATE TABLE money_events_new (
	event_key TEXT PRIMARY KEY,
	source_system TEXT NOT NULL,
	source_transaction_id TEXT NOT NULL,
	transaction_key TEXT NOT NULL,
	event_type TEXT NOT NULL
		CHECK (event_type IN (
			'donation_received',
			'registration_paid',
			'license_purchased',
			'license_renewed',
			'course_purchased',
			'fundraiser_created',
			'fundraiser_donation_received',
			'sponsorship_received',
			'contract_payment_received',
			'grant_received',
			'transaction_refunded',
			'transaction_partially_refunded',
			'transaction_reversed',
			'transaction_chargeback'
		)),
	occurred_at TEXT,
	ingested_at TEXT NOT NULL DEFAULT (datetime('now')),
	currency TEXT NOT NULL DEFAULT 'USD',
	gross_cents INTEGER,
	gross_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (gross_status IN ('VERIFIED', 'UNKNOWN')),
	fee_cents INTEGER,
	fee_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (fee_status IN ('VERIFIED', 'UNKNOWN')),
	net_cents INTEGER,
	net_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (net_status IN ('VERIFIED', 'UNKNOWN')),
	refund_cents INTEGER,
	refund_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (refund_status IN ('VERIFIED', 'UNKNOWN')),
	attribution TEXT NOT NULL DEFAULT 'ATTRIBUTION_UNKNOWN',
	source_ref TEXT,
	source_payload_hash TEXT,
	note TEXT,
	amount_paid_cents INTEGER,
	amount_paid_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (amount_paid_status IN ('VERIFIED', 'UNKNOWN')),
	tenant_id TEXT NOT NULL DEFAULT 'nwana',
	fundraiser_id TEXT,
	territory_id TEXT REFERENCES territories(territory_id),
	funding_lane TEXT CHECK (funding_lane IN ('donation', 'sponsorship', 'contract', 'grant', 'in-kind', 'registration', 'license')),
	restriction TEXT,
	source_prospect_id INTEGER REFERENCES outreach_prospects(id)
);

INSERT INTO money_events_new (
	event_key, source_system, source_transaction_id, transaction_key, event_type,
	occurred_at, ingested_at, currency,
	gross_cents, gross_status, fee_cents, fee_status,
	net_cents, net_status, refund_cents, refund_status,
	attribution, source_ref, source_payload_hash, note,
	amount_paid_cents, amount_paid_status, tenant_id, fundraiser_id, territory_id,
	funding_lane, restriction, source_prospect_id
)
SELECT
	event_key, source_system, source_transaction_id, transaction_key, event_type,
	occurred_at, ingested_at, currency,
	gross_cents, gross_status, fee_cents, fee_status,
	net_cents, net_status, refund_cents, refund_status,
	attribution, source_ref, source_payload_hash, note,
	amount_paid_cents, amount_paid_status, tenant_id, fundraiser_id, territory_id,
	NULL, NULL, NULL
FROM money_events;

DROP TABLE money_events;
ALTER TABLE money_events_new RENAME TO money_events;

CREATE INDEX idx_money_events_transaction ON money_events(transaction_key, occurred_at);
CREATE INDEX idx_money_events_type ON money_events(event_type, occurred_at);
CREATE INDEX idx_money_events_source ON money_events(source_system, source_transaction_id);
CREATE INDEX idx_money_events_tenant ON money_events(tenant_id);
CREATE INDEX idx_money_events_fundraiser ON money_events(fundraiser_id, occurred_at);
CREATE INDEX idx_money_events_territory ON money_events(territory_id);
CREATE INDEX idx_money_events_lane ON money_events(funding_lane, occurred_at);

-- ---------------------------------------------------------------------------
-- 3. money_transactions: attribution columns (current-state projection)
-- ---------------------------------------------------------------------------

ALTER TABLE money_transactions ADD COLUMN territory_id TEXT REFERENCES territories(territory_id);
ALTER TABLE money_transactions ADD COLUMN funding_lane TEXT;
ALTER TABLE money_transactions ADD COLUMN restriction TEXT;
ALTER TABLE money_transactions ADD COLUMN source_prospect_id INTEGER REFERENCES outreach_prospects(id);
CREATE INDEX idx_money_transactions_territory ON money_transactions(territory_id);
