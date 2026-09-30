-- Phase 1 Money Ingestion (Revenue Engine v1): canonical monetary event store.
--
-- ADR-0044: the external source is a boundary, not runtime truth. RunSignup is
-- read once per sync; every downstream consumer reads these D1 tables and must
-- never re-read RunSignup merely to reconfirm already-ingested monetary truth.
--
-- Model:
--   money_events        append-only canonical monetary event history.
--                       PRIMARY KEY(event_key) is the idempotency key:
--                       deterministic per source fact, so repeated syncs,
--                       retries and re-reads can never create duplicates.
--   money_transactions  canonical current state per transaction
--                       (transaction_key = source_system + source_transaction_id).
--                       A read projection of money_events, maintained by the
--                       ingestion; used for lifecycle change detection and for
--                       downstream reads that need "what is true now".
--   money_sync_state    per-source sync checkpoint. The checkpoint row is
--                       written in the SAME D1 batch as the ingested events,
--                       so the cursor advances if and only if the canonical
--                       monetary state was durably committed.
--
-- Money semantics: gross / fee / net / refund are stored independently as
-- (cents, status) pairs. status is VERIFIED only when the source supplied the
-- value; otherwise cents is NULL and status is UNKNOWN. Unknown amounts never
-- block ingestion of verified amounts. No PII is stored (no donor names,
-- emails, or addresses); source_ref keeps only source record identifiers.

CREATE TABLE IF NOT EXISTS money_events (
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
	note TEXT
);
CREATE INDEX IF NOT EXISTS idx_money_events_transaction
	ON money_events(transaction_key, occurred_at);
CREATE INDEX IF NOT EXISTS idx_money_events_type
	ON money_events(event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_money_events_source
	ON money_events(source_system, source_transaction_id);

CREATE TABLE IF NOT EXISTS money_transactions (
	transaction_key TEXT PRIMARY KEY,
	source_system TEXT NOT NULL,
	source_transaction_id TEXT NOT NULL,
	first_event_key TEXT,
	currency TEXT NOT NULL DEFAULT 'USD',
	gross_cents INTEGER,
	gross_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (gross_status IN ('VERIFIED', 'UNKNOWN')),
	fee_cents INTEGER,
	fee_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (fee_status IN ('VERIFIED', 'UNKNOWN')),
	net_cents INTEGER,
	net_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (net_status IN ('VERIFIED', 'UNKNOWN')),
	refund_cents INTEGER,
	refund_status TEXT NOT NULL DEFAULT 'UNKNOWN' CHECK (refund_status IN ('VERIFIED', 'UNKNOWN')),
	lifecycle_state TEXT NOT NULL DEFAULT 'ACTIVE'
		CHECK (lifecycle_state IN (
			'ACTIVE',
			'REFUNDED',
			'PARTIALLY_REFUNDED',
			'REVERSED',
			'CHARGEBACK'
		)),
	attribution TEXT NOT NULL DEFAULT 'ATTRIBUTION_UNKNOWN',
	source_ref TEXT,
	source_payload_hash TEXT,
	first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_money_transactions_source
	ON money_transactions(source_system, source_transaction_id);
CREATE INDEX IF NOT EXISTS idx_money_transactions_lifecycle
	ON money_transactions(lifecycle_state);

CREATE TABLE IF NOT EXISTS money_sync_state (
	source_key TEXT PRIMARY KEY,
	cursor TEXT,
	last_sync_at TEXT,
	last_sync_result TEXT,
	last_error TEXT
);
