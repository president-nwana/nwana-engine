# NWANA Engine Changelog

## 2026-09-18 — Bound RunSignup requests to the free Worker limit

- Recorded the first public deployment at https://nwana-engine.nwana-engine.workers.dev.
- Confirmed that the all-Series preview exceeds Cloudflare's per-invocation subrequest limit; no payment or higher limit is required.
- Added optional distance/race filtering to Series 2026 retrieval.
- Made card rendering and publication load only the race encoded in the publication key.
- Made preview and historical-baseline endpoints accept a distance query so the six distances can be processed separately.
- Added source-filter validation before any RunSignup request.
- No remote historical baseline row or Meta post was created during the failed requests.
- NWANA_META_TOKEN remains absent remotely; live delivery is still unavailable.

## 2026-09-18 — Add approved result background, full level ladder, and record detection

- Added owner-approved male and female photographic Nordic walking backgrounds as bundled Engine assets with no runtime AI/API cost.
- Added automatic background selection from the primary result gender so a men's record is not paired with a female athlete image, or vice versa.
- Restored result-card rendering for controlled preview while retaining the exact PUBLISH confirmation requirement.
- Made athlete name and official time the dominant visual elements.
- Added all five Series 2026 levels and the verified threshold for every distance.
- Added NO RESULT THIS STAGE for levels without a winner so every post teaches the complete NWANA level system.
- Added series-record detection across finalized official results, separated by distance and gender.
- Added MEN'S/WOMEN'S SERIES RECORD rendering support and passed the verified series_record flag through the card request path after explicit owner approval.
- Added regression tests for the 3K level ladder, record detection, background presence, dominant time sizing, and empty-level display.
- No Meta publication was requested or performed.

## 2026-09-17 — Reject placeholder result-card design

- Recorded the owner review: the geometric card is not publication quality.
- Removed the rejected visual layouts from executable card generation.
- Blocked card rendering and every Series 2026 Meta delivery with VISUAL_DESIGN_NOT_APPROVED.
- Prevented an operator-supplied image URL from bypassing the design block.
- Established the $0 visual workflow: create varied approved backgrounds in the Gemini app included with Google Workspace for Nonprofits, then let Engine overlay exact verified results.
- Established visual hierarchy: athlete name and official time must be dominant and phone-readable; level and gender remain clear; distance and date are secondary; logo and series name do not compete with the result.
- Kept all four Meta destinations inactive. No live post was made.

## 2026-09-17 — Reopen unpublished September 12 3K result

- Recorded the owner-confirmed fact that the September 12, 2026 3K result was not published by the legacy publisher.
- Added migration 0016 to remove only publication key runsignup:series-2026:210000:1178567:666098 from LEGACY_BASELINE.
- Selected this result as the first controlled Engine card and publication candidate.
- Left all other historical baseline records excluded.
- The migration does not call Meta or publish anything.

## 2026-09-17 — Render public JPEG result cards

- Added the Cloudflare Images binding and cache for zero-cost result-card conversion within the free monthly allowance.
- Added a public JPEG card endpoint alongside the read-only SVG preview.
- Embedded the official NWANA logo into the rendered card before conversion.
- Made the publish endpoint derive the JPEG URL automatically; operators no longer need to supply image_url.
- Kept explicit PUBLISH confirmation, historical-baseline blocking, and per-account duplicate protection.
- Local HTTP development cannot trigger publication because the delivery guard requires a deployed public HTTPS card.
- No live Meta request, deployment, or publication was performed.

## 2026-09-17 — Add varied branded result-card previews

- Added three deterministic square-card compositions: Stage Leaders, Performance Level Winners, and Results Spotlight.
- Reused the official NWANA website logo asset and the verified winner names, levels, genders, times, distance, and event title.
- Added a read-only SVG preview endpoint; it generates no publication and changes no result data.
- Corrected Facebook delivery to create photo posts instead of link-only feed posts.
- Kept the same approved image requirement across both Facebook Pages and both Instagram accounts.
- Final JPEG production and the first controlled live delivery remain disabled.

## 2026-09-17 — Expand guarded result delivery to four Meta accounts

- Added Facebook Nordic Walking Sport and Instagram n_w_sport alongside Facebook NWANA and Instagram nwana.official.
- Made the Meta adapters destination-aware instead of hard-coding a single Facebook Page and Instagram account.
- Kept a separate idempotency ledger key for every account so partial retries cannot duplicate successful posts.
- Expanded the read-only connection check to verify both Facebook Page tokens and report all four destinations.
- Recorded that result posts require branded images from a rotating family of deterministic layouts.
- No live Meta request or publication was performed.

## 2026-09-17 — Add guarded Meta result delivery

- Added the existing NWANA Facebook Page and nwana.official Instagram delivery adapter based on the inspected working legacy publisher.
- Added an exact PUBLISH confirmation requirement and mandatory public HTTPS image URL.
- Added migration 0015 with a per-destination delivery ledger so retries do not duplicate a channel that already succeeded.
- Blocked every LEGACY_BASELINE result from the new delivery path.
- Added a read-only Meta connection check.
- Added adapter tests; no live Meta request or publication was performed.


## 2026-09-17 — Generate Series 2026 result editorial drafts

- Added deterministic English post copy for finalized result sets.
- Included all Level Place 1 winners by Performance Level and gender, with finishing times.
- Added the RunSignup results page link and explicit blockers when finalization or the link is missing.
- Kept image selection unset, review required, and execution disabled.
- Added tests for ready and blocked editorial drafts.


## 2026-09-17 — Establish Series 2026 publication baseline

- Added a local publication-history ledger and migration 0014.
- Added an idempotent baseline operation for finalized Series 2026 result sets that predate Engine publication ownership.
- Marked baseline records as historical rather than new publication work.
- Kept publication disabled; the operation does not call Meta or modify RunSignup.
- Added a regression test proving that baseline records are excluded from future publication.
- Verified locally: migration 0014 ran successfully; 22 records became LEGACY_BASELINE; the follow-up preview reported zero new publication candidates and published zero items.


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
