# ADR-0008: Series 2026 Race Lifecycle

Status: Accepted

Date: 2026-09-22

Decision owner: Albert Fatikhov, President and Product Architect, NWANA

## Context

Series 2026 is the first live NWANA object and the heart of the machine:

Series → registrations → results → Performance Levels → Level Place → standings → publication → next race.

NWANA-FINAL.ps1 (2026-09-05) established the verified level logic: per-distance time thresholds, strict below-threshold comparison, five levels (Elite, High Performance, Performance, Competitive, Open), Level Place ranked inside Level + Gender, points 1000/999/998 downward. Engine already handles editorial drafts, cards, Meta delivery with PUBLISH confirmation and duplicate protection. The missing piece was the continuous race lifecycle itself: tracking each distance through registration, results, verification, levels, publication, and preparation for the next race, with the owner seeing exactly what the machine waits on him for.

## Decision

1. Engine keeps a lifecycle state per Series 2026 distance (`race_lifecycle` table, migration 0019), advancing through:
   `registration_open → awaiting_results → verifying → levels_computed → published → next_race_prep`.
2. Stage is derived on every owner-triggered sync from verified platform facts only: RunSignup event dates, result drafts with finalized level fields, and the Engine publication ledger.
3. The level computation in Engine is a direct port of the verified NWANA-FINAL.ps1 thresholds and ranking logic. It is computed for reports and never auto-written to RunSignup; the RunSignup write plan is a dry-run structure (`write_mode: dry_run`, `executed: false`).
4. Human boundaries stay manual: verifying (GPX/Strava/Garmin and pole requirement), Meta PUBLISH confirmation, Email V2 send from the dashboard, and any RunSignup write test.
5. RunSignup write access is recorded per distance and defaults to `UNKNOWN`. A write-test route exists but does nothing until the owner types an explicit `TEST_WRITE` confirmation; it then performs at most the first additive field creation of the real levels pipeline (create the "Performance Level" custom field on a verifying event's result set) and records CONFIRMED or DENIED.
6. No polling, cron, timers, or background sync. Sync runs when the owner opens or
   reloads the results page (see ADR-0009); no manual sync buttons exist.
7. Formulas are Series-2026-specific. Series 2027 must define its own processing profile.

## Consequences

- The operating center shows six distances with the real current stage and the exact owner action required.
- Pre-race preparation produces announcement and email drafts only; Send stays manual.
- The machine cannot invent publication or registration progress; every stage is backed by RunSignup data or the Engine ledger.
- Write capability is verifiable on demand without touching registration or participant data.
