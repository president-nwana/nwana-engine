# ADR-0026: every operating-center panel gets its own screen

Date: 2026-09-23. Status: accepted and deployed.

## Context

The owner opened the main `/operating-center` page on his phone and said it
was overloaded: even he found it inconvenient, and for anyone else it would
be worse. He asked whether every panel could have its own screen.

By then the main page already had dedicated pages for Results (ADR-0023),
Funds (ADR-0022), Media (ADR-0021), Board and Uploads (ADR-0024). Two full
panels still lived on the main page: the Activity feed (requires-reading +
what-is-new with mark-as-read buttons) and Sponsorship assets (generate
form + asset list). Those two got their own pages in this ADR. The main
page is now a dashboard: header, menu, summary cards only.

## Decision

- New page `GET /operating-center/sponsorship` (`renderSponsorshipHtml()`
  in `src/operating-center-sponsorship.ts`): the full generate form, the
  asset list with package/audience/delivers/reference-pricing/next-action,
  and per-asset "Move to <stage>" buttons posting to the existing
  `/api/operating-center/sponsorship-assets/advance` (server validates
  transitions; the page mirrors the server transition map). Auth model
  unchanged: page renders with the in-page key gate, APIs 401 without the
  owner key. The new GET routes are added to the public-HTML allowlist in
  `src/index.ts` next to the other page routes.
- New page `GET /operating-center/activity`
  (`renderActivityHtml()` in `src/operating-center-activity.ts`): the full
  feed verbatim from the main page - "Requires reading" with "Mark as
  read" buttons (POST
  `/api/operating-center/activity/acknowledge`), "What is new". The
  activity page shows the 30 newest items instead of the main page's 10.
- The main page keeps only compact summary cards: the Activity card shows
  the requires-reading count (highlighted when nonzero) and the 3 newest
  headlines; the Sponsorship card shows asset counts by stage. Both link
  to their pages. The stats strip, lifecycle/fund/media/uploads/board
  summary cards, the board queue summary, and the static "What board
  members can do" panel stay as they are.
- The shared `operatingCenterMenu()` grows to 8 buttons: Overview,
  Results, Funds, Media, Board, Uploads, Sponsorship, Activity. Same
  wrapping flex row, mobile-friendly, current page marked with
  `aria-current="page"` and the active style, rendered under the header
  on every operating-center page.

## Panel-to-page map (final)

| Panel | Page |
|---|---|
| Stats strip, summary cards | `/operating-center` (dashboard) |
| Series 2026 race lifecycle rows | `/operating-center/results` |
| Funds pipeline | `/operating-center/funds` |
| Media plan workspace | `/operating-center/media` |
| Board workspace | `/operating-center/board` |
| Board uploads | `/operating-center/uploads` |
| Sponsorship assets | `/operating-center/sponsorship` |
| Activity feed | `/operating-center/activity` |

## Consequences

- No migration, no new API endpoints, no API behavior change. Auth
  unchanged.
- Verified: Vitest 217/217 (12 new tests in
  `test/operating-center-split.spec.ts`: menu lists all 8 pages with
  correct active state under the header on every page, main page carries
  only summary cards, both new pages carry full functionality, `new
  Function` script-parse regression tests for both new pages),
  TypeScript clean.
