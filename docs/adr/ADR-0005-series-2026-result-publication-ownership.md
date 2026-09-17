# ADR-0005: Series 2026 Result Publication Ownership

Status: Accepted

Date: 2026-09-17

Decision owner: Albert Fatikhov, President and Product Architect, NWANA

## Context

Series 2026 predates NWANA Engine and uses Windows/PowerShell components. The project owner verified that:

- result processing and assignment of speed levels are launched separately from publication;
- a separate legacy component publishes through Meta.

Running the legacy publisher and a new Engine publisher together would create duplicate publication risk. Keeping all legacy components forever would also prevent NWANA Engine from becoming the connected distribution system.

## Decision

For Series 2026:

1. Keep the existing result-processing and speed-level logic in its separate legacy component.
2. Do not change the verified 2026 formulas merely to move them into Engine.
3. Stop launching the separate legacy Meta publication component.
4. Make NWANA Engine the single future publisher and distributor of finalized Series 2026 results.
5. Keep Engine result publication in PLAN_ONLY/review mode until:
   - the actual legacy files are inspected;
   - the finalized result output and handoff are documented;
   - a result-publication work item is generated;
   - approval and idempotency prevent accidental or duplicate delivery;
   - the Meta delivery path is verified.
6. Series 2027 may implement both processing and publication inside Engine under its own processing profile.

## Consequences

- There will be one intended result publisher rather than two.
- Existing 2026 result and level calculations remain stable.
- NWANA Engine gains responsibility for result distribution without prematurely rewriting calculation logic.
- Until the Engine publication path is verified, no automatic result post is sent.
- The legacy publisher remains available as historical code but is not the operating publication path after the transition.

## Evidence Boundary

This decision records facts supplied directly by the project owner. Exact filenames, parameters, input/output formats, invocation sequence, and credential handling must be documented only after the actual files are inspected.
