# ADR-0042 — Owner approves results; Machine owns the downstream lifecycle

Date: 2026-09-28
Status: ACCEPTED (owner directive).
Supersedes: the manual-step operational model (owner runs APPLY_LEVELS,
standings rebuild, publication, news, social, promo as separate manual actions).

## Decision

The single owner-reserved action in the Series results pipeline is
**approval / verification of the athlete's result** (the sports accuracy of
the time). Everything after approval is standard Machine operating work and
runs without further owner prompts.

Per-event chain:

```
Registration → result submitted → owner approved → Machine processing
  → level / level place / points / standings
  → website results / Winners → winner news → social distribution
  → next-race promotion
```

The owner no longer separately runs: APPLY_LEVELS, standings rebuild,
result publication, winner news, Winners update, standard social
congratulations, standard next-race publication.

## Trigger: when the Machine closes an event and runs full processing

- **A. All expected results approved.** Every active registration for the
  event has a submitted result, and every submitted result is owner-approved.
  Waiting for the official submission deadline is then pointless — the
  Machine processes the event immediately.
- **B. Submission deadline reached.** The Machine processes all approved
  results; missing / unsubmitted / unapproved results are surfaced as
  exceptions. The standard lifecycle of the approved results continues
  automatically.

Trigger = all expected results approved OR submission deadline reached.
The submission deadline source must be verified against the official
RunSignup API (not guessed, not hardcoded).

## Human boundary (hard)

- The Machine NEVER auto-approves a sports result. Approval is the owner's
  responsibility, recorded per result.
- After owner approval, the Machine is authorized to run the entire standard
  downstream lifecycle autonomously.
- The Machine returns to the owner ONLY on a real exception: data conflict,
  missing registration, incorrect time, API failure, publication failure,
  ambiguous result↔athlete link, or another real blocker.

## Visibility

- Operating Center: a working athlete-lifecycle view per event —
  Registered → Submitted → Approved → Processed → Published — with a per
  athlete table (Athlete | Registered | Result submitted | Approved |
  Result | Level | Level Place | Points | Published) so the owner sees
  immediately who is stuck at which stage.
- Public site: the sports view only — athlete, time/result, level,
  level place, points, standings. No internal owner/admin stages.

## Consequences

- New data: per-result approval records; per-event submission deadline;
  per-athlete pipeline stage derivation.
- The RunSignup write-access probe (TEST_WRITE) becomes an automatic
  pre-flight check inside Machine processing, not an owner action.
- All downstream steps must be idempotent and audit-logged; any failure
  surfaces as an exception to the owner instead of failing silently.
- First production end-to-end test: 5K event 1173956 (2026-09-27),
  3 approved results.

Operating cost: VERIFIED $0.

Wake-up mechanism (verified 2026-09-28 against the official Cloudflare
limits and pricing pages):

- One daily cron trigger on the engine Worker evaluates the per-event
  trigger for all Series 2026 events and auto-processes every fired event.
- Cost: 1 cron execution = 1 request, counted against the Workers Free
  plan's 100,000 requests/day. One daily run consumes 1 request/day —
  $0, no plan change.
- Limit: 5 cron triggers per account on the Free plan; the account uses
  2 after this change (one pre-existing `*/5 * * * *` trigger with no
  handler in code, left untouched; one new daily trigger).
- The cron never approves anything: it only evaluates the trigger and
  runs the already-authorized downstream chain for events whose results
  the owner approved. Events already PUBLISHED are skipped.
- No other polling, no new services, no paid tiers.
