# ADR-0020: Unified Board intake and next-meeting-first layout

Date: 2026-09-22. Owner directive: one intake window instead of two, and the
nearest meeting with its filling protocol at the top of the Board panel.

## Decision

1. The two intake forms ("Submit an initiative" and "Add a Board item") are
   merged into one: "Submit to the Board". Initiative becomes one item type in
   the dropdown, alongside the initiative-style inputs (THOUGHT, PROBLEM,
   OPPORTUNITY, TASK, SOURCE_MATERIAL). Rationale from the owner: an initiative
   usually appears as a question anyway, so two windows only confuse.
2. `BoardSubmissionType` and `BOARD_SUBMISSION_TYPES` now accept: QUESTION,
   INITIATIVE, PROPOSAL, THOUGHT, PROBLEM, OPPORTUNITY, TASK, REPORT,
   DISCUSSION, DECISION_REQUEST, REQUEST_TO_SPEAK, SOURCE_MATERIAL. No D1
   migration: `board_submissions.submission_type` has no CHECK constraint.
3. New submissions without an explicit `requested_meeting_date` auto-attach to
   the nearest upcoming DRAFT/OPEN meeting (`findNextBoardMeetingId` in
   `src/operating-center.ts`: dated upcoming first, then any undated Draft/Open)
   and enter its agenda as AGENDA immediately. The protocol therefore fills
   during the week on its own. Submissions with an explicit date stay PENDING
   for manual triage. The machine never invents meetings; auto-attach only uses
   a meeting the owner created.
4. Board meetings panel layout: the "Next meeting" card (title, date, status,
   protocol item count, the protocol list filling during the week, pending
   queue count, Open-workspace button) renders at the top; the meetings list
   follows; the "Schedule a meeting" form moved to the bottom of the panel.
5. The separate Initiatives queue panel is removed from the page. The
   `initiatives` table and its API endpoints remain in the backend untouched
   (no data loss, no migration), but the page no longer loads or renders them.

## Consequences

- One intake, one queue, one protocol card: a Board member opening the page
  sees the nearest meeting and what is already on its protocol.
- Manual agenda triage still exists for dated submissions and corrections.
- The weekly Sunday 2pm protocol formation (auto-create the Sunday meeting and
  sweep) is a separate step, not part of this ADR.

## Verification

- Vitest 165/165 (7 new tests: merged intake types accepted, next-meeting
  lookup returns id/null, page has one board form and no initiative form,
  INITIATIVE option present, next-meeting card above the list, create form
  below the list), TypeScript clean.
