# ADR-0023: Lifecycle rows to the results page + button menu under the header

Date: 2026-09-22. Owner directive (from his phone): (1) the "Series 2026
race lifecycle" per-distance rows cluttering the main operating-center page
must move onto the results page; (2) a button menu under the header.

Note: an unrelated in-flight change in the working tree labels itself
"ADR-0023: activity feed"; it is uncommitted and undeployed and is NOT part
of this ADR. If it ships later it needs a new number.

## Decision

1. The "Race results" link in the lifecycle panel already pointed at the
   dedicated page `GET /operating-center/results` (`renderRaceResultsHtml`),
   so the rows were extended there rather than on a new route. The results
   page now opens with a "Series 2026 race lifecycle" panel showing the FULL
   per-distance rows, verbatim as they appeared on the main page: stage
   headings, event name/date, write access, synced_at, owner actions, and
   the "Confirm prep" button posting to
   `/api/operating-center/race-lifecycle/prep-confirm`. The existing
   results/sync functionality below it is untouched. The page still
   auto-syncs every distance on open, and the lifecycle panel reloads from
   `/api/operating-center/race-lifecycle` at the same boot moment.
2. The main `/operating-center` page replaces the inline rows with a compact
   summary card: counts by stage (e.g. "1 × registration_open · 2 ×
   awaiting_results") plus "N preps need review" (highlighted when
   nonzero) and an "Open results →" link. The lifecycle card follows the
   same pattern as the ADR-0022 funds card.
3. All three operating-center pages (Overview, Results, Funds) now share one
   button menu rendered directly under the header: `operatingCenterMenu()`
   in `src/operating-center.ts`, imported by the funds page. Buttons:
   Overview → `/operating-center`, Results → `/operating-center/results`,
   Funds → `/operating-center/funds`; the current page is marked with
   `aria-current="page"` and a distinct active style. Same visual language
   as the existing UI (brand-colored buttons, wrapping flex row,
   mobile-friendly). The old "← Back to Operating Center" links on the
   Results and Funds pages are removed as redundant.
4. No migration, no API change, no new endpoints. Auth behavior unchanged:
   HTML pages render, API endpoints return 401 without the owner key.

## Consequences

- The main operating-center page is now an overview of summary cards; heavy
  operational lists (lifecycle rows, fund pipelines) live on their own
  pages, reachable from the menu in one tap.
- The lifecycle action buttons (Confirm prep) remain owner-key-protected and
  keep working against the same APIs.
- The inline-JS regression convention from the ADR-0022 hotfix is extended:
  every operating-center page with client script now has a test asserting
  its `<script>` blocks parse via `new Function`.
