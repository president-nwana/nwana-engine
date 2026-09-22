# ADR-0022: Funds on their own page

Date: 2026-09-22. Owner directive: the Funds list had become a long inline
section on the main operating-center page (unusable on a phone). Move it onto
its own page, like race results.

Note: ADR-0021 is reserved for the media plan workspace; it is a separate,
not-yet-shipped change and is not part of this ADR.

## Decision

1. New dedicated page `GET /operating-center/funds` (`renderFundsHtml` in new
   `src/operating-center-funds.ts`), following the `/operating-center/results`
   pattern: the HTML page itself renders without the owner key (same as the
   other operating-center pages); the API endpoints behind it require the
   owner key. The page shows the FULL existing Funds functionality, unchanged:
   fund objects with goal/raised and per-stage counts, every prospect with its
   stage, ask tier, sent date, follow-up state (upcoming / due / overdue) and
   next action, plus the one-click stage-advance buttons (e.g.
   "Move to Follow-up") posting to
   `/api/operating-center/fund/prospect/advance`. A back link returns to
   `/operating-center`.
2. The main `/operating-center` page no longer renders the inline Funds list.
   It shows a compact summary card: fund names, raised vs goal total,
   "N follow-ups due now" (highlighted when nonzero), and an
   "Open funds →" link to the new page.
3. The dedicated page uses the same `nwana_operating_center_key` localStorage
   slot as the main page, so the owner key carries over without re-entry.
   Auth behavior is unchanged: HTML pages render, API endpoints return 401
   without the key.
4. No migration, no API change, no new endpoints. Every other panel on the
   main page is untouched.

## Consequences

- The main operating-center page stays an overview: one card per area, heavy
  lists live on their own pages. Same pattern already used for race results.
- The full fund pipeline (including the stage-advance buttons the owner uses
  from his phone) is preserved verbatim, just on a focused page.

## Verification

- Vitest 169/169 (4 new tests: dedicated page renders full pipeline UI with
  advance actions, same key storage as main page, main page shows summary
  card with link, main page no longer renders the inline funds list),
  TypeScript clean.
