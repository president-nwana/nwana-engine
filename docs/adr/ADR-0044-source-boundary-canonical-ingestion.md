# ADR-0044: External Sources Are Boundaries, Not Runtime Truth — Ingest Once, Read Canonical State

- Status: Accepted
- Date: 2026-09-29
- Project: NWANA Engine

## Context

A previously resolved production incident established this rule the hard way:
unnecessary repeated RunSignup calls contributed to transient failures (including
HTTP 522-class timeouts). After the redundant re-reads were removed, the flow
worked correctly.

RunSignup (and any external platform) is a source boundary: the place where new
source facts are acquired. It is not the runtime source of truth for every
downstream step.

## Decision

Once external source data has been successfully ingested and canonicalized into
Engine state, downstream processing must not re-query the external source merely
to reconfirm the same data.

Correct pattern:

```
RunSignup read → validate → persist canonical Engine/D1 state → all downstream logic reads Engine/D1
```

Anti-pattern (forbidden):

```
RunSignup read → downstream re-read → publication re-read → verification re-read
```

Rules:

1. Ingest once. A single validated read at the source boundary produces
   canonical Engine/D1 state.
2. Downstream steps (processing, publication, verification, recognition,
   follow-up) read Engine/D1. They never re-fetch already-ingested source data
   merely to reconfirm it.
3. Contact the external source again only when genuinely new source data is
   required (a new event, transaction, donation, or a source record that has
   actually changed).
4. Do not add generic retry behavior as the solution to transient source errors
   (e.g. 522s). First eliminate unnecessary duplicate source reads; a smaller,
   non-redundant call surface is the fix. Retry, if ever used, is bounded and
   targeted — never a substitute for removing redundant calls.
5. This invariant applies to Revenue Engine ingestion as well: donation,
   transaction, refund, reversal, and chargeback facts are ingested once into
   canonical monetary state; attribution, fund accounting, and follow-up actions
   all read Engine state.

## Consequences

- Fewer external calls means fewer transient failures, lower load on source
  APIs, and compliance with the $0 operating-cost rule (no wasted egress or
  compute on redundant reads).
- Canonical D1 state is the single runtime truth; external sources are consulted
  only at ingestion boundaries.
- Existing and future RunSignup call sites must be audited against this rule;
  any downstream re-read of already-ingested data is a defect.
- This is a permanent architectural invariant unless explicitly replaced by a
  future ADR.
