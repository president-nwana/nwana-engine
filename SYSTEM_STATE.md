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
2. OPERATING_PLAN.md — current execution contract; it supersedes conflicting older chronological notes below
3. SYSTEM_STATE.md
4. registry/README.md when Registry facts are relevant
5. registry/objects.yaml when Registry facts are relevant
6. relevant docs/adr/
7. AGENTS.md

## EMAIL INTEGRATION BOUNDARY — OWNER CORRECTION 2026-09-19

- Google Workspace email is not an NWANA Engine integration.
- Do not build a Gmail API integration, automated Google Workspace bulk-email system, or duplicate Google Workspace contact database.
- RunSignup/TicketSignup email and contact lists are the Engine's primary mass-email and contact layer.
- `admin@nwaofna.org` and `president@nwaofna.org` remain human-operated mailboxes for individual business correspondence, including replies to press, partners, sponsors, and support.
- If a future verified task cannot be completed through RunSignup/TicketSignup, evaluate that exact task separately before reconsidering Google Workspace integration. No such task is currently verified.
- This boundary concerns email only. The existing use of the Gemini application included with Google Workspace for Nonprofits to prepare reusable visual backgrounds remains separate and unchanged.

## OPERATING CENTER, INITIATIVES, AND BOARD — OWNER DECISION 2026-09-19

- The owner interface is an operating center, not only an action screen.
- It must show verified current activity: nearby competitions/calendar, registrations and results, sponsors and negotiations, donations, people and partner pipelines, channel outcomes, blockers, errors, and decisions required.
- Engine must accept unstructured thoughts, problems, opportunities, tasks, documents, spreadsheets, contact files, and other source material.
- Engine must explain what can be done with an input, identify unsupported or outdated claims and missing contacts, propose results and actions, and convert owner-approved proposals into tracked work.
- Simple work may proceed through an already verified and authorized mechanism. Strategic, governance, legal, costly, unsupported, or otherwise consequential work must be presented for owner or Board decision.
- Board members must be able to submit any number of questions, proposals, reports, requested decisions, discussion items, or requests to speak at any time before a meeting.
- The meeting workspace must show pending submissions with their author and status, support live minutes, and convert confirmed decisions into tracked Engine work.
- Meeting preparation is owner-requested or event-triggered. The normal weekly meeting pattern does not authorize timers, polling, cron, or recurring background work.
- See `docs/adr/ADR-0006-operating-center-initiatives-board.md`.

## OPERATING CENTER FOUNDATION — IMPLEMENTED LOCALLY 2026-09-19

- Added migration `0018-add-operating-center.sql` with initiatives, Board meetings, Board submissions, Board decisions, decision requests, and work items.
- Added `/operating-center` with a verified-state overview, initiative intake, Board-item intake, and visible queues.
- Added JSON endpoints for the overview, initiatives, and Board submissions.
- Initiative intake accepts a thought, problem, opportunity, task, or source-material description. Actual binary file storage and document analysis are not implemented yet.
- Any authorized Board member can submit any number of questions, proposals, reports, decision requests, discussion items, or requests to speak; the implementation does not use timers or polling.
- The overview reports verified counts and explicitly marks competition calendar, sponsor pipeline, and donation outcomes unavailable until their data feeds are connected.
- The operating-center routes remain disabled unless `OPERATING_CENTER_ENABLED=true`. Do not enable or deploy the interface until owner and Board access protection is configured.
- No remote D1 migration, deployment, external publication, email, paid service, cron, or recurring job was performed.
- Local verification passed: migration 0018 executed 13 commands, all six tables exist, Vitest passed 25/25, and `npx tsc --noEmit` passed.

## OPERATING CENTER ACCESS PROTECTION — IMPLEMENTED LOCALLY 2026-09-21

- Added owner-key protection for every operating-center API route (`/api/operating-center/*`, `/api/initiatives`, `/api/board/*`).
- The key is accepted as an `Authorization: Bearer <key>` header or a `?key=` query parameter, compared with a constant-time byte comparison.
- The key lives in the `OPERATING_CENTER_KEY` Worker secret and is never committed. A missing secret fails closed: every API call returns 401.
- The public page shell at `/operating-center` renders a key-entry gate only; data calls and form submissions send the stored key, and a 401 returns the visitor to the gate.
- `OPERATING_CENTER_ENABLED=true` is now set in `wrangler.jsonc`, so the interface is live on every deployment.
- Recorded as `docs/adr/ADR-0007-operating-center-access-protection.md`.
- Local verification: Vitest 28/28 (4 new auth tests), `npx tsc --noEmit` clean.
- Still pending: apply migration 0018 to remote D1, set the `OPERATING_CENTER_KEY` secret, deploy, and hand the key to the owner.

## OPERATING CENTER — DEPLOYED LIVE 2026-09-21

- Live at `https://nwana-engine.nwana-engine.workers.dev/operating-center` (Worker `nwana-engine`, deploy version `8dfe5f52-5246-4a3c-86db-736534bd36aa`, code commit `3d7dc59`).
- Remote D1 `nwana-engine-db`: migration journal was empty although the 0001-0017 schema was already present (applied earlier by raw SQL, not the journal). Backfilled journal rows for 0001-0017, then applied `0018-add-operating-center.sql` via raw `d1 execute` (all statements are `IF NOT EXISTS`, idempotent). All six operating-center tables verified present remotely; journal now records 18 migrations.
- Known quirk: `wrangler d1 migrations apply` re-attempts already-applied migrations against this database (journal name format mismatch), so use raw `d1 execute --file` for future migrations here, then insert the journal row manually.
- `OPERATING_CENTER_KEY` Worker secret is set (strong random 64-hex value, issued to the owner in chat on 2026-09-21; the value is not stored in the repo, memory, or any file).
- Live verification: `/operating-center` returns 200 with the key-entry gate; `/api/operating-center/overview`, `/api/initiatives`, `/api/board/submissions` return 401 without the key and 200 with the correct key; a test initiative round-tripped through POST and list, then was deleted, leaving the tables empty for the owner.
- Follow-up hardening (not blocking): the `?key=` query-parameter fallback is accepted alongside the `Authorization: Bearer` header; consider removing it later so the key never appears in URLs, and update ADR-0007 if changed.

## NEWS AUTO-PUBLISH ON RESULT PUBLICATION — IMPLEMENTED LOCALLY 2026-09-22

- ADR-0011: `publishSeries2026Result` now writes one winner-announcement row into `site_news` (kind `winner_announcement`, created_by `engine:auto-publish`) immediately after a publication confirmed with explicit `PUBLISH`. Internal D1 write only; the PUBLISH confirmation is the authorization; nothing external is sent, nothing written back to RunSignup.
- Pure builder `buildWinnerAnnouncementNews` in `src/operating-center.ts`: level-place-1 finishers from the stored `race_event_results` snapshot, grouped by performance level in level order; user text HTML-escaped in `body_html`; title stored raw (public site escapes titles at render). Returns null when there are no winners.
- Idempotent per publication key via deterministic slug `winner-announcement-<key>`; duplicates are never created. The publish response now includes a `site_news` outcome object.
- Local verification: Vitest 68/68, TypeScript clean. The authenticated end-to-end publication path (owner key + Meta token) is not testable in this environment; the auto-publish runs on the next real publication.

## NEWS AUTO-PUBLISH ON FIRST SIGHT OF A RACE EVENT — ADR-0012 (2026-09-22)

- The lifecycle sync (`syncRaceLifecycleDistance`) now writes one "new race announced" row into `site_news` (kind `news`, created_by `engine:auto-publish`) the first time it observes a race event: race name, date, distance, and the registration link the sync observed, factual only. Internal D1 write only; the owner's explicit sync trigger is the authorization; nothing external is sent, nothing written back to RunSignup.
- New events only: migration 0023 adds `race_event_first_seen` (series, distance, event_id marker). Deploy backfills every event already in `race_event_results`, so existing events are never announced retroactively. Idempotent per (series, distance, event_id) via the marker plus deterministic slug `race-announced-<series>-<distance>-<eventId>`.
- kind stays `news` deliberately (site_news CHECK allows only news/winner_announcement; the public site renders every kind without filtering, so a new kind would need a risky D1 table rebuild). Slug prefix `race-announced-` identifies the rows.
- The sync response now carries an `announcements` outcome array per event.
- Live path runs on the next sync that observes a genuinely new event.

## NEXT-RACE PROMO AUTO-PUBLISH ON RESULT PUBLICATION — ADR-0013 (2026-09-22)

- Closes the publication -> next event gap: `publishSeries2026Result` now writes one "next race" promo row into `site_news` (kind `news`, created_by `engine:auto-publish`) immediately after a publication confirmed with explicit `PUBLISH`. The promo names the next not-yet-run event of the same series and distance by date (race name, date, distance, registration link, factual only). Internal D1 write only; the PUBLISH confirmation is the authorization; nothing external is sent, nothing written back to RunSignup.
- Migration 0024 adds `registration_url` to `race_event_results`; the lifecycle sync persists the race-level URL (`race.url`) it observes from RunSignup onto every snapshot row. The promo reads the link from stored D1 data (never constructed).
- Idempotent per publication key via deterministic slug `next-race-<key>`; the publish response now includes a `next_race_news` outcome object (skips with a reported reason when there is no upcoming event). kind stays `news` deliberately (site_news CHECK allows only news/winner_announcement). Slug prefix `next-race-` identifies the rows.
- Local verification: Vitest 85/85 (10 new), TypeScript clean. The authenticated end-to-end publication path (owner key + Meta token) is not testable in this environment; the promo runs on the next real publication.

## ROUTINE NEXT-RACE PREP AUTO-CONFIRM — ADR-0014 (2026-09-22)

- Removed the owner-click gate from routine race-prep distribution. When the previous event is done and the upcoming race has complete prep data (event name and date), the lifecycle sync auto-confirms prep (`AUTO_CONFIRMED`) and the distance moves straight to `registration_open`. `next_race_prep` is now the exception state, held only for incomplete prep data.
- New pure `detectPrepExceptions`: missing event name or date is a genuine exception (the announcement cannot be built truthfully); everything else, including a missing registration URL (falls back to the Series hub link), is routine. A previous manual confirmation is always respected and never downgraded by a later sync.
- The exception is visible, not vague: `GET /api/operating-center/race-lifecycle` now exposes `owner_action` per distance, and the operating center renders the concrete missing piece next to the Confirm prep button (this also fixes the previously dead `d.owner_action` reference in the UI). The manual prep-confirm endpoint stays as the override for exceptions.
- Nothing about sending changes: announcement send stays manual, email send stays manual in the Email V2 dashboard; no RunSignup writes (still dry_run, write access UNKNOWN).
- Verified: Vitest 92/92, TypeScript clean. Live-data proof: the real stored 3K/5K rows (next_race_prep, prep_confirmed=false, events Sept 26/27) were replayed through the new logic and flip to `registration_open` + `AUTO_CONFIRMED` on the next owner-triggered sync. The stored rows themselves were not modified.
- Deployed 2026-09-22: engine Worker redeployed (version f580daf0-2058-4d6a-8a4b-c233e156c097); live checks pass (/operating-center/results 200, /api/operating-center/* 401 without key). Commit a3d31835 on origin/main.

## FUND FOLLOW-UP REMINDERS — ADR-0018 (2026-09-22)

- The machine now surfaces which follow-ups are due: pure `src/fund-followup.ts` computes `follow_up_due_at = sent_at + 14 days` and derives `upcoming / due / overdue` (overdue = past 21 days, no follow-up) per render, never stored. Only stage `sent` can have a due follow-up; no `sent_at` means no due date. No D1 migration.
- Fund view returns `follow_up_due_at` + `follow_up_status` per prospect and `follow_ups_due_now` per fund; the `sent` next action names the concrete due date. Operating-center panel (English only): "Follow-ups due now: N" per fund plus per-prospect due/overdue lines.
- A follow-up NEVER sends anything: the machine surfaces, the owner presses Send. No emails, no auto drafts.
- Verified: Vitest 149/149 (11 new tests), TypeScript clean. Deployed 2026-09-22: Worker redeployed; no migration needed.

## SPONSORSHIP ASSET AS A FIRST-CLASS MACHINE OBJECT — ADR-0017 (2026-09-22)

- The machine now generates its own seller packages: `sponsorship_assets` table (migration 0026), one asset per (object_type, object_id) via UNIQUE constraint, generation idempotent, no duplicates possible.
- Enforced lifecycle: draft -> packaged -> offered -> negotiating -> committed -> fulfilled -> renewal. Forward flow plus one-step corrections backward; renewal terminal; stage-skipping rejected with the allowed moves.
- Pure builder `buildSponsorshipAssetPackage` from the verified 11-asset inventory: title, description, audience, delivers, reference pricing. Pricing uses ONLY the verified 2026 reference grid, labeled "Reference" with 2026-12-31 term limit; everything else TBD, no numbers invented.
- Supported parents: `series` (SERIES_2026 only) and `fund` (resolved from `funds` table). Unknown types/ids rejected, not guessed.
- The machine NEVER contacts sellers or sponsors: generation and tracking only; seller conversations stay human. Generation is explicit (operating-center button / API), no retroactive backfill.
- Operating center panel: package preview, stage, next action, Generate form, one-click stage advance (owner key required). API: `POST /api/operating-center/sponsorship-assets/generate`, `GET /api/operating-center/sponsorship-assets`, `POST /api/operating-center/sponsorship-assets/advance`.
- Verified: Vitest 138/138 (19 new tests), TypeScript clean. Deployed 2026-09-22: Worker redeployed, migration 0026 applied to remote D1.

## FUND AS A FIRST-CLASS MACHINE OBJECT — ADR-0015 (2026-09-22)

- The machine now models money, not just races: `funds` + `fund_prospects` tables (migration 0025) with an enforced prospect lifecycle: prospect -> verified -> drafted -> sent -> follow_up -> committed -> stewardship -> recognition. Forward flow plus one-step corrections backward, plus direct sent -> committed; recognition is terminal; stage-skipping rejected with the allowed moves.
- The owner still presses Send and signs. The machine never sends outreach itself: it tracks pipeline state, surfaces the next action per stage, and routes committed funds into stewardship and public recognition. No new external sends automated; mass email stays on RunSignup/TicketSignup Email V2.
- First live object: the $50K Manhattan HQ Bridge Sprint (goal 50000 USD), seeded with the factual Pool 4 pipeline: 15 prospects, all at `sent`, owner pressed Send 2026-09-22, one-pager v5 attached. Seed is idempotent.
- Operating center shows each fund with goal/raised, per-stage counts, every prospect with its next action, and a one-click stage advance (owner key required). API: `GET /api/operating-center/fund`, `POST /api/operating-center/fund/seed`, `POST /api/operating-center/fund/prospect/advance`.
- Verified: Vitest 109/109 (17 new fund tests), TypeScript clean. Deployed 2026-09-22: Worker redeployed, migration 0025 applied to remote D1, bridge sprint seeded in production.

## RUNSIGNUP/TICKETSIGNUP EMAIL AUDIT — VERIFIED 2026-09-19

- The authenticated NWANA Email Marketing Dashboard exists at dashboard ID `513494` and is connected to `Nordic Walking Association of North America NWANA`.
- The dashboard currently reports 0 custom contacts, 0 custom lists, and 0 sent emails.
- Its recipient selector already exposes NWANA RunSignup/TicketSignup objects and audience classes including current, last-year, and past participants; donors; fundraisers and team roles; volunteers and volunteer coordinators; ticket purchasers; and include/exclude filters.
- Verified connected objects include the Series 2026 hub and distance objects, NWANA Instructor Growth Fund, NWANA Partner Network, NWANA Nordic Walking SPORT, Albert Fatikhov | Nordic Walking, and NWANA Clinics and Workshops.
- The dashboard supports single contacts, custom lists, reusable templates, marketing versus transactional classification, deduplication choices, immediate or scheduled sending, automated emails, unsubscribes, and request/delivery/open/click/bounce/spam reporting.
- The published RunSignup API catalog exposes no Email V2, contact-list, campaign-send, or email-reporting methods. Engine must not invent private endpoints or depend on browser scraping.
- Operational conclusion: RunSignup/TicketSignup is the verified mass-email/contact system. The safe Engine boundary is to prepare the exact audience selection, message, assets, classification, and follow-up record; dashboard execution is the current verified last mile until a documented API becomes available.
- Do not contact support merely to repeat this audit. Revisit API automation only if RunSignup publishes documentation or the provider portal exposes an authorized endpoint.
- No email was created, scheduled, or sent. No contact, list, setting, or unsubscribe record was created or changed.

## RUNSIGNUP API CALLER / 522 DIAGNOSIS — VERIFIED 2026-09-19

- RunSignup API Caller is active.
- Worker secrets `RUNSIGNUP_API_REG` and `RUNSIGNUP_API_REG_SECRET` are configured; their values were not changed or exposed.
- Engine sends `rsu_api_reg` and `X-RSU-API-REG-SECRET` on RunSignup requests.
- Deploy `35b2ef2b-ce77-4563-b602-b1e6df5ee307` initially returned `RunSignup races request failed: 522` from `GET /sources/runsignup/discovery`.
- A later intentional one-time request to the same deployed endpoint returned `200 OK`, `ok=true`, `container_count=11`, and a 62,477-byte discovery response.
- This proves the deployed API Caller credentials and request format are accepted. The earlier 522 was a transient upstream connection timeout, not an authentication failure.
- No code, secret, Registry, D1, schedule, cron, or paid resource was changed.
- Do not add recurring retries or polling. If 522 recurs, preserve the timestamp and Cloudflare diagnostic headers and perform only an intentional bounded retry.

## LINKEDIN API — VERIFIED PENDING 2026-09-19

- App: NWANA Publishing.
- LinkedIn app ID: 266204158.
- Client ID: 78qu5nqdombvh5.
- Created: September 7, 2026.
- App type: Standalone app.
- Community Management API tier requested: Development Tier.
- Current portal status: Review in progress.
- The access form reports that the survey was already completed or the session expired; this confirms an existing submission and is not a reason to resubmit.
- LinkedIn publishing is not connected to Engine until approval and granted scopes are verified.
- Next action: request a status update from LinkedIn Developer Support if no decision email has been received.

## GOOGLE ADS API — VERIFIED 2026-09-19

- Google approved project 440660818183 for Explorer Access.
- Verified free quota: 2,880 production operations per day plus 15,000 test-account operations per day.
- Google Ads API is enabled in the NWANA ChatGPT Connector project.
- The Google Auth application is internal to the NWANA Workspace and uses admin@nwaofna.org.
- OAuth web client NWANA Engine Google Ads exists with callback:
  https://nwana-engine.nwana-engine.workers.dev/integrations/google-ads/callback
- Engine now has owner-initiated connect, callback, encrypted refresh-token storage, and read-only status endpoints.
- Google retired developer-token enforcement for this workflow on September 9, 2026; access is determined by the OAuth client's Cloud project, so Engine does not request or store a developer token.
- Campaign creation or mutation remains disabled.
- No recurring polling, cron trigger, paid advertising, or billable Google Cloud service was added.
- Live OAuth authorization completed successfully as admin@nwaofna.org.
- Read-only status verification returned connected=true, configured=true, access_level=EXPLORER.
- Verified accessible production customer: customers/6758500147.
- The encrypted refresh token is stored in remote D1; OAuth client ID, client secret, and encryption key are Worker secrets.
- Google Ads connection setup is complete. Campaign creation and mutation remain disabled until an owner-approved workflow is implemented.

## CURRENT OPERATING DIRECTIVE — 2026-09-18

The next action is not more speculative backend construction and not more Series 2026 polishing.

Follow `OPERATING_PLAN.md`:

1. verify the actual status of every requested or required Engine integration, beginning with RunSignup/TicketSignup write and email/contact access, Google Ads Grants/API access, LinkedIn Community Management API, Moodle, Seat Theory, and Zubie Five; Google Workspace email is explicitly excluded;
2. pursue missing approvals instead of assuming that silence means rejection or approval;
3. build the owner-facing control page for create/connect/required-result/review/outcomes/errors;
4. connect existing assets and exact acquisition/distribution channels;
5. create future Series 2027, Challenges, and Championships through Engine rather than requiring the owner to rebuild them manually.

The definition of done is owner independence from terminal commands and chat sessions for normal operation. The strict $0 operating-cost rule and event/action-trigger rule remain binding.

## PRODUCTION CURRENCY (single source of truth for what is live)

- Live Worker version: `0a039cff-2bb3-4b74-8e54-c0ba076f4045`, deployed 2026-09-22 (~23:59 UTC).
- Corresponds to commit `fdd254de` (ADR-0023 lifecycle rows to results page + shared button menu; server-side replay of local `a8c1a8e`; local refs realigned to the replayed SHAs after deploy).
- Live checks: `/operating-center` 200 (menu + lifecycle summary card, no inline rows), `/operating-center/results` 200 (menu + full lifecycle rows with Confirm prep), `/operating-center/funds` 200 (menu), `/api/operating-center/fund` and `/api/operating-center/race-lifecycle` 401 without the owner key.
- Previous version `a705eeb8-80fc-4b1b-b72f-11b5d9a7e161` (ADR-0022 blank-page hotfix) superseded.
- Rule: before ANY redeploy, run `wrangler deployments list` and compare the latest
  version timestamp against the latest commit timestamp. Deploy only when the newest
  commit is newer than the newest deployment. Never redeploy on assumption.
- Lesson 2026-09-22: two same-day deploys of effectively one commit happened because
  currency was not checked first. This section exists so it does not repeat.

## CURRENT STAGE

**Master map priorities** (`~/workspace/goals/nwana/files/machine-master-map.md` is the
single source of priorities; old "Stage 8" notes are superseded). Current order:
1. Remove the owner-confirmation gate from routine race-prep distribution.
2. Fund as a first-class machine object ($50K bridge sprint first).
3. Investigate the real Google Ads access path (investigate only).

**Ban:** no new increments to the competition cycle until live distribution of the
2026-09-26/27 weekend races is confirmed.

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

A deterministic English editorial draft is now generated for every result set. For finalized results it includes the event title, every Performance Level + gender winner (Level Place 1), finishing time, and the RunSignup results link. Missing finalization or a missing results URL remains an explicit blocker. Image selection is still unset. Execution remains disabled.

The rendered draft was verified locally against the September 12 3K result. It correctly produced the event title, Albert Fatikhov as the Elite Men winner with 18:25, and the real RunSignup results URL.

A guarded Meta delivery path is now implemented for all four verified legacy destinations: Facebook NWANA, Instagram nwana.official, Facebook Nordic Walking Sport, and Instagram n_w_sport. Each destination has an independent delivery-ledger key, so a partial retry skips only accounts that already succeeded. It requires the exact PUBLISH confirmation and a public HTTPS image URL. Migration 0015 adds a per-destination ledger so a retry skips a channel that already succeeded. Historical baseline records remain unpublishable. No live Meta request has been made.

The first geometric SVG result-card family was inspected by the project owner and rejected. It made the athlete name and official result too small, overemphasized generic headings, wasted most of the canvas, and did not match the quality of the existing NWANA result posts. Those layouts are not approved assets and have been removed from the executable card generator.

Result-card generation and all Series 2026 Meta publication are now explicitly blocked with VISUAL_DESIGN_NOT_APPROVED. No supplied image URL can bypass this block. The publication path stays disabled until an approved visual family exists.

The approved zero-cost direction is:

- use the Gemini app included with Google Workspace for Nonprofits to create a varied family of polished NWANA background compositions;
- do not let generative AI write athlete names, finishing times, performance levels, dates, or other official result data;
- have Engine overlay verified result data exactly;
- make athlete name and official time the dominant, phone-readable elements;
- keep level and gender clearly visible;
- keep distance and date prominent but secondary;
- keep the series name and NWANA logo visible without competing with the athlete result;
- rotate approved compositions so consecutive result posts do not look identical.

Google Workspace for Nonprofits access does not imply free Gemini Developer API image-generation quota. Therefore Engine must not add a paid Gemini API dependency. Approved backgrounds are created through the included Gemini Workspace application and reused by Engine at $0 operating cost. Cloudflare Images remains available for final zero-cost conversion after the approved assets are installed. No card or post has been delivered to Meta.

The project owner then confirmed that the September 12, 2026 3K result was not published by the legacy publisher. Migration 0016 removes only publication key `runsignup:series-2026:210000:1178567:666098` from LEGACY_BASELINE. This exact result is the first controlled card and publication candidate; every other baseline record remains excluded. The migration itself publishes nothing.

The owner approved the visual direction of the first photographic Nordic walking background and then approved the matching male-athlete variant. Engine now selects the male background for men's primary results and the female background for women's primary results. That background is now bundled locally with Engine, so rendering has no runtime AI/API cost. The card renderer makes the athlete name and official time dominant and includes all five Series 2026 performance levels, their verified distance-specific thresholds, and NO RESULT THIS STAGE for empty levels.

Series-wide record detection now compares finalized official results by distance and gender. It marks only the fastest verified time as the current series record. The completed-card renderer supports a MEN'S/WOMEN'S SERIES RECORD label. After explicit owner approval, the main request path now passes only the verified series_record flag into the card renderer; the reviewed diff added exactly one property and changed no Registry, RunSignup, scheduling, or publication behavior.

The owner also approved a third male-and-female background for future result sets containing both genders. It is not yet bundled or selected by Engine; ordinary mixed results should use one combined post rather than two duplicate stage posts. Separate posts remain available for exceptional achievements such as a new record.

The Worker was first deployed publicly at https://nwana-engine.nwana-engine.workers.dev. Remote migrations 0014 and 0015 were applied before deployment. The first remote baseline attempt returned a transient RunSignup 522; the retry exposed the actual issue: one all-Series preview exceeds the free Cloudflare Worker subrequest limit. No baseline row or Meta post was created. NWANA_META_TOKEN is still absent remotely, so live Meta delivery is unavailable.

After explicit owner approval, Series 2026 preview and baseline endpoints now accept a distance filter, and card/publication requests load only the race encoded in the publication key. This keeps each request inside the free Worker limit without changing Registry, level formulas, scheduling, or Meta delivery.

Next, pull, test, type-check, and redeploy this bounded-request change. Then establish the remote historical baseline one distance at a time, verify the total is 22, apply migration 0016 remotely to reopen only September 12 3K, add and verify the remote Meta token, inspect the public card, and perform the first controlled delivery. Do not invoke publication before those checks.

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


## LIVE SERIES 2026 PUBLICATION AND ZERO-COST EVENT RULE

Verified on 2026-09-18:

- publication key `runsignup:series-2026:210000:1178567:666098` was published successfully;
- the approved result card and congratulatory caption reached Facebook NWANA, Instagram nwana.official, Facebook Nordic Walking Sport, and Instagram n_w_sport;
- all four delivery IDs were recorded and the publication status became `PUBLISHED`;
- duplicate delivery protection remains active per destination.

A five-minute Cloudflare cron (`*/5 * * * *`) was found still deployed. It invoked the Worker and checked the D1 job queue 288 times per day even when no NWANA event occurred. It did not poll RunSignup, but it was still unnecessary polling and violated the project's strict $0 operating-cost rule.

The cron trigger and scheduled handler were removed on 2026-09-18.

Binding rule for all future automation:

- do not use periodic polling to discover NWANA changes;
- do not add cron schedules merely to check whether something happened;
- execution must begin only from a verified explicit event signal or an intentional user/system action;
- if the external platform cannot emit a usable event, keep the operation explicit/manual until a $0 event-driven path is verified;
- any design capable of creating operating charges above $0 is excluded unless the project owner explicitly changes this rule.

No RunSignup webhook, Cloudflare Queue consumer, or other automatic result event signal is currently implemented in this repository. Do not describe result publication as automatic until a real $0 event source and end-to-end handler are implemented and verified.

## RACE LIFECYCLE — IMPLEMENTED LOCALLY 2026-09-22

- Added migration `0019-add-race-lifecycle.sql` with the `race_lifecycle` table (one row per Series 2026 distance): active event, six lifecycle stages, prep drafts and confirmation, `write_access` defaulting to `UNKNOWN`, `write_mode` fixed to `dry_run`.
- Added `src/race-lifecycle.ts`: a direct port of the verified NWANA-FINAL.ps1 level logic (thresholds per distance, strict below-threshold comparison, Level Place inside Level + Gender, 1000/999/998 points), stage derivation from RunSignup events, result drafts, and the publication ledger, owner-triggered sync, prep-draft generation, and a dry-run levels write plan that never executes.
- Stages: `registration_open → awaiting_results → verifying → levels_computed → published → next_race_prep`. `verifying` waits on the owner (GPX/Strava/Garmin and pole requirement); `next_race_prep` produces announcement and Email V2 drafts only, with Send staying manual in the Email Marketing dashboard (ID `513494`, MARKETING classification).
- Added owner-gated operating-center routes: `GET /api/operating-center/race-lifecycle` (view), `POST /api/operating-center/race-lifecycle/sync?distance=X` (owner-triggered sync, one distance per request), `POST /api/operating-center/race-lifecycle/prep-confirm` (owner prep confirmation), `POST /api/operating-center/race-lifecycle/write-test` (requires explicit `TEST_WRITE` body field; performs at most one additive "Performance Level" custom-field creation and records CONFIRMED or DENIED).
- The operating-center page now shows a Series 2026 race lifecycle panel: six distances, real current stage, owner action required, prep drafts, write access, and per-distance or bulk sync buttons. The overview `competition_calendar` section points at the lifecycle endpoint instead of reporting unavailable.
- No polling, cron, timers, Gmail, Meta publication, Email V2 send, or RunSignup write was executed. Recorded as ADR-0008. Verified locally: migration 0019 applied to local D1, Vitest 42/42, TypeScript clean.

## RACE RESULTS PAGE — CORRECTED AND COMPLETED 2026-09-22

- Owner rejected the first results-page deployment (2026-09-22): RunSignup
  US-format dates (`10/10/2026`) were sliced as ISO, so all six distances
  wrongly showed future October races as `awaiting_results`; the page listed
  every synced event instead of past races; manual sync buttons remained; no
  publication status or RunSignup results link; no bounded 522 policy.
- Final owner decision: results page shows past races only, newest first;
  refresh is automatic on page open and ordinary reload (an explicit owner
  action, not polling, cron, or a timer); no manual sync buttons anywhere;
  transient RunSignup 522 gets exactly one immediate retry; publication
  status (`PUBLISHED`/`BASELINE`/`PENDING`) and the RunSignup results link
  are shown per event; per-distance sync status is visible. Recorded as
  ADR-0009.
- Added `normalizeRunSignupDate()` in `src/race-lifecycle.ts`: US `M/D/YYYY`,
  ISO date, and ISO datetime all normalize to `YYYY-MM-DD`; anything else
  returns null so races are never classified from guessed dates.
- Added migration `0021-race-event-results-columns.sql` (`results_url`,
  `publication_status` on `race_event_results`); sync stores both.
- Page `/operating-center/results` auto-syncs all six distances on load via
  owner-authenticated per-distance POST calls, continuing after a single
  distance fails, and reports each distance as synced or failed with the
  error. Main `/operating-center` stays compact: summary, initiatives,
  Board queue, lifecycle overview, navigation.
- Vitest regression tests: US/ISO normalization, future October race never
  leaving `registration_open`, results view excluding future/undated
  events and sorting newest first, exactly one 522 retry (none for other
  errors), no manual sync buttons on either page. Verified locally:
  Vitest 60/60, TypeScript clean.

## PUBLIC SITE AND SITE NEWS CHANNEL — BUILT 2026-09-22

- Owner approved Phase 1 of the nwaofna.org migration: build the new public
  site first on a staging address, switch DNS only after approval. DNS is
  untouched.
- Added migration `0022-add-site-news.sql` (`site_news`: slug unique, title,
  body_html, published_at, kind `news`|`winner_announcement`, created_by).
  Applied to remote D1. Write path is the owner-key endpoint only.
- Added owner-key-protected `POST /api/site/news` (`publishSiteNews` in
  `src/operating-center.ts`, same Bearer-key pattern as the operating
  center). This is the machine's news distribution channel: winner
  announcements and federation updates can be published by key at the moment
  results are published. Engine-side auto-publish on result publication is
  deferred to a later step. Recorded as ADR-0010.
- Built the public site as a separate Worker `nwana-site`
  (repo at `~/workspace/nwana-site`), bound read-only to the same D1
  (`nwana-engine-db`). Pages: home (hero, season stats, next races, latest
  winners, news teaser), results (per-distance level tables, federation-
  complete empty levels), calendar (upcoming races grouped by month with
  RunSignup register links), winners (recent congratulations), news feed and
  articles from `site_news`. Site-wide Network menu links all properties.
  English only, no em-dashes.
- Verified live 2026-09-22: engine deployed (news endpoint returns 401
  without the key); site at https://nwana-site.nwana-engine.workers.dev
  returns 200 on all pages with real D1 data (results, calendar, winners);
  news shows an honest empty state (no rows yet). Authenticated POST path
  not testable: the owner key is held only by Albert Fatikhov.
- Vitest 62/62, TypeScript clean on both workers.

## BOARD MEETING LOOP — IMPLEMENTED 2026-09-22 (ADR-0019)

- ADR-0019 closes the Board workspace loop from ADR-0006: new `src/board.ts` reuses the existing migration-0018 tables (no schema change, no migration, no seeding). The board_meetings, board_decisions, and work_items tables were previously never written; now they are.
- Meeting DRAFT -> OPEN -> CLOSED; agenda triage PENDING -> AGENDA with carryover of unresolved items back to PENDING on close; decisions CONFIRMED/DEFERRED/REJECTED with responsible person + due date; CONFIRMED decisions with owner/due date immediately create linked work items; work items READY -> IN_PROGRESS -> DONE (BLOCKED side state); initiatives NEW -> UNDER_REVIEW -> APPROVED -> CONVERTED (DECLINED exit).
- Owner-key-protected endpoints: POST/GET /api/board/meetings, GET /api/board/meetings/:id, POST /api/board/meetings/:id/open|agenda|close, POST /api/board/decisions, GET /api/board/work-items, POST /api/board/work-items/advance, POST /api/initiatives/advance. Operating-center Board meetings + work-items panels added (English only); empty states stay explicit.
- Machine never invents members/meetings/decisions; no emails, no notifications, no Gmail, no RunSignup writes. decision_requests has no endpoints yet (overview count only).
- Local verification: Vitest 158/158 (9 new board tests), `npx tsc --noEmit` clean.
- Deployed 2026-09-22: engine Worker `nwana-engine` version `da3eb365-ae4f-4ca3-8675-40eefadf1d22` (commit `6ff20a28`). Live checks: `/operating-center` 200; all new board/initiative endpoints 401 without the owner key. Note: the first deploy of this change briefly left `/api/initiatives/advance` outside the owner-key gate (the gate matched `/api/initiatives` exactly); fixed, re-pushed, redeployed, and re-verified 401.

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
