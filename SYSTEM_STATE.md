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

Latest implementation commit:
a1de3805b066d31f687e8c5962b3d0b2ba820af0
Add plan-only distribution planner

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

There is no registration on this site/container.
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

Series 2026 already has a separate working Windows/PowerShell process created before NWANA Engine. The project owner states that the existing files receive results, assign speed levels, and one component publishes through Meta.

Keep that process separate for 2026. Do not rewrite it, change its formulas, or duplicate its Meta publication without explicit verification and approval. Exact file behavior must be documented only after the actual files are inspected.

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

Exercise the read-only planner against local Stage 8 seed data and inspect the Series 2026 plan. Do not deploy or enable execution.

Confirm that the returned audiences and actions match NWANA's intended business use and that no duplicate 2026 Meta publication is present.

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

For Series 2026, preserve the separate legacy result-level and Meta-publication process. NWANA Engine must not duplicate its processing or publication. Inspect the actual legacy files before documenting exact invocation details or integrating their finalized outputs.

After the read-only Stage 8 gap audit, propose the smallest working end-to-end improvement. Do not mass-populate registry/objects.yaml.

## DO NOT

- Do not seed remote D1 Registry data yet.
- Do not infer that source_id 209464 is a race.
- Do not assign REGISTRATION or RESULTS to 209464.
- Do not infer business meaning from an internal object_id.
- Do not infer an external object's capabilities from another similar-looking object.
- Do not create future Challenges or event concepts as existing assets.
- Do not hard-code Series 2026 processing as universal competition logic.
- Do not redesign the universal Registry merely to support a future RunSignup/TicketSignup feature that can be represented as another object, relationship, capability, semantic profile, or adapter.
- Do not treat Registry reconciliation as the product goal.
- Do not mass-populate Registry objects without a real processing, rule, distribution, revenue, sponsorship, funding, or next-object use.
- Do not rewrite the separate Series 2026 PowerShell process or duplicate its Meta publication.
- Do not apply Series 2026 level formulas automatically to Series 2027.

## SESSION CLOSE RULE

At the end of every NWANA Engine development session:

1. Update SYSTEM_STATE.md.
2. Update registry/objects.yaml for newly verified platform facts.
3. Add/update ADRs when an architectural decision is made.
4. Update CHANGELOG.md for significant implementation/state changes.
5. Commit and push documentation together with the relevant code/state changes.

A new developer or AI must be able to continue the project from this repository without requiring the previous chat history.
