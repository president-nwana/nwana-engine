# ADR-0051 — Durable scored snapshot: accepted results are never re-verified against RunSignup

Date: 2026-10-28
Status: ACCEPTED (owner directive, production incident of 2026-10-27/28).

## Context

The Series 2026 auto-process treated two kinds of facts differently:

- **Approvals** were already durable: `evaluateEventTrigger` persists an
  observed approval to D1 (`series_result_approvals`) and never re-queries
  RunSignup to reconfirm it. A later 5xx/522 cannot revoke it.
- **Publication** was already D1-first: the owner's 2026-09-28 rule in
  `executeResultPublication` requires building the draft from the canonical
  D1 snapshot (`buildPublicationDraftFromD1`); a RunSignup outage must not
  block publication of an approved/finalized event.

The legacy completion path between those two points violated the same
principle. On every run, `autoProcessEvent`:

1. called `previewSeries2026ResultPublications` live at `detect_scoring`
   (race metadata + result sets + results) and fail-stopped on any error;
2. made a second live `/rest/race/{id}` call inside
   `upsertLegacyEventSnapshot` for the event name/date, after detection
   had already succeeded;
3. called the whole-race live preview a second time in the publication
   step to obtain the draft.

The scored rows (Performance Level, Level Place) existed nowhere in D1
until the mid-run snapshot upsert, so nothing could be reused. On
2026-10-27 and 2026-10-28 the RunSignup API answered the 06:17 UTC runs
with HTTP 522, `detect_scoring` failed closed, and the fully scored,
owner-approved October 24 3K (race 210000, event 1177637) and October 25
5K (race 209477, event 1173957) were neither finalized nor published —
two days in a row, for data RunSignup had already given.

GitHub issues #3 and #4 (2026-10-28) record the incident and the owner's
requirement of a permanent architectural fix, not retries or timeout
changes.

## Decision

The complete scored dataset of an event is captured **once** and is then
an accepted durable fact in D1:

1. `readFinalizedSnapshot` reads the event's canonical snapshot
   (`race_event_results`, finalized=1) — scored rows plus the stored
   publication key (migration 0100). When it exists, `detect_scoring`
   runs `detectLegacyScoring` over the stored rows with **zero RunSignup
   reads**, and `sync_finalized` only re-marks the lifecycle stage.
2. The live per-event preview runs **only** to acquire a snapshot that
   does not exist yet. Its failure with no snapshot present still fails
   closed with the existing "refusing to guess" behavior; incomplete
   fields still stop the run with WAITING_FOR_LEGACY_SCORING. Nothing is
   fabricated: approval rows alone (result id, athlete, time) never stand
   in for levels/places.
3. The first acquisition persists rows, results URL, and publication key
   together in `upsertLegacyEventSnapshot`. Its race-metadata fetch
   (event name/date) is best-effort with D1/draft fallbacks — it can no
   longer block persisting already-captured rows.
4. The publication step builds its draft via `buildPublicationDraftFromD1`
   from the stored key. The live whole-race preview remains only as a
   fallback for snapshots written before the key was stored.
5. `finalized` and `publication_status` stay monotonic (the upsert never
   resets PUBLISHED), and re-runs are idempotent: an already-published
   event short-circuits in `executeResultPublication`, so a D1-only retry
   produces no duplicate Meta posts or news.

## Consequences

- A RunSignup 522 after an event's acquisition is irrelevant to that
  event; a 522 before acquisition delays only the acquisition itself.
- The daily cron's per-event RunSignup subrequest cost drops to zero for
  every already-captured event, which also removes the starvation class
  fixed on 2026-10-13 from recurring through this path.
- Owner-authorized corrections remain possible through the existing
  manual paths (OC process-now with a live preview fallback, clear-decision,
  rebuild); the automatic path never silently overwrites an accepted
  snapshot from a live re-read.
- Regression tests (test/series-2026-auto-process.spec.ts): acquisition
  persists rows + publication key; a second run with RunSignup at 522
  completes from D1 with zero RunSignup calls and no duplicate
  deliveries; no snapshot + 522 fails closed at detect_scoring.
