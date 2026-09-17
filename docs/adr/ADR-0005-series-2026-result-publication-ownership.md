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

## Verified legacy handoff evidence

The actual files were inspected on 2026-09-17 without executing them:

- `NWANA-RUN.bat` only launches `NWANA-FINAL.ps1` from the Windows Desktop.
- `NWANA-FINAL.ps1` reads a RunSignup bearer token from `nwana-runsignup-token.json` on the Desktop.
- It reads the six Series 2026 distance races from RunSignup, assigns Performance Level and Level Place, calculates category points, and writes the finalized values and standings back to RunSignup.
- The six verified race IDs are 209980, 210000, 209477, 210018, 210016, and 210020 for 1K, 3K, 5K, 10K, 15K, and 20K respectively.
- Temporary JSON request files are written under the Windows temporary directory; they are transport files, not the durable handoff to Engine.
- `Publish-NWANA.ps1` is a separate generic manual Meta publisher. It reads `NWANA_META_TOKEN` from the environment and asks the operator for title, text, link, image URL, target selection, and an explicit `YES` confirmation.
- Neither `NWANA-RUN.bat` nor `NWANA-FINAL.ps1` invokes `Publish-NWANA.ps1`.

Therefore the durable handoff is RunSignup itself: Engine reads the already updated result sets and recognizes finalized results through the populated `Performance Level` and `Level Place` fields. No legacy script file is uploaded to Engine and no credential is copied into the repository.
