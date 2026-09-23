# ADR-0025: Self-running weekly Board loop

Date: 2026-09-23. Owner directive: the next meeting date must always
stand, on the main page and in the Board workspace, with the protocol
attached; board members' questions accumulate into that protocol during
the week; after a meeting closes, unresolved and deferred items carry
into the next protocol; no manual "Create meeting" for the ordinary
weekly cycle.

## Decision

### 1. Cadence lives in the database, not in code

Migration 0031 adds `board_settings` with the schedule the owner named
exactly once and never changed: weekly, Sunday, 14:00, America/New_York,
title "Weekly Board meeting". `getBoardCadence(db)` reads it;
`nextWeekdayDateInZone()` computes the next meeting day in that
timezone. The code falls back to the same defaults when the table is
missing (old database), so the page never breaks on the setting.

The date stays timezone-correct through DST because it is recomputed
per call in the meeting timezone, never frozen as a UTC instant.

### 2. The standing-meeting guarantee (no cron)

`ensureUpcomingMeeting(db)` returns exactly one upcoming DRAFT/OPEN
meeting: the nearest one when it exists, otherwise it creates the
cadence meeting for the next meeting day. Idempotent per date (the
same-day check means two callers never create two meetings for one
day).

Event-driven per the verified-requirements rule (ADR-0024): it runs on
`GET /api/board/meetings` (wrapped so it can never break the list) and
at meeting close. No timer, no poll, no cron. The honest limitation
stands unchanged: the machine acts on owner-authorized activity, but
whenever the owner looks, the next meeting date always stands.

### 3. Close-time rollover into the next protocol

`closeBoardMeeting` now ensures the next meeting first, then moves
every still-unresolved AGENDA item (including DEFERRED decisions, which
stay AGENDA by design) straight onto the next meeting's protocol:
AGENDA -> PENDING -> AGENDA on the new meeting. The response carries
`next_meeting_id` and `rolled_over` so the UI can show it.

### 4. Surfaces

- Main page board panel: "Next Board meeting: <date> · Sundays 14:00
  New York time", protocol item count, items waiting in the queue,
  work-item counts, link to the Board workspace. A new
  `GET /api/board/cadence` endpoint feeds the time line.
- Board workspace: the next-meeting banner shows date, time, protocol
  count, and queue count; protocol items already carry submitter and
  submission date (`submitted_by`, `created_at` from the detail API).
- The manual "Schedule a meeting" form stays for extra meetings only;
  the routine weekly meeting is never created by hand.

### 5. Tests

`test/board-weekly-loop.spec.ts` (11 tests): next-day math incl. the
Sunday-is-today case and a DST-edge week, cadence defaults and
override, create-once/idempotent ensure, reuse of an existing upcoming
meeting, submission auto-attach through `createBoardSubmission`,
weekly sweep, close-time rollover with author/date intact, and the
`new Function` inline-script checks for both pages. The existing
`board.spec.ts` close test now asserts the rollover instead of a bare
PENDING return.

## Consequences

- The weekly cycle needs no owner step between meetings: close ->
  next meeting exists -> submissions accumulate -> Sunday protocol.
- `formWeeklyProtocol` and `reconcileProtocolIfDue` now read the
  cadence from settings instead of hardcoded Sunday/New York.
- If the schedule ever changes, it is one settings row, not a deploy.
