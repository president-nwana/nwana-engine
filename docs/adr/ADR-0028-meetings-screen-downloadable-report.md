# ADR-0028: Meetings operating-center screen with downloadable report

Date: 2026-09-23
Status: Accepted, deployed

## Context

The owner ordered one more operating-center screen: Meetings. The machine
knows two kinds of meetings, kept on one screen for the first time:

- External meetings (Integrity 9 call Fri 2026-09-25 2:00pm CT, Zubie Five
  intro call proposed for the week of Sep 28) — facts previously scattered
  across the outreach registry, memory, and the sellers screen.
- Board meetings (the D1 `board_meetings` table) — previously visible only
  inside the board workspace, with no public-readable log of upcoming and
  past meetings.

The concrete trigger: the Integrity 9 call now has a confirmed Teams join
link, meeting ID, and passcode. Those credentials must be shown to the
owner (the screen is owner-gated) but must never leak into the
downloadable report that can be handed to an outsider.

## Decision

New page `/operating-center/meetings` (English only, owner-key auth model
unchanged, public GET HTML shell like every other operating-center page),
following the exact ADR-0027 pattern:

- External meetings section: curated code data in
  `src/operating-center-screens.ts` (`EXTERNAL_MEETINGS`), real entries
  only. Integrity 9 (Fri 2026-09-25, 2:00-3:00pm CT / 3:00-4:00pm ET /
  10:00-11:00pm Riga, Microsoft Teams, status confirmed, one-line purpose
  + next step) and Zubie Five (proposed Tue-Thu week of Sep 28, 2026,
  booking page, status awaiting scheduling, next step). The Teams join
  URL, meeting ID, and passcode render on the owner-gated screen only.
- Board meetings section: `getMeetingsOverview(db)` runs a read-only
  SELECT over `board_meetings` (same query shape as `listBoardMeetings()`
  in `src/board.ts`, no Response wrapper). Upcoming = DRAFT/OPEN (date/
  time, title, agenda count); past = CLOSED (date, minutes
  recorded/absent — never the minutes content — decision count). No
  side effects: it never creates or changes a meeting. Empty table shows
  the honest "No board meetings recorded yet".
- New JSON overview API `/api/operating-center/meetings/overview`,
  owner-key protected, same as the other seven.
- New report endpoint `GET /api/operating-center/report/meetings`,
  owner-key protected: self-contained HTML (inline styles, `@media print`
  CSS), the screen's current real data, the report date, and nothing
  internal — no join URLs/IDs/passcodes, no owner keys, no internal
  notes, no email addresses. Downloaded as
  `nwana-meetings-report-YYYY-MM-DD.html` via the existing `reportFile`
  helper. The report explicitly notes that meeting links and passcodes
  stay on the owner-gated screen.
- The shared `operatingCenterMenu()` now has 16 buttons (Meetings added),
  still a wrapping flex row under the header on every page, current page
  marked `aria-current="page"`.
- Main `/operating-center` page: one compact meetings summary card (tracked
  external meetings with the next upcoming one, board-meeting count in
  the log) + "Open meetings →". The page stays a dashboard.

## The no-fabrication rule, enforced

External meetings are two verified entries only; the registry and the
repo turned up no other real meetings, so nothing else was added. Board
meetings come from a live read of D1; an empty table renders an honest
empty state, never zeros presented as data.

## Verification

- Vitest 250/250 (4 new tests in
  `test/operating-center-screens.spec.ts`, bringing the spec to 33):
  16-button menu on every page with correct active state on the meetings
  page, `new Function` script-parse regression test for the meetings page,
  meetings overview returns the two real external entries with join data
  present in the overview JSON (screen-only), the meetings report is
  dated, print-friendly, and contains no join URLs, meeting IDs,
  passcodes, keys, or email-address pattern.
- TypeScript clean.
- Live: `/operating-center/meetings` 200 with the 16-button menu; main
  page 200, dashboard-only; `/api/operating-center/meetings/overview`
  and `/api/operating-center/report/meetings` 401 without the owner key.

## Consequences

- The Integrity 9 call details live in the machine for the first time:
  the owner can open the meetings screen on Friday and join from the
  link, without digging through email.
- The board meeting log is now a first-class, reportable view; a closed
  meeting's minutes presence and decision count are visible at a glance.
- When new real meetings are confirmed, they are added to
  `EXTERNAL_MEETINGS`; board meetings appear automatically from D1.
