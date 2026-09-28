# ADR-0043 — Event-driven results, Disqualify decision, unified progression matrix

Date: 2026-09-28
Status: accepted
Supersedes: ADR-0042 (extends it; the approval model is unchanged)

## Context

ADR-0042 gave the owner one reserved action (approve a result) and a daily
cron as the downstream trigger. Three gaps remained:

1. A fully-approved event waited for the next 06:17 UTC cron run instead of
   processing immediately — and `wrangler.jsonc` still carried an unexplained
   `*/5 * * * *` trigger that fired the Series processor every 5 minutes.
2. There was no Disqualify decision. The only owner action was Approve, so a
   bad result could only block the event forever.
3. The Operating Center and the public site computed athlete standings in two
   independent places, and the OC showed two long redundant tables
   (athlete pipeline + "Results by event and level").

## Decisions

### 1. Event-driven processing; cron is the fallback

After the last required owner decision (Approve OR Disqualify) on an event:

```
decision saved → evaluateEventTrigger(this event) →
if fire → autoProcessEvent immediately
```

The daily `17 6 * * *` cron remains only as a fallback: deadline
processing, missed-event checks (every non-published event of every
distance, not just the active one), future deadline-based objects.
`scheduled()` ignores any other cron schedule, and the `*/5` trigger was
removed from `wrangler.jsonc`. Standing rule "no cost-generating polling"
holds: the daily run is 1 request/day of the 100k/day Workers Free allowance.

History of the removed `*/5 * * * *` trigger (resolved 2026-09-28):
Sep 9 (Albert): added for the Trust Engine automation. Sep 18 (Albert):
"Remove unnecessary five-minute cron" — deliberately removed as
unnecessary. Sep 28 (ADR-0042): re-added conservatively with the comment
"origin unknown". Origin is now known; removal restores Albert's own
Sep 18 decision. The handler-side guard makes the removal safe even if a
stale trigger configuration persists anywhere.

### 2. Two owner sports decisions: Approve / Disqualify

- `series_result_disqualifications` (migration 0045): result_id, athlete,
  time, reason (required), decided_at, decided_by='owner', source.
- A disqualified result is "decided": it needs no approval and never blocks
  trigger A. It gives 0 points, is excluded from valid finishes and from
  the RunSignup standings upload, and is written back with empty
  Performance Level / Level Place fields. It displays as DSQ.
- Absence of a decision is NOT a disqualification: the result stays
  Submitted and blocks trigger A.
- DNS is never stored: registered + no submitted result after the deadline
  is a derived DNS, not a decision. DNS never appears before the deadline.
- `POST .../results/disqualify` (reason required, result must exist in live
  RunSignup data) and `POST .../results/clear-decision` (owner correction;
  returns the result to Submitted). Disqualify supersedes an approval on the
  same result.

### 3. One shared progression model

`src/series-2026-progression.ts` is pure (no D1, no fetch, no imports) and
is used by BOTH the engine and the site worker:

- rows = athletes, columns = events of one distance left→right by date,
  then Races / Best Time / Level-Division / Points / Rank;
- OC cells: Registered, Submitted, Approved · Processing, Exception, DNS,
  DSQ, or `time · level · points`;
- public cells: `time · level · points`, DNS, DSQ, or — (never Submitted /
  Approved / Processing / Exception);
- Races counts only approved valid finishes;
- standings stay bucketed by Performance Level + Gender with per-bucket
  ranks; an athlete scoring in several levels gets one bucket entry per
  level — never a mixed fake total;
- built for 7,000 athletes: distance filter, athlete search, event/date
  filter, server pagination, sticky athlete column, horizontal event
  scroll; never renders thousands of rows at once.

The OC "Results by event and level" table and the separate athlete
pipeline table were replaced by this matrix. The public "Season standings"
view is this matrix.

### 4. Deadline source

Submission deadlines come from RunSignup production truth
(`GET /rest/v2/vr-settings.json`, `virtual_result_settings.accept_results_end_ts`),
stored in `series_event_deadlines` with their source. A deadline is never
hardcoded. NULL = unknown: trigger B cannot fire and DNS cannot be derived.

## Consequences

- New tables: `series_result_disqualifications` (0045). New endpoints:
  `results/progression`, `results/disqualify`, `results/clear-decision`.
- `decideTrigger` accepts `disqualifiedResultIds`; `applySeries2026Levels`
  accepts `disqualifiedResultIds` and loads per-event decisions for the
  full-distance rebuild.
- Tests: trigger DSQ cases, progression matrix cell/bucket/rank cases,
  DSQ field-write cases. Full suite must stay green, tsc clean.

## Operating cost

VERIFIED $0 — no new services, no new polling, no new paid APIs.
