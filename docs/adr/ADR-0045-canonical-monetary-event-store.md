# ADR-0045: Canonical Monetary Event Store — Phase 1 Money Ingestion

- Status: Accepted
- Date: 2026-09-29
- Project: NWANA Engine (Revenue Engine v1, Phase 1)

## Context

Revenue Engine v1's first production objective is narrow: RunSignup money truth
plus one repeatable donation funnel end-to-end. Phase 0 verified that the
RunSignup monetary endpoints are readable with the current grant (race 212466
donations/list returns HTTP 200 with zero donations; the v2 donation summary
returns HTTP 200). No canonical monetary state existed in Engine: donation
outcomes were reported as "not connected", and nothing could answer "what money
is true right now" without re-reading the source.

ADR-0044 forbids re-reading the source to reconfirm ingested truth. Phase 1
therefore establishes the canonical monetary event store that all downstream
money logic reads.

## Decision

Three D1 tables (migration 0049), one writer, many readers:

- `money_events` — append-only canonical monetary event history.
  `event_key` (deterministic, see below) is the PRIMARY KEY and the idempotency
  key: `INSERT OR IGNORE` makes repeated syncs, retries and re-reads incapable
  of creating duplicate canonical events.
- `money_transactions` — canonical current state per transaction, keyed by
  `transaction_key = source_system + source_transaction_id`. A read projection
  of the event history, maintained by the ingestion; used for lifecycle change
  detection and for "what is true now" reads. It is not a second truth: every
  row is derived from ingested events.
- `money_sync_state` — per-source sync checkpoint. The checkpoint row is
  written in the SAME D1 batch as the event/transaction writes (atomic
  all-or-nothing), so the cursor advances if and only if the canonical
  monetary state was durably committed. A failed sync records the classified
  error without advancing the cursor.

Identity rules (src/lib/money-model.ts, source-agnostic):

- Transaction identity: `source_system + source_transaction_id`
  (`transaction_key = "runsignup:donation:42"`). For RunSignup donations the
  donation record itself is the stable monetary fact, so the transaction is
  keyed by `donation:{donation_id}` — the most stable identifier the source
  provides.
- Event identity: `{source_system}:evt:{event_type}:{stable_ref}`. Where the
  source provides no unique event id, the fallback ref is derived from the
  source record's stable identifiers plus the normalized monetary snapshot
  hash — deterministic and stable across repeated sync runs.

Money semantics: gross / fee / net / refund are stored independently as
`(cents, status)` pairs. Status is `VERIFIED` only when the source supplied
the value; otherwise cents is NULL and status is `UNKNOWN`. Unknown amounts
never block ingestion of verified amounts; `net` is never derived silently
(`amount_paid` present ⇒ VERIFIED, otherwise UNKNOWN). No donor PII is
stored; `source_ref` keeps only source record identifiers. Attribution
defaults to `ATTRIBUTION_UNKNOWN` at ingestion (fund attribution is a
downstream rule concern, not source truth).

Event types (from the Revenue Engine directive): `donation_received`,
`registration_paid`, `license_purchased`, `license_renewed`,
`course_purchased`, `fundraiser_created`, `fundraiser_donation_received`,
`transaction_refunded`, `transaction_partially_refunded`,
`transaction_reversed`, `transaction_chargeback`. Phase 1 ingests
`donation_received` (+ `fundraiser_donation_received` when the record carries
a fundraiser) and derives refund lifecycle events from snapshot changes;
reversal/chargeback types exist in the model and fire when a source adapter
can observe them.

Sync design (src/lib/money-ingestion.ts):

- Explicit trigger only: `POST /api/operating-center/money/sync` (owner-key
  gated like every operating-center route). The OPERATING_PLAN trigger rule
  forbids recurring-schedule polling of external platforms to discover
  changes, so there is intentionally no cron. Re-invocation is an explicit
  owner/Engine action and is safe by idempotency.
- Bounded single-pass read: paginated `donations/list?format=json`
  (100/page, max 20 pages), full scan each sync with idempotent insert —
  correct under unverified source update semantics, bounded under the $0 rule.
- No generic retry loop: a failed read classifies the failure
  (`classifyRunSignupFailure`), records it in `money_sync_state.last_error`,
  and stops. Redundant reads are eliminated by design instead.
- Canonical read paths (ADR-0044): `GET /api/operating-center/money/events`,
  `/money/transactions`, `/money/sync-state` read D1 only. The executive
  money view's donation section now aggregates `money_events` instead of
  reporting "not connected".

What is deliberately NOT ingested: the v2 race-donation summary endpoint is
a derived aggregate, not transaction-level truth — ingesting it alongside
donations/list would create parallel monetary truth.

## Consequences

- Downstream money logic must read `money_events` / `money_transactions`;
  re-reading RunSignup to reconfirm ingested monetary truth violates ADR-0044.
- The model supports the full transaction lifecycle (refunds, partial
  refunds, reversals, chargebacks). Production now holds one verified donation
  (received path exercised 2026-09-30T03:12:41Z); refund / reversal /
  chargeback paths remain covered by fixture tests until real source data
  exercises them.
- RunSignup donation record field names were partially unverified while no
  production rows existed; the adapter reads defensively. The first real
  donation (2026-09-30) confirmed the field names: `donation_id`,
  `donation_amount`, `processing_fee`, `amount_paid`, donation timestamp.

## Addendum 2026-09-30 — canonical semantics of RunSignup `amount_paid` → `net_cents`

The first real donation (race 212466, donation `11291415`, accepted into
canonical state 2026-09-30T03:12:41Z) confirmed the source field names the
adapter reads defensively: `donation_id`, `donation_amount`,
`processing_fee`, `amount_paid`, and a donation timestamp. The verified
record is: donation amount 500¢, processing fee 20¢, amount paid 520¢ —
the fee is donor-covered (added on top: 500 + 20 = 520).

Canonical semantic contract (binding on all downstream aggregation):

- `gross_cents` ← source `donation_amount`: the donation amount directed to
  the organization. This is the donation-revenue figure.
- `fee_cents` ← source `processing_fee`: the processing fee on the
  transaction — a separate money flow to the payment processor, not revenue.
- `net_cents` ← source `amount_paid`: the TOTAL AMOUNT CHARGED TO THE DONOR,
  stored as VERIFIED source truth. It is NOT net revenue retained by NWANA.
- `refund_cents`: source provides no refund fields in the donation record →
  UNKNOWN (never derived).

Normative rule: donation revenue aggregates `gross_cents`, NEVER
`net_cents`. Summing `net_cents` would overstate the donation figure by the
fee amount (here $5.20 vs the true $5.00). Actual settlement / net cash
retained by NWANA is not derived here: the verified record shows the fee is
donor-covered (500 + 20 = 520 confirms the fee was added on top of the
donor charge), but this source provides no payout/settlement truth, so
retained remains UNKNOWN rather than assumed as gross or gross − fee. A
future record with different fee-bearing must be read from its own fields,
not assumed. The current executive money view already aggregates
`total_gross_cents` and is safe under this contract.

## Addendum 2026-09-30 (evening) — acceptance fixes: incremental cursor, `amount_paid` storage, true transaction identity

Phase 1 acceptance was reopened and closed only after three fixes were
implemented, tested, deployed, and verified against production. The
`donation_received` evidence for donation `11291415` (race 212466) remained
valid throughout; the fixes change storage semantics and ingestion behavior,
not the acceptance evidence itself.

1. **True incremental ingestion.** Normal sync now reads
   `money_sync_state.cursor` and, when a cursor exists, queries
   `donations/list` with `sort_direction=ASC&after_donation_id={cursor}` —
   the cursor mechanism documented by RunSignup for this endpoint (also
   verified: `before_donation_id`, `since_ts`, `until_ts` exist). The source
   page is read ONLY for ids greater than the cursor; an empty incremental
   page never resets the cursor. The previous full-scan-per-sync behavior is
   gone. Verified in production: a sync after the acceptance donation
   returned `incremental=true, fetched=0, eventsIngested=0`, cursor stayed
   `11291415` — the already-canonicalized donation was not re-read.
2. **Lifecycle reconciliation is a separate, explicit, bounded action.**
   `POST /api/operating-center/money/reconcile` (owner-gated) takes at most
   25 donation ids, re-reads only those records (one targeted read per id,
   `after_donation_id={id-1}&results_per_page=1`), derives lifecycle events
   from snapshot changes, and never advances the normal sync cursor. This is
   the only path for re-reading old records; normal ingestion must not do it
   (ADR-0044). Verified in production: reconciling donation `11291415`
   returned `fetched=1, eventsIngested=0, lifecycleEvents=0` — no duplicates,
   cursor untouched.
3. **`amount_paid` is no longer stored as `net_cents`.** Schema 0050 added
   `amount_paid_cents` / `amount_paid_status` to `money_events` and
   `money_transactions`; `net_cents` is NULL and `net_status` is `UNKNOWN`
   for everything ingested from `donations/list` until a confirmed
   settlement / net-retained source exists. The verified real donation now
   stores: gross 500 VERIFIED, fee 20 VERIFIED, amount_paid 520 VERIFIED,
   net NULL/UNKNOWN. Downstream aggregates `gross_cents` only (verified in
   `src/operating-center-money.ts`); nothing sums `net_cents`.
4. **True source transaction identity (verified from the live payload).**
   The live record for donation `11291415` carries
   `rsu_transaction_id = 56992565` and
   `transaction_id = "ay_BDP9MNBQMND3QF35_0"`. Canonical identity rule
   (binding): transaction identity = `rsu_transaction:{rsu_transaction_id}`
   when present, else `transaction:{transaction_id}`, else the deterministic
   `donation:{donation_id}` fallback. Migration 0051 remapped the canonical
   transaction to `runsignup:rsu_transaction:56992565`
   (`source_transaction_id = rsu_transaction:56992565`). Event identity is
   deliberately donation-record based and unchanged:
   `runsignup:evt:donation_received:donation:11291415` — the idempotency
   proof survives the identity upgrade verbatim. The adapter upgrades a
   fallback identity to a true identity idempotently when a later read
   observes the identifiers.

A non-PII source-shape diagnostic exists for future verification:
`GET /api/operating-center/money/diagnostics/donation-record?donation_id=…`
(owner-gated) returns top-level field names plus only allowlisted scalar
identifiers/amounts/timestamps — donor `user` data is never read or
returned. It was used to verify the identifiers above.

Operational rule preserved: no periodic polling, no cron for external-change
discovery; sync and reconcile are explicit owner-triggered actions under the
verified-$0 constraint. Production Worker version holding this contract:
`3f0d9ec0-bb56-46cb-bcfb-aa891b8a6838` (deployed 2026-09-30; temporary
migration routes for 0050/0051 were applied and removed in the same session).
