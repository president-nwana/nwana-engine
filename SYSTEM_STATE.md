# NWANA ENGINE — CURRENT SYSTEM STATE

This file is the canonical starting point for any developer or AI working on NWANA Engine.

## READ THIS FIRST

Do not reconstruct NWANA Engine from chat memory.
Do not infer RunSignup/TicketSignup object meaning from names.
Do not infer capabilities from hierarchy, URLs, titles, or internal object IDs.
Do not treat a RunSignup "race" container as a real competition unless the canonical Registry says it is one.
If a platform fact is not verified, record it as UNKNOWN rather than guessing.

Read before making changes:
1. SYSTEM_STATE.md
2. registry/README.md
3. registry/objects.yaml
4. docs/adr/
5. AGENTS.md

## CURRENT STAGE

Stage 8 — Rules Engine / Processing Profiles / Registry Reconciliation

Stage 7 is closed.

The immediate task is not to redesign the Registry.
The immediate task is to reconcile the Registry with the actual NWANA RunSignup/TicketSignup configuration.

## LAST VERIFIED CODE STATE

Repository:
president-nwana/nwana-engine

Branch:
main

Last implementation commit before canonical-memory work:
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

## CURRENT NEXT ACTION

Reconcile real RunSignup/TicketSignup objects one by one.

For every external object establish:
- source platform
- source_type / platform container type
- source_id
- public URL/domain
- factual NWANA purpose
- actual available capabilities
- actual unavailable capabilities
- relationships
- verification status
- notes necessary to prevent future incorrect inference

Begin with the known sponsorship/site containers, then reconcile the six 2026 distance-series containers and their competition events.

Only after that reconciliation:
1. correct local Registry records where necessary;
2. rerun regression/control tests;
3. update canonical files;
4. seed verified Registry and Stage 8 data to remote D1.

## DO NOT

- Do not seed remote D1 Registry data yet.
- Do not infer that source_id 209464 is a race.
- Do not assign REGISTRATION or RESULTS to 209464.
- Do not infer business meaning from an internal object_id.
- Do not infer an external object's capabilities from another similar-looking object.
- Do not create future Challenges or event concepts as existing assets.
- Do not hard-code Series 2026 processing as universal competition logic.
- Do not redesign the universal Registry merely to support a future RunSignup/TicketSignup feature that can be represented as another object, relationship, capability, semantic profile, or adapter.

## SESSION CLOSE RULE

At the end of every NWANA Engine development session:

1. Update SYSTEM_STATE.md.
2. Update registry/objects.yaml for newly verified platform facts.
3. Add/update ADRs when an architectural decision is made.
4. Update CHANGELOG.md for significant implementation/state changes.
5. Commit and push documentation together with the relevant code/state changes.

A new developer or AI must be able to continue the project from this repository without requiring the previous chat history.
