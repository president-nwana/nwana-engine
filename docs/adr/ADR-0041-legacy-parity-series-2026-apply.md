# ADR-0041 — Legacy parity: port NWANA-FINAL.ps1 result-processing semantics into the Series 2026 apply path

Date: 2026-09-27
Status: UPDATED (correction 2026-09-27 ~20:00 EDT). The first apply after
this ADR (Event 1177636, 2026-09-27) destroyed the historical 3K series
standings. The initial diagnosis ("per-event clear_previous_results=T wiped
history") was IMPRECISE. The precise mechanism, established by re-reading
NWANA-FINAL.ps1 line by line:

- The standings upload URL carries `event_id`, so `clear_previous_results=T`
  is scoped to (series, year, race, EVENT, scoring type). The legacy script
  itself does per-event clear+upload on every run — it is safe by construction.
- The historical standings lived under the 10 legacy pre-v4 scoring-type
  names/IDs (186, 187, 188, 189, 190, 191, 226, 227, 228, 229).
- The Machine's apply (1) created the 10 v4 types, (2) uploaded ONLY the new
  event's rows into the v4 types, then (3) ran the legacy scoring-type cleanup,
  which DELETED the 10 legacy types — and with them every historical standings
  row. The public leaderboard then showed only the v4 types with a single event.
- NWANA-FINAL.ps1 deletes legacy types only AFTER rebuilding ALL events under
  the new names. The Machine deleted them after rebuilding ONE event.

Corrected hard rule: legacy scoring-type cleanup may run ONLY after the full
distance has been rebuilt into the current types with zero errors. (The
"clear only inside a full rebuild" rule stands as defense in depth.)
Superseded by the distance-scoped rebuild on branch
`feature/series-2026-standings-rebuild`: one owner-confirmed apply now rebuilds
the WHOLE distance (every event, every result set), exactly like the legacy
sweep. Regression gate: multi-event rebuild test + idempotency test
(`test/series-2026-standings-rebuild.spec.ts`).

## Context

The real NWANA-FINAL.ps1 (684 lines, read fully 2026-09-27; never executed in
production) is the battle-tested source of truth for Series 2026 result
processing. The Machine's apply path (`src/series-2026-apply.ts`, created the
same day) diverged from it. On 2026-09-27 the Machine ran its first real
apply (Albert's 2026-09-26 3K result: Race 210000, Event 1177636, Result Set
664979, Result 232501676, clock 18:54, chip_time blank) and failed at the
standings step: result rows carry no `registration_id`/`user_id` (manual
result entry, not linked to a registration), so the BETA lookup endpoint
returned zero matches and points were never uploaded.

Line-by-line comparison of the legacy script against the Machine established
these exact divergences:

1. **Participant mapping**: legacy reads the parallel `resultSet.registration_ids`
   array (index-aligned with results, count-validated) and resolves participants
   via `POST /rest/v2/race-series/race-series-participants/add/registration-id.json`
   (creates-or-returns-existing, 1-based row mapping). The Machine looked for
   `registration_id`/`user_id` per result row (absent in real manual-entry
   results) and used the BETA `lookup.json` endpoint, which fails silently
   instead of resolving.
2. **Result sets**: legacy processes all result sets; the Machine picked the
   first valid one.
3. **Scoring types**: legacy ensures all ten level x gender types per distance;
   the Machine created only types present in the current results.
4. **Standings clearing**: legacy re-sends all ten groups with
   `clear_previous_results=T` (empty groups send empty `scoring_data`, clearing
   stale standings); the Machine sent only non-empty groups without the clear
   parameter.
5. **Legacy scoring cleanup**: legacy deletes pre-v4 scoring types after a
   clean distance run; the Machine had no cleanup.
6. **Result columns**: legacy customizes public detailed-result columns
   (hides standard Place, shows Performance Level + Level Place); the Machine
   did not.
7. **Result write payload**: legacy sends full rows (all original fields,
   `registration_id`, preserved custom-field-* values) with the two NWANA
   fields; the Machine sent sparse rows (result_id + two custom fields).
8. **Order**: legacy — scoring types, results, compute, participants,
   standings, custom fields, result writes, columns, cleanup. The Machine —
   custom fields, result writes, scoring types, standings.
9. **Scope**: legacy processes all events/result sets of the distance per run
   (the outer loop is the distance; the sweep re-reads every event before
   any standings replacement). The Machine's owner-gated apply covered one
   event/result set per run. On 2026-09-27 the Machine's first real apply
   therefore loaded only Event 1177636 with `clear_previous_results=T` and
   destroyed the historical 3K series standings (root cause, discovered
   ~19:00 EDT the same day).

## Decision

Port the legacy semantics into the Machine's apply path (`src/series-2026-apply.ts`,
`buildSeries2026LevelsWritePlan` in `src/race-lifecycle.ts`), **reproducing
first, improving only explicitly**:

1. `readAndComputeLevels` returns `registrationIds` (integer|null) from the
   parallel `registration_ids` array; a count mismatch aborts the apply.
2. `resolveSeriesParticipants` uses `add/registration-id.json` with
   `columns: ["registration_id", "user_defined_id"]` and 1-based row mapping;
   incomplete mapping aborts.
3. `ensureScoringTypes` is driven by `allScoringTypeNames(distance)` — all ten
   types; existing list call factored out into `listScoringTypes`.
4. `uploadSeriesStandings` iterates all ten types (empty groups included) with
   `clear_previous_results=T`; any `failed_race_series_participant_id` aborts.
5. `buildResultFieldRows` builds full legacy-style rows: all original fields,
   `registration_id`, preserved custom-field-* values, plus the two NWANA
   fields as `custom-field-<id>`.
6. `customizeResultSetColumns` reproduces the legacy 12-column layout
   (race_placement hidden including individual results).
7. `removeLegacyScoringTypes` deletes pre-v4 names (same level/gender names
   without the "; tie: best time" suffix) after a clean run; unrelated types
   never touched.
8. Apply order now: read_and_compute -> ensure_scoring_types ->
   resolve_participants -> upload_standings -> ensure_custom_fields ->
   write_result_fields -> set_result_columns -> cleanup_legacy_scoring_types.
9. NEW (2026-09-27, after the standings-destruction incident): the apply is a
   DISTANCE-SCOPED REBUILD. `listDistanceEvents` reads the race's live event
   list (Bearer-only, like the legacy script); `applyEventResultSet` runs the
   full inner body per (event, result set) — compute -> participants ->
   standings (all ten groups, clear=T per event) -> custom fields ->
   full rows -> columns. Per-event failures are collected and the sweep
   continues (legacy: `$errors++` and continue); legacy cleanup runs only
   when the whole distance rebuilds without errors. The trigger event's
   computed result is returned for the response. A run with any event error
   is reported FAILED (fail closed) so the owner sees exactly which events
   need attention.

## Deliberate Machine improvements KEPT (not legacy, kept explicitly)

- Owner confirmation gate (`APPLY_LEVELS` exact confirmation).
- `write_access=CONFIRMED` pre-check via the TEST_WRITE probe on custom-fields.
- Lifecycle stage gate: only `verifying` events proceed.
- `levels_apply_log` records every apply outcome (dry_run/apply/test_write).
- Live re-read immediately before apply; recompute on the same live payload.
- Fail-closed: any error stops the apply and leaves the event at `verifying`.

## Scope (corrected 2026-09-27)

- The Machine apply covers ONE DISTANCE per run (owner-gated), but the whole
  distance: every event of the distance's race, every result set — exactly
  the legacy sweep. The "single event per run" reduction was the direct cause
  of the 2026-09-27 standings destruction and is retired.
- HARD RULE: `clear_previous_results=T` is permitted only inside a
  full-scope rebuild, after the full scope has been read and computed.
  Clearing is never executed on a partial scope.
- The Machine always replaces (`clear_previous_results=T`); legacy had a
  `-Clear` switch — we keep the always-replace mode only.

## Regression cases

Albert's 2026-09-26 3K result (232501676 / 210000 / 1177636 / 664979):
clock_time 18:54 (chip_time blank), no registration_id/user_id in the row,
registration id from the parallel `registration_ids` array. Expected:
Elite (<20:00), Level Place 1, 1000 points, mapping resolves via
add/registration-id.json.

NEW 2026-09-27: `test/series-2026-standings-rebuild.spec.ts` runs the apply
against a fake two-event RunSignup API (2026-09-12 event with legacy
standings in pre-v4 types + the 2026-09-26 18:54 trigger event) and proves:
old event standings are rebuilt into the v4 types (not orphaned), the new
event is added, cumulative totals match legacy math (2000 for Albert in
Elite Men), legacy types are deleted only after a clean sweep, and a second
identical run changes nothing (idempotency).

## Operating cost

Operating cost: VERIFIED $0 (existing RunSignup API access only; no new
resources, no recurring cost).
