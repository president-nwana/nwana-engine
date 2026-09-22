# ADR-0015: Fund as a first-class machine object

Date: 2026-09-22
Status: Implemented and deployed

## Context

The NWANA machine's operating loop is OBJECT -> MONEY OR CONVERSION ->
AUDIENCE -> SPONSORSHIP -> DISTRIBUTION -> NEXT OBJECT. Until now the
engine only modeled competition objects (Series 2026, race lifecycle).
Fundraising ran outside the machine: letters drafted in chat, pipeline
tracked in a markdown outreach log. The machine could not see a fund,
could not track a prospect through follow-up, and could not route a
commitment into stewardship and public recognition.

The owner asked, bluntly, what the machine does besides races. The
answer is this ADR: Fund becomes a first-class machine object with its
own lifecycle, API, and operating-center panel.

## Decision

1. New object type `Fund` in D1: `funds` (name, slug, goal, raised,
   currency, status, description) and `fund_prospects` (name, email,
   stage, ask amount/tier, subject, one-pager version, sent date,
   stage timestamps, notes). Migration 0025.

2. Prospect lifecycle, enforced in code, not in anyone's head:
   prospect -> verified -> drafted -> sent -> follow_up -> committed
   -> stewardship -> recognition.
   Forward flow plus one-step corrections backward, plus the direct
   sent -> committed path. `recognition` is terminal. Skipping stages
   is rejected with the exact allowed moves.

3. The owner still presses Send and signs. The machine never sends
   outreach itself: it tracks pipeline state, surfaces the next action
   per stage, and routes committed funds into stewardship and public
   recognition. This is a tracking and routing object, not an
   auto-mailer. Mass email stays on RunSignup/TicketSignup Email V2;
   Gmail stays out of the engine (AGENTS.md email boundary).

4. First live object: the $50K Manhattan HQ Bridge Sprint, seeded with
   the factual Pool 4 pipeline: 15 prospects, all at stage `sent`,
   owner pressed Send 2026-09-22, one-pager v5 attached. Seed is
   idempotent.

5. Operating center shows each fund with goal/raised, per-stage counts,
   every prospect with its next action, and a one-click stage advance
   (owner key required, like every other operating-center action).

## Consequences

- The machine now models money objects, not just races. The next
  objects (Sponsorship Asset, Partner Opportunity, Challenge) follow
  the same pattern: table + lifecycle + API + panel.
- Follow-ups stop depending on memory: the `sent` and `follow_up`
  stages with their next actions make the waiting pipeline visible.
- Committed amounts accumulate in `raised_amount` toward the goal,
  visible on the same panel as the prospect list.
- No new external sends were automated. The only human gate that
  changed is none: Send stays with the owner by design.
