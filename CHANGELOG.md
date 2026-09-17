# NWANA Engine Changelog

## 2026-09-17 — Establish Series 2026 publication baseline

- Added a local publication-history ledger and migration 0014.
- Added an idempotent baseline operation for finalized Series 2026 result sets that predate Engine publication ownership.
- Marked baseline records as historical rather than new publication work.
- Kept publication disabled; the operation does not call Meta or modify RunSignup.
- Added a regression test proving that baseline records are excluded from future publication.


## 2026-09-17 — Series 2026 finalized-result handoff preview

- Inspected the actual legacy launcher, result processor, and retired Meta publisher.
- Confirmed that RunSignup is the durable handoff: the legacy processor writes Performance Level, Level Place, and standings back to RunSignup.
- Added a read-only preview for the six verified Series 2026 distance races.
- Added deterministic draft publication records with stable publication keys for later duplicate prevention.
- Kept every draft in PLAN_ONLY mode with required review and execution disabled.
- Added tests for finalized and unprocessed result sets.
- Did not add Meta delivery, automatic publication, D1 writes, deployment, or remote seeding.

This file records significant implementation and system-state milestones.

It is not a substitute for Git history, SYSTEM_STATE.md, or Architecture Decision Records.

## 2026-09-17

### Reviewable Series 2026 Work Items

- Added deterministic DRAFT work items to distribution-plan actions.
- Each work item carries a business purpose, deliverable, call to action, and content scope.
- Added migration 0013 with instructions for all 10 Series 2026 hub actions.
- Every work item requires review and has execution_allowed=false.
- No jobs, database writes from the endpoint, publication, or channel delivery were enabled.
- Local verification passed: Vitest 7/7, TypeScript check, migration 0013 (10 commands), and live inspection of all 10 DRAFT work items.

### Series 2026 Result Publication Ownership

- Recorded the project-owner decision that legacy result processing/level assignment and legacy Meta publication are independent launches.
- Preserved the existing 2026 result-processing and speed-level logic.
- Retired the separate legacy Meta publisher from future operation rather than running two publishers.
- Assigned NWANA Engine as the single future publisher and distributor of finalized Series 2026 results.
- Kept Engine publication disabled until the actual finalized-output input, review task, approval boundary, and channel delivery are implemented and verified.
- Added ADR-0005 for the decision.

### Local Planner Verification

- Applied migration 0012 successfully to local D1.
- Vitest passed: 2 test files, 7/7 tests.
- npx tsc --noEmit passed.
- Verified the live local plan: PLAN_ONLY, execution_allowed=false, 1 matched rule, 4 audiences, and 10 actions.
- Verified REGISTRATION is platform-available but not configured or distribution-eligible for the Series 2026 hub.

### Platform Capability Versus Operational Use

- Corrected the Series 2026 hub model after the first live planner inspection.
- Preserved REGISTRATION as a technical RunSignup capability while recording that NWANA hides it and does not use the hub as a registration destination.
- Added detailed capability state to distribution plans instead of returning bare capability names.
- Added PUBLIC_WEBSITE and explicit non-results state for the hub.
- Added migration 0012 and regression tests.
- Corrected the canonical Registry and SYSTEM_STATE so future sessions retain this distinction.
- No deployment, remote D1 write, publication, or external-channel action occurred.

### Plan Only Distribution Planner

- Added a general rule matcher and distribution-plan builder.
- Added GET /distribution/plan/{object_id}.
- The endpoint reads objects, capabilities, rules, audiences, and actions without writing data.
- Returned plans are explicitly PLAN_ONLY with execution_allowed=false.
- Added tests for a matching Series 2026 plan and rejection when a required capability is absent.
- Direct local planner checks passed.
- Full local repository verification completed: Vitest 6/6 tests passed and npx tsc --noEmit passed with no errors.
- GitHub CI is not configured; the local verification is the current evidence.
- No deployment, D1 mutation, job creation, channel execution, or Meta call occurred.

## 2026-09-16

### Product Direction Correction

- Added MACHINE_PURPOSE.md as the canonical statement of what NWANA Machine must accomplish.
- Defined the operating loop: OBJECT -> MONEY OR CONVERSION -> AUDIENCE -> SPONSORSHIP -> DISTRIBUTION -> NEXT OBJECT.
- Restored the Stage 8 priority to connecting existing NWANA revenue and distribution assets rather than mass Registry population.
- Recorded the required order: Series 2026, Academy, Licenses, NW Groups, Instructor Growth Fund, Sponsorship, Partner Network.
- Recorded that the separate Series 2026 PowerShell result-level and Meta-publication process predates NWANA Engine and must remain untouched until its actual files are inspected.
- Recorded that Series 2027 will use a new, substantially expanded and changed level system inside NWANA Engine under its own processing profile.


### Canonical Project Memory

- Established the repository as the canonical development memory for NWANA Engine.
- Added SYSTEM_STATE.md.
- Added registry/README.md.
- Added registry/objects.yaml.
- Added ADR-0003: Canonical Repository Memory.
- Added ADR-0004: External Identity, NWANA Meaning, Capability, Processing and Distribution Are Separate Layers.
- Began reconciliation of real RunSignup/TicketSignup configuration before remote Registry seeding.
- Recorded source_id 209464 / series.nwaofna.org as a public Series site/hub rather than a competition-registration/results object.
- Remote D1 Registry data remains intentionally unseeded pending reconciliation.

## 2026-09-15

### Stage 8

- Added Rules Engine tables:
  - rules
  - rule_audiences
  - rule_actions
- Added Stage 8 distribution rule seeds for existing assets.
- Added initial existing-asset Registry seeds.
- Added universal processing_profiles and object_processing_profiles.
- Registered the existing 2026 Series result-processing profile.
- Preserved Series 2026 processing as versioned logic rather than universal competition logic.
- Added existing NW Groups products.
- Updated schema.sql.
- TypeScript check passed.
- Vitest semantic regression suite passed: 4/4.
- Committed and pushed as:
  149ce1d — Add Stage 8 rules and processing profiles

### Remote D1

- Applied schema.sql successfully to remote nwana-engine-db.
- Verified that remote Registry and Stage 8 data tables contained zero data rows after schema deployment.
- Deferred data seeding pending Registry reconciliation.

## 2026-09-15

### Stage 7 Closed

- Added universal competition property model.
- Added RunSignup object capability model.
- Added explicit semantic profiles for external objects.
- Added semantic regression tests.
- Established that unknown RunSignup competition containers do not automatically become OPEN_SERIES.
- Established explicit semantic override:
  source + source_type + source_id -> NWANA meaning.
