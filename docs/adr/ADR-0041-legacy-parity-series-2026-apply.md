# ADR-0041 — Legacy parity: port NWANA-FINAL.ps1 result-processing semantics into the Series 2026 apply path

Date: 2026-09-27
Status: Implemented on feature branch `feature/series-2026-legacy-parity`. NOT merged to main. NOT deployed.

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
9. **Scope**: legacy processes all distances/events/result sets per run; the
   Machine's owner-gated apply covers one distance/event/result set per run.

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

## Deliberate Machine improvements KEPT (not legacy, kept explicitly)

- Owner confirmation gate (`APPLY_LEVELS` exact confirmation).
- `write_access=CONFIRMED` pre-check via the TEST_WRITE probe on custom-fields.
- Lifecycle stage gate: only `verifying` events proceed.
- `levels_apply_log` records every apply outcome (dry_run/apply/test_write).
- Live re-read immediately before apply; recompute on the same live payload.
- Fail-closed: any error stops the apply and leaves the event at `verifying`.

## Deliberate scope reduction (not legacy, intentional)

- The Machine apply covers one distance/event/result set per run (owner-gated),
  not the whole series sweep. Legacy runs all distances/events/result sets.
- The Machine always replaces (`clear_previous_results=T`); legacy had a
  `-Clear` switch — we keep the always-replace mode only.

## Regression case

Albert's 2026-09-26 3K result (232501676 / 210000 / 1177636 / 664979):
clock_time 18:54 (chip_time blank), no registration_id/user_id in the row,
registration id from the parallel `registration_ids` array. Expected:
Elite (<20:00), Level Place 1, 1000 points, mapping resolves via
add/registration-id.json.

## Operating cost

Operating cost: VERIFIED $0 (existing RunSignup API access only; no new
resources, no recurring cost).
