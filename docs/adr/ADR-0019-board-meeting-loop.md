# ADR-0019: Board Meeting Loop

Status: Accepted
Date: 2026-09-22

## Context

ADR-0006 designed the operating center's Board workspace with six work
areas, and migration 0018 created the tables for it: initiatives,
board_meetings, board_submissions, board_decisions, decision_requests, and
work_items. But only intake was ever implemented (POST/GET /api/initiatives
and /api/board/submissions). Nothing could happen to a submission after it
was filed: no meeting could be recorded, no agenda built, no decision
stored, no work tracked. The board_meetings, board_decisions, and
work_items tables existed and were never written, so the weekly Board
meeting had no machine loop at all.

## Decision

Close the meeting loop with the smallest piece that makes the Board
workflow usable end-to-end for a solo owner running weekly meetings,
reusing the existing tables with no schema change:

- Meeting: DRAFT -> OPEN -> CLOSED. Created with a title and scheduled
  date; opened with attendees recorded as written by the owner; closed
  with minutes.
- Agenda triage: PENDING submissions are assigned to a DRAFT or OPEN
  meeting and move to AGENDA. Items still on the agenda when the meeting
  closes return to PENDING, so they carry into the next meeting's
  preparation (ADR-0006: "carries unresolved items into the next requested
  briefing").
- Decision: recorded only in an OPEN meeting, with outcome CONFIRMED,
  DEFERRED, or REJECTED, plus responsible person, due date, and optional
  vote record. A linked submission must be on the meeting's agenda.
  CONFIRMED and REJECTED mark the submission DECIDED; DEFERRED leaves it
  on the agenda.
- Work item: a CONFIRMED decision with a responsible person or a due date
  immediately becomes a tracked work item (ADR-0006: "A confirmed decision
  immediately becomes one or more linked work items"). Lifecycle:
  READY -> IN_PROGRESS -> DONE, with BLOCKED as a side state and
  one-step corrections backward. DONE is terminal.
- Initiative: NEW -> UNDER_REVIEW -> APPROVED -> CONVERTED, with
  UNDER_REVIEW -> DECLINED as the exit, so the intake queue is triageable
  instead of accumulating NEW items forever.

New module `src/board.ts` follows the fund/sponsorship-asset pattern:
pure state machines plus D1 functions. New owner-key-protected endpoints
(all under /api/board/* and /api/initiatives, already covered by the
ADR-0007 gate):

- POST /api/board/meetings, GET /api/board/meetings,
  GET /api/board/meetings/:id (meeting + agenda + decisions)
- POST /api/board/meetings/:id/open, /agenda, /close
- POST /api/board/decisions
- GET /api/board/work-items, POST /api/board/work-items/advance
- POST /api/initiatives/advance

The operating center gains a Board meetings panel (create, open with
attendees, agenda triage from the pending queue, per-agenda-item decision
recording, close with minutes), a work-items panel with stage advance,
and initiative stage-advance buttons in the initiatives queue. Empty
states stay explicit ("No meetings yet", "Agenda is empty", "No
decisions recorded yet").

## Consequences

- The machine never invents Board members, meetings, or decisions: every
  record is created by an explicit owner action.
- No emails, no notifications, no Gmail integration of any kind.
- No RunSignup writes. No new tables, no migration, no seeding.
- decision_requests remains read-only in the overview count; no endpoints
  were added for it in this change.

## Verification

- Vitest 158/158 (9 new board tests covering the full loop:
  create -> open -> triage -> decide -> work item -> close with
  carryover, plus rejection paths).
- `npx tsc --noEmit` clean.
