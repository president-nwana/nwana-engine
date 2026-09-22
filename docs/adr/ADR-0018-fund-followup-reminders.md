# ADR-0018: Fund follow-up reminders

Date: 2026-09-22
Status: Implemented and deployed

## Context

ADR-0015 made Fund a first-class machine object with an enforced prospect
lifecycle (prospect -> verified -> drafted -> sent -> follow_up ->
committed -> stewardship -> recognition). The operating-center Fund panel
shows per-prospect next actions, but nothing computed WHEN a follow-up is
due. The standing rule is one follow-up per sent letter at 2-3 weeks; with
15 Pool 4 letters sent 2026-09-22, the machine could not answer the one
question that matters: which follow-ups are due right now.

## Decision

1. Pure, tested follow-up logic in `src/fund-followup.ts`:
   `follow_up_due_at = sent_at + 14 days` (the follow-up window opens).
   Status is derived per render and never stored, so it cannot drift:
   `upcoming` (now < due date), `due` (due date <= now < sent_at + 21 days),
   `overdue` (now >= sent_at + 21 days with no follow-up).

2. Only a prospect sitting at stage `sent` can have a due follow-up.
   Every other stage, including `follow_up` (the follow-up was already
   sent), reports `none`. Prospects with no `sent_at` have no due date.

3. No D1 migration. The due date and status are computed in the fund view
   from the stored `sent_at` + stage. Storing them would create a second
   source of truth that can drift; the dates themselves are the truth.

4. The fund view (`GET /api/operating-center/fund`, still owner-key
   protected, 401 without the key) now returns per prospect
   `follow_up_due_at` and `follow_up_status`, and per fund
   `follow_ups_due_now` (due + overdue). The `sent`-stage next action
   names the concrete due date: "Follow-up due 2026-10-06."

5. Operating-center Fund panel (English only): a "Follow-ups due now: N"
   summary at the top of each fund, and per-prospect follow-up lines with
   visual due/overdue states. The panel states that the owner presses Send;
   the machine never sends.

6. A follow-up NEVER sends anything. When one becomes due, the machine
   surfaces it; the owner still presses Send. No emails, no drafts are
   created automatically. This is a tracking and surfacing change only.

## Consequences

- Follow-ups stop depending on anyone's memory or calendar: the operating
  center shows exactly which of the 15 sent letters need a follow-up and
  when, derived only from the factual stored send dates. No dates are
  invented.
- The pattern generalizes: any future fund seeded with `sent_at` values
  gets follow-up reminders automatically, with no new stored state.
- No new external sends were automated. The only human gate is unchanged:
  Send stays with the owner by design.
