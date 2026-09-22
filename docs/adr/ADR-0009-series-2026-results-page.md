# ADR-0009: Series 2026 Results Page (Final Decision)

Status: Accepted

Date: 2026-09-22

Decision owner: Albert Fatikhov, President and Product Architect, NWANA

## Context

The first results-page deployment (2026-09-22) shipped with defects the owner
rejected:

1. RunSignup returns event dates in US format (`10/10/2026`). The sync sliced
   the first 10 characters assuming ISO, so October races compared as
   "earlier" than September and all six distances wrongly showed future
   events as `awaiting_results`.
2. The results page listed every synced event instead of only past races.
3. Manual sync buttons remained, forcing the owner to decide when to press a
   technical sync.
4. No publication status, no RunSignup results link, and no clear per-distance
   sync/error status.
5. A transient RunSignup 522 had no bounded retry policy.

## Decision

1. Date normalization: `normalizeRunSignupDate()` converts RunSignup US
   dates (`M/D/YYYY`, including the real `start_time` form `M/D/YYYY HH:MM`),
   ISO dates, and ISO datetimes into `YYYY-MM-DD`.
   Anything else returns null, so a race is never classified from a guessed
   date. Past/future comparison, event sorting, and active-event selection
   all operate on normalized dates.
2. The results page (`/operating-center/results`) shows only past races,
   newest first. Future races never appear there, regardless of their stored
   date format.
3. Refresh is automatic on page open and on ordinary reload. The stored
   owner key authorizes the sync calls; no manual sync buttons exist on the
   page. This is an explicit owner action (opening the page), not polling,
   cron, or a timer.
4. A transient RunSignup 522 gets exactly one immediate retry. No delays,
   no timers, no polling. A second failure surfaces as a per-distance error
   on the page.
5. Each event row shows publication status (`PUBLISHED`, `BASELINE`,
   `PENDING`) and the full RunSignup results link when available. Each
   distance shows a clear sync status (synced, or failed with the error).
6. The main operating-center page stays compact: summary stats, lifecycle
   stages, initiatives, Board queue, and navigation to the results page.
7. Federation-complete results tables: every past event renders all five
   performance levels in order, with their time thresholds, even when a
   level had no finishers (shown as "No finishers in this level"). The
   table is complete by structure, not by participation: the page looks
   the way a major federation's results page looks whether a level has
   2367 finishers or zero. The server ships the per-distance level
   definitions with the results view; the client groups rows by level.

## Consequences

- The owner never thinks about when to sync; opening the results page is
  the sync.
- Future races cannot leak into the results view or be treated as finished.
- A failed sync is visible per distance instead of silently stale.
- No background work of any kind is introduced by this page.

## Regression protection

Vitest covers: US/ISO date normalization (including the real `M/D/YYYY
HH:MM` `start_time` form), a future October race never leaving
`registration_open`, the results view excluding future and undated events
and sorting newest first, the results view shipping all five level
definitions per distance, exactly one retry on 522 and no retry on other
errors, and the absence of manual sync buttons on both pages.
