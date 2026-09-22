# NWANA Engine Changelog

## 2026-09-22 — Sponsorship Asset as a first-class machine object (ADR-0017)

- The machine now generates its own seller packages: new `SponsorshipAsset` object in D1 (`sponsorship_assets`, migration 0026), one asset per (object_type, object_id) via a UNIQUE constraint, so generation is idempotent and can never duplicate.
- Enforced asset lifecycle: draft -> packaged -> offered -> negotiating -> committed -> fulfilled -> renewal. Forward flow plus one-step corrections backward; `renewal` is terminal; stage-skipping is rejected with the exact allowed moves.
- Pure builder `buildSponsorshipAssetPackage`: parent object facts in, seller package out (title, description, audience, delivers, reference pricing). Content comes from the verified 11-asset inventory; pricing uses ONLY the verified 2026 reference grid, always labeled "Reference" with its 2026-12-31 term limit; everything else is "TBD", no numbers invented.
- Supported parents in this step: `series` (SERIES_2026 only; other series ids rejected, not guessed) and `fund` (resolved from the `funds` table). Unknown object types rejected.
- The machine NEVER contacts sellers or sponsors: no outreach, no emails, no portal submissions. Seller conversations stay human; the sales stream picks packages up from the operating center. Generation and tracking only.
- Generation is explicit (operating-center button / API), not retroactive: no backfill, and the 53 past race events were not turned into assets (assets are per Series / per Fund, not per race event).
- New operating-center panel: each asset shows its package (audience, delivers, reference pricing), stage, next action, a Generate form (object type + object id), and a one-click stage advance (owner key required). New API: `POST /api/operating-center/sponsorship-assets/generate`, `GET /api/operating-center/sponsorship-assets`, `POST /api/operating-center/sponsorship-assets/advance`.
- Verified: Vitest 138/138 (19 new sponsorship-asset tests), TypeScript clean.
- Deployed 2026-09-22: engine Worker redeployed; migration 0026 applied to remote D1.

## 2026-09-22 — Fund as a first-class machine object (ADR-0015)

- The machine now models money, not just races: new `Fund` object in D1 (`funds` + `fund_prospects`, migration 0025) with an enforced prospect lifecycle: prospect -> verified -> drafted -> sent -> follow_up -> committed -> stewardship -> recognition. Forward flow plus one-step corrections backward, plus the direct sent -> committed path; `recognition` is terminal; stage-skipping is rejected with the exact allowed moves.
- The owner still presses Send and signs. The machine never sends outreach itself: it tracks pipeline state, surfaces the next action per stage (sends stay manual), and routes committed funds into stewardship and public recognition. No new external sends were automated; mass email stays on RunSignup/TicketSignup Email V2 per the email boundary.
- First live object: the $50K Manhattan HQ Bridge Sprint, seeded with the factual Pool 4 pipeline (15 prospects, all at `sent`, owner pressed Send 2026-09-22, one-pager v5 attached). Seed is idempotent.
- New operating-center panel: each fund shows goal/raised, per-stage counts, every prospect with its next action, and a one-click stage advance (owner key required, like all other operating-center actions). New API: `GET /api/operating-center/fund`, `POST /api/operating-center/fund/seed`, `POST /api/operating-center/fund/prospect/advance`.
- Verified: Vitest 109/109 (17 new fund tests), TypeScript clean.
- Deployed 2026-09-22: engine Worker redeployed; migration 0025 applied to remote D1; bridge sprint seeded in production (fund + 15 prospects at sent).

## 2026-09-22 — Routine next-race prep auto-confirms; owner gate kept for exceptions only (ADR-0014)

- Removed the owner-click gate from routine race-prep distribution: when the previous event is done and the upcoming race has complete prep data (event name and date), the lifecycle sync now auto-confirms prep (`AUTO_CONFIRMED`) and the distance moves straight to `registration_open`. `next_race_prep` is now the exception state, held only when prep data is incomplete.
- New pure `detectPrepExceptions`: a missing event name or date is a genuine exception (the announcement cannot be built truthfully); everything else, including a missing registration URL (falls back to the Series hub link), is routine. A previous manual confirmation is always respected and never downgraded.
- The exception is visible, not vague: `GET /api/operating-center/race-lifecycle` now exposes `owner_action` per distance, and the operating center renders the concrete missing piece next to the Confirm prep button (this also fixes the previously dead `d.owner_action` reference in the UI). The manual prep-confirm endpoint stays as the override for exceptions.
- Nothing about sending changes: announcement send stays manual, email send stays manual in the Email V2 dashboard; no RunSignup writes (still dry_run).
- Verified: Vitest 92/92, TypeScript clean. Live-data proof: the real stored 3K/5K rows (next_race_prep, prep_confirmed=false) were replayed through the new logic and flip to `registration_open` + `AUTO_CONFIRMED` on the next sync.
- Deployed 2026-09-22: engine Worker redeployed; live checks pass.

## 2026-09-22 — Next-race promo auto-publish on result publication (ADR-0013)

- Closes the last gap in the competition lifecycle loop (series -> registration -> results -> levels -> standings -> publication -> next event): `publishSeries2026Result` now writes one "next race" promo row into `site_news` (kind `news`, created_by `engine:auto-publish`) right after a publication confirmed with explicit `PUBLISH`. The promo points at the next not-yet-run event of the same series and distance, by date: race name, date, distance, and the registration link, factual only. Internal D1 write only; the explicit PUBLISH confirmation is the authorization; nothing external is sent and nothing is written back to RunSignup.
- Migration 0024 adds `registration_url` to `race_event_results`; the lifecycle sync persists the race-level URL (`race.url`) it already observes from RunSignup onto every event snapshot row, so the promo reads the link from stored D1 data (never constructed).
- New pure builder `buildNextRacePromoNews` and slug `next-race-<publicationKey>` in operating-center.ts; user text HTML-escaped in `body_html`; title stored raw (public site escapes at render, same contract as `publishSiteNews`). Idempotent per publication key; the publish response now carries a `next_race_news` outcome next to `site_news`, skipping with a reported reason (`no_upcoming_race`, `no_results_snapshot`) instead of failing the publication. "Not-yet-run" follows the engine's convention: event_date strictly after today.
- Verified locally: Vitest 85/85 (10 new tests), TypeScript clean. The authenticated end-to-end publication path needs the owner key and Meta token, so the live auto-publish path runs on the next real publication.
- Deployed 2026-09-22: engine Worker redeployed (version cf2dae01-2db1-40fe-8eeb-6950e385b87f); live checks pass (/api/operating-center/* 401 without key, /operating-center/results 200). This completes the news auto-publish chain in production: winner announcements (ADR-0011), new-race announcements (ADR-0012), and next-race promos (ADR-0013).

## 2026-09-22 — News auto-publish on first sight of a race event (ADR-0012)

- Mirror of ADR-0011 for the START of the competition lifecycle: `syncRaceLifecycleDistance` now writes one "new race announced" row into `site_news` (kind `news`, created_by `engine:auto-publish`) the first time it observes a race event. Content is factual only: race name, date, distance, and the registration link the sync observed. Internal D1 write only; the owner's explicit sync trigger is the authorization; nothing external is sent and nothing is written back to RunSignup. Generic engine machinery, independent of any specific series.
- New events only: migration 0023 adds `race_event_first_seen` (series, distance, event_id marker); the deploy backfills every event already in `race_event_results`, so existing events are never announced retroactively. Idempotent per (series, distance, event_id) via the marker plus deterministic slug `race-announced-<series>-<distance>-<eventId>`.
- kind stays `news` deliberately: the `site_news` CHECK constraint allows only `news`/`winner_announcement`, and the public site renders every kind in the feed without filtering, so a new kind would need a risky D1 table rebuild for no rendering benefit. Slug prefix `race-announced-` identifies the rows.
- The sync response now carries an `announcements` outcome array per event.
- New pure builders `buildRaceAnnouncementNews` / `raceAnnouncementSlug` in operating-center.ts with HTML-escaping; title stored raw (public site escapes at render, same contract as `publishSiteNews`).
- Verified locally: Vitest suite green, TypeScript clean. Live path runs on the next sync that observes a genuinely new event.

## 2026-09-22 — News auto-publish on result publication (ADR-0011)

- Closed the deferred ADR-0010 item: `publishSeries2026Result` now writes one winner-announcement row into `site_news` (kind `winner_announcement`, created_by `engine:auto-publish`) right after a publication is confirmed with explicit `PUBLISH`. Internal D1 write only; the explicit PUBLISH confirmation is the authorization, so no owner key is needed at this point; nothing external is sent and nothing is written back to RunSignup.
- New pure builder `buildWinnerAnnouncementNews` (operating-center.ts): level-place-1 finishers from the stored per-event results snapshot, grouped by performance level in level order, athlete name/gender/time, all user text HTML-escaped in `body_html`; title stored raw (the public site escapes titles at render, same contract as `publishSiteNews`); returns null when no winners so nothing empty is published.
- Idempotent per publication key: deterministic slug `winner-announcement-<key>`; an existing slug is never duplicated. The publish response now carries a `site_news: { published, slug }` or `{ published: false, skipped: <reason> }` outcome.
- Owner-key `POST /api/site/news` remains for hand-written federation news.
- Verified locally: Vitest 68/68, TypeScript clean. Authenticated end-to-end publication needs the owner key and Meta token, so the live auto-publish path runs on the next real publication.
- Deployed: engine Worker redeployed (endpoint behavior verified by 401-without-key checks).

## 2026-09-22 — Public site (nwana-site) + site news distribution channel

- Added migration 0022 (`site_news` table: slug unique, title, body_html, published_at, kind news|winner_announcement, created_by). Applied to remote D1.
- Added owner-key-protected `POST /api/site/news` on the engine worker (same Bearer key pattern as the operating center, `publishSiteNews` in operating-center.ts). The machine's news distribution channel: winner announcements and federation updates can be published by key at the moment results are published. Engine-side auto-publish wiring deferred to a later step. Recorded as ADR-0010.
- Built the new public site as a separate Worker `nwana-site` (~/workspace/nwana-site), bound read-only to the same D1: home (hero, season stats, next races, latest winners, news teaser), results (per-distance level tables, federation-complete empty levels), calendar (upcoming races grouped by month, RunSignup register links), winners (recent congratulations), news feed + articles from `site_news`. Site-wide Network menu links all properties. English only, no em-dashes.
- Verified locally: Vitest 62/62, TypeScript clean (both workers).
- Deployed 2026-09-22: engine Worker deployed (endpoint live, 401 without key verified); nwana-site deployed to https://nwana-site.nwana-engine.workers.dev. Verified live: all pages 200 with real D1 data (results, calendar, winners), news shows an honest empty state (no rows yet), 404 page works. Authenticated POST path not testable: the owner key is held only by Albert Fatikhov.

## 2026-09-22 — Results page correction (past races only, auto-sync, no manual buttons)

- Fixed the defect the owner rejected: RunSignup US-format dates (`10/10/2026`) were sliced as ISO, so future October races were classified `awaiting_results`. Added `normalizeRunSignupDate()`: US `M/D/YYYY`, ISO date, and ISO datetime all normalize to `YYYY-MM-DD`; anything else returns null so a race is never classified from a guessed date.
- Final owner decision (ADR-0009): `/operating-center/results` shows past races only, newest first; refresh is automatic on page open and ordinary reload; no manual sync buttons; a transient RunSignup 522 gets exactly one immediate retry (no delays, no timers); per-event publication status (`PUBLISHED`/`BASELINE`/`PENDING`) and the RunSignup results link are shown; per-distance sync status (synced or failed with the error) is visible.
- Added migration 0021 (`results_url`, `publication_status` columns on `race_event_results`).
- Main `/operating-center` stays compact: summary, initiatives, Board queue, lifecycle overview, navigation.
- Verified locally: Vitest 60/60, TypeScript clean.
- Deployed 2026-09-22: migration 0021 applied to remote D1 (direct execute + journal entry), Worker deployed (version 6cbe2275-0efa-4cfe-bb1e-305298d99686). Verified live: /operating-center 200, /operating-center/results 200 with the key gate and the new auto-sync copy, /api/operating-center/race-results and sync return 401 without the key, zero manual sync buttons in the live HTML of either page. Authenticated check (auto-sync run) pending: the owner key is held only by Albert Fatikhov.
- Commits not pushed yet (GitHub credential connected later on 2026-09-22; push pending after the authenticated live check).

## 2026-09-22 — Race results page (separate page, sync moved off the main page)

- Added migration 0020 (`race_event_results` table): per-event snapshot of result rows (athlete, gender, time, performance level, level place), written by the lifecycle sync from RunSignup data. Read-only storage; never writes back to RunSignup.
- Added page `/operating-center/results`: Series 2026 past races per distance, most recent first, with result tables sorted by performance level then level place. Sync buttons ("Sync all distances" and per-distance) live on this page now.
- Main `/operating-center` keeps a clean lifecycle stage overview with a link to the results page; sync buttons removed from the main page.
- Added API `GET /api/operating-center/race-results`. Added `flattenEventResults` (dedupe by result_id, sort by level then level place) with regression tests.
- Verified locally: Vitest 47/47, TypeScript clean.
- Deployed 2026-09-22: migration 0020 applied to remote D1 (direct execute + journal entry; wrangler `migrations apply` tried to re-apply all migrations, so it was bypassed for 0020), Worker deployed to https://nwana-engine.nwana-engine.workers.dev. Verified live: /operating-center/results returns 200 with the key gate, /api/operating-center/race-results returns 401 without the key.
- Commits not pushed yet (GitHub credential connected later on 2026-09-22; push pending after the authenticated live check).

## 2026-09-22 — Close the Series 2026 race lifecycle loop (phase 1)

- Added migration 0019 (`race_lifecycle` table): one row per distance with the active event, lifecycle stage, prep drafts and confirmation, `write_access` defaulting to `UNKNOWN`, `write_mode` fixed to `dry_run`.
- Added `src/race-lifecycle.ts`: verified NWANA-FINAL.ps1 level logic ported (per-distance thresholds, strict below-threshold comparison, Level Place within Level + Gender, 1000/999/998 points); stage derivation from RunSignup events, result drafts, and the publication ledger; owner-triggered sync; prep-draft generation for announcements and Email V2 (Send stays manual, dashboard ID `513494`, MARKETING classification); and a dry-run levels write plan that never executes.
- Stages: `registration_open → awaiting_results → verifying → levels_computed → published → next_race_prep`. Human boundaries stay manual: verification (GPX/Strava/Garmin, pole requirement), Meta PUBLISH, Email V2 send, and any RunSignup write test.
- Added owner-gated operating-center routes: lifecycle view, per-distance sync, prep confirm, and a write test that requires an explicit `TEST_WRITE` confirmation and performs at most one additive custom-field creation before recording CONFIRMED or DENIED.
- The operating-center page now shows a Series 2026 race lifecycle panel with the real stage per distance, the owner action required, prep drafts, write access, and sync buttons; no timers, polling, or cron were added.
- Verified locally: migration 0019 applied to local D1, Vitest 42/42, TypeScript clean. Recorded as ADR-0008.
- Not deployed: no Cloudflare credentials in this session (deployed later the same day). No push: GitHub credential connected later on 2026-09-22. Nothing was published, sent, or written to RunSignup.

## 2026-09-21 — Deploy the operating center live

- Applied migration 0018 to remote D1 `nwana-engine-db` (all six operating-center tables verified present; journal backfilled for 0001-0017 which had been applied by raw SQL).
- Set the `OPERATING_CENTER_KEY` Worker secret and deployed Worker `nwana-engine` to `https://nwana-engine.nwana-engine.workers.dev/operating-center`.
- Verified live: key-entry gate renders; all operating-center APIs return 401 without the key and 200 with it; initiative write and list round-tripped, test record removed.
- The owner key was handed to Albert Fatikhov in chat; it is not stored in the repo.
- No timer, polling, cron, paid service, email, or publication was added.

## 2026-09-21 — Protect and enable the operating center

- Added owner-key access protection for all operating-center API routes: the key is accepted as an `Authorization: Bearer` header or a `?key=` parameter, compared in constant time, and stored as the `OPERATING_CENTER_KEY` Worker secret (never in the repo).
- The public page shell now shows a key-entry gate; every data call and form submission sends the key from browser local storage, and a 401 returns the page to the gate.
- Set `OPERATING_CENTER_ENABLED=true` in `wrangler.jsonc`, so the interface is live on deploy. Missing secret fails closed with 401.
- Added 4 tests for key extraction, authorization, rejection, and the gate. Verified locally: Vitest 28/28, TypeScript clean.
- Recorded as ADR-0007. Remote D1 migration 0018 and deployment are the remaining steps before the owner can open the page.
- No timer, polling, cron, paid service, email, or publication was added.

## 2026-09-19 — Implement operating center foundation

- Added D1 structures for initiatives, Board meetings, Board submissions, Board decisions, decision requests, and work items.
- Added the first owner-facing operating-center page with verified counts, initiative intake, Board-item intake, and visible queues.
- Added APIs to create and list initiatives and Board submissions and to read the operating overview.
- Made unavailable calendar, sponsorship, and donation feeds explicit instead of inventing dashboard data.
- Kept all external execution disabled and added no timer, polling, cron, paid service, email, publication, or remote data mutation.
- Kept the new routes disabled until owner and Board access protection is configured.
- Verified locally: migration 0018 executed successfully, six tables exist, Vitest passed 25/25, and TypeScript passed.


## 2026-09-19 — Define operating center, initiatives, and Board workflow

- Expanded the owner interface from an action screen to an operating center with Overview, Actions, Initiatives, Board, Decisions and Approvals, and Results and History.
- Added intake for thoughts, problems, opportunities, tasks, documents, spreadsheets, contact files, and other source material.
- Required Engine to explain what can be done with an input, flag unsupported or outdated claims and missing contacts, and convert approved proposals into tracked work.
- Added continuous agenda contribution: every authorized Board member may submit any number of questions, proposals, reports, requested decisions, discussion items, or requests to speak before a meeting.
- Added live meeting minutes that convert confirmed decisions into Engine work, subject to existing approval, integration, safety, and $0 cost boundaries.
- Kept meeting preparation event-triggered; no weekly timer, polling, cron, or recurring background job was authorized.


## 2026-09-19 — Verify NWANA Email Marketing dashboard directly

- Inspected the authenticated NWANA Email Marketing Dashboard (ID `513494`) without creating or changing data.
- Verified that its recipient selector is already connected to NWANA RunSignup/TicketSignup objects and exposes participants, donors, fundraisers, volunteers, ticket purchasers, custom contacts/lists, and include/exclude segmentation.
- Verified marketing/transactional classifications, deduplication, templates, scheduling/automation, unsubscribe controls, and delivery/open/click/bounce/spam reporting.
- Recorded the current counts: 0 custom contacts, 0 custom lists, and 0 sent emails.
- Corrected the next step: do not ask support merely to repeat the audit. Engine should prepare an exact dashboard handoff and track outcomes; it must not invent private endpoints or scrape the dashboard.
- Created, changed, scheduled, and sent no email; changed no contact, list, setting, or unsubscribe record.


## 2026-09-19 — Audit RunSignup/TicketSignup Email V2 access

- Verified from official RunSignup documentation that Email V2 is free and includes recipient selection, custom lists, templates, scheduling, automated emails, and performance reporting.
- Verified that the published RunSignup API catalog exposes no Email V2 or contact-list methods.
- Classified the dashboard product as available and the Engine API path as UNKNOWN pending direct RunSignup confirmation.
- Prohibited guessing private endpoints or scraping the dashboard.
- Created, changed, scheduled, and sent no email; read or changed no contact data.


## 2026-09-19 — Remove Google Workspace email from Engine scope

- Removed Google Workspace email from the Engine channel and integration plans.
- Established RunSignup/TicketSignup email and contact lists as the sole current mass-email and contact layer.
- Prohibited Gmail API, automated Google Workspace bulk sending, and a duplicate Google Workspace contact database.
- Kept `admin@nwaofna.org` and `president@nwaofna.org` for human individual correspondence with press, partners, sponsors, and support.
- Changed press delivery to a prepared human handoff with response tracking.
- Left the separate approved Gemini Workspace visual-asset workflow unchanged.


## 2026-09-19 — Diagnose transient RunSignup 522

- Rechecked `GET /sources/runsignup/discovery` once against deploy `35b2ef2b-ce77-4563-b602-b1e6df5ee307`.
- The deployed Worker returned `200 OK`, `ok=true`, and 11 RunSignup containers.
- Confirmed the API Caller request format and configured secrets are working; the prior 522 was a transient upstream connection timeout, not an authentication failure.
- Changed no code, credentials, Registry data, D1 data, schedules, cron triggers, or paid resources.
- Preserved the strict $0 and no-polling rule; any future retry remains explicit and bounded.


## 2026-09-19 — Verify LinkedIn API application remains under review

- Confirmed the NWANA Publishing LinkedIn app (app ID 266204158, client ID 78qu5nqdombvh5) exists as a Standalone app.
- Confirmed Community Management API Development Tier status is `Review in progress`.
- Confirmed the access form reports an existing completed or expired submission; no duplicate submission should be made.
- Recorded the next external action: request a status update from LinkedIn Developer Support, then verify granted scopes after approval.
- No LinkedIn publishing capability was enabled or exercised.


## 2026-09-19 — Add guarded Google Ads OAuth connection

- Recorded Google Ads API Explorer approval for project 440660818183 with 2,880 free production operations per day.
- Added an owner-initiated OAuth connection for admin@nwaofna.org using the exact deployed callback URI.
- Added encrypted D1 storage for the long-lived refresh token; the encryption key and OAuth client credentials remain Worker secrets.
- Added a read-only status check that lists only directly accessible Google Ads customer resource names.
- Kept Google Ads campaign execution disabled and added no polling, cron, paid advertising, or background requests.
- Added OAuth configuration and missing-secret regression tests.
- Removed the obsolete developer-token requirement after verifying Google's September 9, 2026 project-based access change.
- Reduced the authorization request to Google's required parameters after the first live consent request returned HTTP 400 for the optional incremental-authorization and login-hint parameters.
- Completed live OAuth authorization for admin@nwaofna.org.
- Verified Explorer connection to customer 6758500147 through the deployed read-only status endpoint.
- Confirmed execution_allowed=false; no campaign was created or changed.


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

## 2026-09-22

### Race lifecycle sync: Bearer-only RunSignup auth
- Lifecycle sync no longer attaches the rsu_api_reg layer to race/result endpoints (RunSignup returned error 17 on 10K/15K/20K); uses the same Bearer-only auth as the proven NWANA-FINAL.ps1.
- RunSignup error diagnostics no longer include query parameters, so API caller identifiers never leak into error output.
- Committed as 8ab9148 and f5f958f.

### Phase 1 deployed; all 6 Series 2026 distances synced live
- Migration 0019 applied to remote D1; race_lifecycle table verified.
- All six distances (1K/3K/5K/10K/15K/20K) synced from RunSignup; stages live in the operating center. 20K initially hit transient RunSignup 522 timeouts, resolved on retry.
- Worker deploy version e4d77b32 (Russian lifecycle panel).

### Operating center lifecycle panel in Russian
- Panel heading, hint, stage labels, buttons, and sync messages now in Russian. Stages: Регистрация открыта, Ждём результаты, Проверка результатов (вы), Уровни посчитаны, Опубликовано, Готовим следующую гонку.
- Sync feedback made prominent (bold status line); hint explains when to press sync and that sync only reads, never writes or publishes.
- 45/45 tests green, tsc clean. Committed as 1b5229a and pushed to GitHub main.
