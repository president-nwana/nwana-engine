# ADR-0014: Routine next-race prep auto-confirms; owner gate kept for exceptions only

Date: 2026-09-22
Status: Accepted

## Context

The Series 2026 race lifecycle ended in `next_race_prep` for every upcoming
race: the engine built announcement + email drafts and then waited for the
owner to click "Confirm prep" before the distance could move to
`registration_open`. For routine races (complete event name and date) that
click added nothing but a human bottleneck: the September 26/27 weekend
races sat in `next_race_prep` with `prep_confirmed=false` while their
announcements were already being distributed by hand. The machine did not
move; the owner did.

## Decision

Routine next-race prep now auto-confirms during the lifecycle sync. When the
previous event is done and the active event is a future race:

- the engine builds (or reuses) the prep drafts as before;
- `detectPrepExceptions` checks the prep inputs: a missing event name or
  date is a genuine exception (the announcement cannot be built truthfully);
  everything else, including a missing registration URL (which falls back to
  the Series hub link), is routine;
- with no exceptions, prep is marked `AUTO_CONFIRMED`, `prep_confirmed`
  becomes true, and the distance moves straight to `registration_open`;
- with exceptions, the distance stays in `next_race_prep` with
  `prep_confirmed=false`, and the owner action names the exact missing
  piece (e.g. "missing event name") instead of asking for a vague approval.

A previous manual confirmation is always respected: if the owner confirmed
prep (including an exception case via the existing prep-confirm endpoint),
the sync never downgrades it back to `next_race_prep`.

Nothing about sending changes: announcement `send` stays manual and the
email `send` stays "manual in Email Marketing Dashboard". This ADR removes
the state gate, not the human last mile on sends. RunSignup writes are
untouched (still dry_run; write access still UNKNOWN).

## Consequences

- `NextRacePrep` gains `status: "DRAFT" | "AUTO_CONFIRMED"` and
  `exceptions: string[]`, both persisted inside the existing `prep_json`
  column (no migration).
- `GET /api/operating-center/race-lifecycle` now exposes
  `owner_action: string | null` per distance; the operating center renders
  the concrete review reason next to the Confirm prep button. (The UI
  previously referenced `d.owner_action`, which the API never returned;
  that dead reference now resolves.)
- The manual `POST .../race-lifecycle/prep-confirm` endpoint and button
  remain as the override for exception cases.
- Tests: routine prep auto-confirms (3K/5K live rows verified to flip on
  the next sync), exceptions hold `next_race_prep` with a named reason,
  manual confirmation is never undone. Full suite 92/92, `tsc --noEmit`
  clean.
