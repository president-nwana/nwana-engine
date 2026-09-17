# NWANA ENGINE — CURRENT SYSTEM STATE

This file is the canonical starting point for any developer or AI working on NWANA Engine.

## READ THIS FIRST

Do not reconstruct NWANA Engine from chat memory.
Do not infer RunSignup/TicketSignup object meaning from names.
Do not infer capabilities from hierarchy, URLs, titles, or internal object IDs.
Do not treat a RunSignup "race" container as a real competition unless the canonical Registry says it is one.
If a platform fact is not verified, record it as UNKNOWN rather than guessing.

Read before making changes:
1. MACHINE_PURPOSE.md
2. SYSTEM_STATE.md
3. registry/README.md when Registry facts are relevant
4. registry/objects.yaml when Registry facts are relevant
5. relevant docs/adr/
6. AGENTS.md

## CURRENT STAGE

Stage 8 — Connect existing NWANA assets to the Rules and Distribution Engine

Stage 7 is closed.

The product direction is defined in MACHINE_PURPOSE.md.

The immediate task is to audit the existing Stage 8 implementation against the complete operating loop:

OBJECT -> MONEY OR CONVERSION -> AUDIENCE -> SPONSORSHIP -> DISTRIBUTION -> NEXT OBJECT

Registry reconciliation is performed only where a real Stage 8 rule, processing path, distribution action, or verified relationship requires it. It is not the main project stage and must not become mass object cataloguing.

## LAST VERIFIED CODE STATE

Repository:
president-nwana/nwana-engine

Branch:
main

Latest base commit reviewed before the current Series 2026 handoff implementation:
0cf74e8dafc4440318bd31f5151ffe5e4f897d50
Record verified Series hub work items

Previous verified Stage 8 implementation commit:
149ce1df88f2d32deec17cb3f5ff811e6fbb2bf5
Add Stage 8 rules and processing profiles

Verified before that commit:
- npx tsc --noEmit passed
- Vitest passed: 4/4 tests
- schema.sql executed successfully locally
- Stage 8 migrations 0005–0011 were committed and pushed

Stage 8 local verification:
- rules = 7
- rule_audiences = 22
- rule_actions = 40
- processing_profiles = 1
- object_processing_profiles = 1
- RESULTS capabilities = 53
- Facebook/Instagram MANUAL_LAST_MILE actions = 8

## REMOTE D1 STATE

Database:
nwana-engine-db

database_id:
b3a8f158-185c-4a37-a61d-a29eb758de7e

schema.sql was successfully applied to remote D1.

After schema deployment the following remote data counts were verified as zero:
- objects = 0
- relationships = 0
- object_capabilities = 0
- semantic_profiles = 0
- rules = 0
- rule_audiences = 0
- rule_actions = 0
- processing_profiles = 0
- object_processing_profiles = 0

Therefore remote D1 currently has schema structure but not canonical Registry/Stage 8 data.

## HARD BLOCKER

The existing local Registry was built before the repository contained a complete factual description of the real RunSignup/TicketSignup configuration.

Some existing classifications or capabilities may therefore contain assumptions that must be checked against actual platform reality.

DO NOT seed Registry data into remote D1 until reconciliation is complete.

## VERIFIED PLATFORM FACT — SOURCE ID 209464

Public site:
https://series.nwaofna.org/

RunSignup/TicketSignup source_id:
209464

Verified factual role:
public website/hub for the 2026 NWANA Open Nordic Walking Series.

It is implemented using RunSignup/TicketSignup site/event infrastructure.

It is NOT:
- a competition race itself
- a participant-registration object
- a results container

RunSignup provides a registration module because this site uses race/nonprofit-event infrastructure, but NWANA hides the registration button and does not use this hub as a public registration destination.
There are no competition results on this site/container.

The existing internal identifier NWANA-RACE-000001 must NOT be interpreted as proof that the external object is a race.

Whether that internal ID should eventually be renamed is a separate migration decision.

See registry/objects.yaml.

## IMPORTANT RUNSIGNUP / TICKETSIGNUP PATTERN

NWANA deliberately uses RunSignup/TicketSignup website/event infrastructure for assets that are not necessarily races.

This is partly because those platform objects provide useful operational and sponsorship functionality.

Therefore:

PLATFORM CONTAINER TYPE
is not the same thing as
NWANA BUSINESS MEANING

Examples already known to use this general pattern include:
- 2026 NWANA Open Nordic Walking Series
- Albert Fatikhov | Nordic Walking
- NWANA Nordic Walking SPORT
- NWANA Partner Network

Their exact technical configuration and capabilities must be recorded individually during Registry reconciliation.

Do not assume they all have identical enabled features merely because they use similar platform infrastructure.

## ARCHITECTURAL SEPARATION

External source identity:
what exists on the external platform

Semantic profile:
what that external object means to NWANA

Object capability:
what the object can technically do

Processing profile:
how NWANA processes the object

Distribution rule:
which audience/action/channel should receive the object

These layers must remain separate.

## STAGE 7 SEMANTIC RULE

Explicit semantic profiles exist so that NWANA meaning can be assigned by:

source + source_type + source_id -> NWANA meaning

Names/titles are fallback discovery signals, not canonical truth.

An unknown RunSignup race/container must not automatically become OPEN_SERIES.

A new adapter is created when a real source/integration is connected.
Do not pre-build every possible future RunSignup/TicketSignup adapter.

## SERIES 2026 LEGACY PROCESS BOUNDARY

Series 2026 has separate Windows/PowerShell components created before NWANA Engine. The project owner verified that result processing/level assignment and Meta publication are launched independently.

Accepted decision on 2026-09-17:

- continue using the existing 2026 result-processing and speed-level component;
- stop launching the separate legacy Meta publication component;
- NWANA Engine becomes the single future publisher and distributor of finalized Series 2026 results;
- Engine remains PLAN_ONLY and must not send results until the finalized-output input, publication task, approval boundary, and delivery path are implemented and verified;
- exact file inputs, outputs, invocation, and credential handling must still be documented from the actual files rather than inferred from screenshots.

Series 2027 will use a new, substantially expanded and changed level system implemented inside NWANA Engine under its own processing profile.

## SERIES 2026 PROCESSING

Existing processing profile:
PROFILE-SERIES-2026-RESULTS

Profile type:
RESULT_PROCESSING

Program family:
OPEN_SERIES

Season:
2026

Existing runtime implementation:
NWANA-FINAL.ps1

The profile preserves the existing 2026 level/result logic.

It must NOT be generalized automatically to:
- Series 2027
- Challenges
- future competition formats

Those may receive different processing profiles.

## PLAN ONLY DISTRIBUTION PLANNER

Commit a1de380 added the first working general Stage 8 planner.

Read-only endpoint:

GET /distribution/plan/{object_id}

It reads the object, its available capabilities, enabled rules, audiences, and actions, then returns a reviewable plan.

Safety boundary:

- mode is always PLAN_ONLY;
- execution_allowed is always false;
- it does not create jobs;
- it does not write D1 data;
- it does not publish or send anything;
- it does not call Meta;
- it does not change the separate Series 2026 result-processing workflow.

Verification completed on 2026-09-17 in the full local repository at commit 6025d09:

- Vitest passed: 2 test files, 6/6 tests;
- distribution planner tests passed: 2/2;
- existing semantic tests passed: 4/4;
- npx tsc --noEmit passed with no errors.

GitHub currently has no CI status checks. The successful local verification is the current evidence for this implementation.

## CURRENT NEXT ACTION

The corrected Series 2026 planner was verified locally on 2026-09-17:

- migration 0012 executed successfully locally;
- Vitest passed: 2 test files, 7/7 tests;
- npx tsc --noEmit passed;
- the live local plan returned detailed capability state;
- REGISTRATION remained platform-available but configured_for_object=false and distribution_eligible=false;
- mode remained PLAN_ONLY and execution_allowed=false;
- the plan returned 1 rule, 4 audiences, and 10 actions.

Migration 0013 and the Series 2026 work items were verified locally on 2026-09-17:

- Vitest passed: 2 test files, 7/7 tests;
- npx tsc --noEmit passed;
- migration 0013 executed successfully locally: 10 commands;
- the live plan returned all 10 work items;
- every work item was DRAFT;
- every work item had requires_review=true and execution_allowed=false;
- the plan remained PLAN_ONLY with execution_allowed=false.

The actual Series 2026 legacy files were inspected on 2026-09-17. The verified handoff is RunSignup, not a local output file: `NWANA-FINAL.ps1` writes Performance Level, Level Place, and standings back to RunSignup. `NWANA-RUN.bat` only starts that processor. `Publish-NWANA.ps1` is separate, manual, and is not called by either processing file.

A read-only Engine preview endpoint is now implemented:

GET /sources/runsignup/series-2026/results-preview

It reads the six verified Series 2026 distance races, recognizes a result set as finalized only when every result has both Performance Level and Level Place, and returns deterministic DRAFT publication records. Every draft requires review, execution_allowed remains false, and no Meta delivery code is present.

The endpoint was verified locally against real RunSignup data on 2026-09-17: 53 result sets were found and 22 were fully finalized with both required fields. The project owner chose not to republish those historical result sets.

Migration 0014 and a baseline endpoint now record the currently finalized sets as LEGACY_BASELINE. The operation is idempotent, writes only the local Engine publication ledger, publishes nothing, and leaves execution_allowed=false. The normal preview excludes baseline records from new publication work.

Local baseline verification completed on 2026-09-17:

- migration 0014 executed successfully: 3 commands;
- baseline operation returned ok=true;
- legacy_baseline_count=22;
- published=0;
- subsequent preview returned result_sets=53, ready_for_editorial_review=22, historical_baseline=22, and new_ready_for_editorial_review=0;
- execution_allowed remained false.

The transition is complete: the 22 existing finalized result sets are history, and the next genuinely new finalized result will be the first new Engine publication candidate.

Next, define the approved editorial template and destination routing for a new result draft. Do not enable sending yet.

After that validation, continue the Stage 8 audit against MACHINE_PURPOSE.md.

For the first operational asset group, establish what already exists and what is missing across:

- money or conversion;
- audiences;
- sponsorship;
- partner routing;
- distribution actions and channels;
- observation of outcomes;
- follow-up, renewal, cross-sell, or next-object transitions.

Required implementation order:

1. Series 2026;
2. Academy;
3. Licenses;
4. NW Groups;
5. Instructor Growth Fund;
6. Sponsorship;
7. Partner Network.

Do not create Free Challenges, Series 2027, U.S. Championships, or Continental Championships until the existing assets operate inside the connected Rules and Distribution Engine.

For Series 2026, preserve the legacy result-processing and speed-level component. Do not launch the separate legacy Meta publisher. NWANA Engine is the future single result publisher, but remains PLAN_ONLY until the actual files and finalized output are inspected and the publication path is verified.

After the read-only Stage 8 gap audit, propose the smallest working end-to-end improvement. Do not mass-populate registry/objects.yaml.

## DO NOT

- Do not seed remote D1 Registry data yet.
- Do not infer that source_id 209464 is a race.
- Do not treat REGISTRATION as active for 209464: it is platform-available but hidden, unconfigured for NWANA use, and not a public conversion path.
- Do not treat 209464 as a RESULTS container.
- Do not infer business meaning from an internal object_id.
- Do not infer an external object's capabilities from another similar-looking object.
- Do not create future Challenges or event concepts as existing assets.
- Do not hard-code Series 2026 processing as universal competition logic.
- Do not redesign the universal Registry merely to support a future RunSignup/TicketSignup feature that can be represented as another object, relationship, capability, semantic profile, or adapter.
- Do not treat Registry reconciliation as the product goal.
- Do not mass-populate Registry objects without a real processing, rule, distribution, revenue, sponsorship, funding, or next-object use.
- Do not rewrite the Series 2026 result-processing/level logic.
- Do not launch the separate legacy Meta publisher after Engine publication is adopted.
- Do not enable Engine result sending before its finalized-output input and delivery path are verified.
- Do not apply Series 2026 level formulas automatically to Series 2027.

## SESSION CLOSE RULE

At the end of every NWANA Engine development session:

1. Update SYSTEM_STATE.md.
2. Update registry/objects.yaml for newly verified platform facts.
3. Add/update ADRs when an architectural decision is made.
4. Update CHANGELOG.md for significant implementation/state changes.
5. Commit and push documentation together with the relevant code/state changes.

A new developer or AI must be able to continue the project from this repository without requiring the previous chat history.
