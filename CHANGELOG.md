# NWANA Engine Changelog

This file records significant implementation and system-state milestones.

It is not a substitute for Git history, SYSTEM_STATE.md, or Architecture Decision Records.

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
