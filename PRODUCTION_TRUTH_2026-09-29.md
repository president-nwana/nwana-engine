# PRODUCTION TRUTH — 2026-09-29

Snapshot of the verified production state, recorded 2026-09-29 ~12:30–13:30 EDT.
This is not an architecture proposal and not a historical narrative — only the
current verified production state.

Verification labels used on every statement:
- **VERIFIED PRODUCTION** — observed directly in production (Cloudflare API,
  production D1 via wrangler remote, live HTTP) during this pass.
- **VERIFIED REPO** — observed in the local repository (git, code, docs).
- **VERIFIED BOTH** — confirmed in production AND repo (e.g. timestamp
  correlation between a commit and a deploy).
- **UNKNOWN / NEEDS CHECK** — could not be verified in this pass.

Rule followed: nothing inferred about production from code alone. Where a
commit↔deploy correlation is stated, the evidence (timestamps + observed
deployed behavior) is given.

---

## 1. Deployments

- **nwana-engine**: version 153, id `8fb98dbc-dd41-4342-a392-5f5758f779b5`,
  modified `2026-09-29T05:05:12Z`. **VERIFIED PRODUCTION**
- **nwana-engine ↔ commit**: local commit `2917311` ("Performance distribution
  + dominant performance level per athlete") was created
  `2026-09-29 05:04:53 UTC`, ~19 seconds before the deploy; the deployed worker
  exhibits this commit's feature (production D1
  `athlete_profiles.computed_stats_json` contains `performance_distribution`
  and `dominant_performance_level`, which only this commit's code writes).
  **VERIFIED BOTH**
- **nwana-site**: version 38, id `5c7edb14-818d-4495-95c0-96927d6d9ea0`,
  modified `2026-09-28T23:55:42Z`. **VERIFIED PRODUCTION**
- **nwana-site ↔ commit**: local commit `b415765` ("Integrity Nine completion")
  was created `2026-09-28 23:54:50 UTC`, ~52 seconds before the deploy;
  `b415765` is an ancestor of main HEAD and no `site/` changes exist after it,
  so the deployed site equals the site code at HEAD. **VERIFIED BOTH**
- Local main HEAD: `2917311`. **VERIFIED REPO**
- `origin/main` (local cache): `b9efd601`. Local main is **ahead 651, behind
  14** vs origin/main. **VERIFIED REPO**
- **MISMATCH (explicit): production == local HEAD (`2917311`); `origin/main`
  does NOT match production.** GitHub has not been synced since the deploy
  series. Push via Git Database API (`~/workspace/tools/gh-push-api.py`;
  git-protocol push from this environment is impossible) is pending owner
  decision — not done in this pass.

## 2. Workers, domains, D1 binding

- Account: `President@nwaofna.org's Account`
  (`199927a792a747e791947e67067d7b87`). **VERIFIED PRODUCTION**
- Workers in account: `nwana-engine` (created 2026-09-18), `nwana-site`
  (created 2026-09-22). No other workers. **VERIFIED PRODUCTION**
- `workers.dev` subdomain enabled + previews enabled for both workers.
  **VERIFIED PRODUCTION**
- `https://nwana-engine.nwana-engine.workers.dev/` → 200, returns
  `NWANA Automation & Distribution Engine` JSON. **VERIFIED PRODUCTION**
- `https://nwana-site.nwana-engine.workers.dev/` → 200. **VERIFIED PRODUCTION**
- `https://nwaofna.org/` → 200, `https://www.nwaofna.org/` → 200; both serve
  the site worker content (same `<title>Home | NWANA`). **VERIFIED PRODUCTION**
- Worker `routes` API and zone `workers/routes` API both return empty; the
  Cloudflare API token has no DNS permissions (DNS list → auth error 10000),
  so custom-domain attachment was verified via HTTP serving, not via API.
  **VERIFIED PRODUCTION** (serving) / API attachment detail **UNKNOWN**
- D1 database: `nwana-engine-db` (`b3a8f158-185c-4a37-a61d-a29eb758de7e`),
  created 2026-09-08. Only D1 database in the account. Bound in
  `wrangler.jsonc` as `nwana_engine_db` with the same id. **VERIFIED BOTH**

## 3. Cron / triggers

- `nwana-engine` schedules: exactly one — `17 6 * * *` (06:17 UTC daily),
  created 2026-09-28, modified 2026-09-29. **VERIFIED PRODUCTION**
- `nwana-site` schedules: none. **VERIFIED PRODUCTION**
- `wrangler.jsonc` declares `triggers.crons: ["17 6 * * *"]`; the `*/5 * * * *`
  trigger was removed by ADR-0043. **VERIFIED BOTH**
- Operating cost of the daily cron: 1 request/day of the 100k/day Workers Free
  allowance. **VERIFIED REPO** (documented; free-tier limits checked 2026-09-28)

## 4. Production D1 — tables and live-flow state

64 tables. **VERIFIED PRODUCTION** (full list read from production D1):

- `series_result_approvals` — **3 rows** (the three 5K approvals, source='chat').
- `series_event_deadlines` — **51 rows**.
- `series_auto_process_log`, `series_result_disqualifications`,
  `series_rebuild_progress`, `levels_apply_log` — present.
- `race_event_results` — event `1173956`: `finalized=1`, `result_count=3`,
  `event_date=2026-09-27`, `publication_status='PENDING'` (row-level flag; the
  authoritative publication state lives in `result_publication_history`, §8).
- `race_lifecycle`, `race_event_first_seen` — present.
- `result_publication_history` — event 1173956 key
  `runsignup:series-2026:209477:1173956:664484`, status **PUBLISHED_PARTIAL**,
  editorial draft DRAFT.
- `result_publication_deliveries` — **12 rows total**; the 4 rows for event
  1173956 are PUBLISHED (IDs in §8).
- `athlete_profiles` — **1 row**: `albert-fatikhov` (see §9).
- `series_registrations` — **0 rows**; `series_registration_sync_log` present.
  First live registrations sync has not run (needs owner key).
- `audience_metrics`, `metric_sync_state` — present (canonical metrics layer,
  migration 0046).
- `funds` — **1 row**; `fund_prospects` — **15 rows**; `sellers` — **10 rows**;
  `partners` — **1 row**; `sponsorship_assets` — **0 rows**.
- `media_outlets`, `media_contacts`, `media_submission_endpoints`,
  `media_distributions`, `media_plans`, `media_articles`,
  `media_content_variants`, `media_coverage`, `media_followups` — present
  (row counts not checked in this pass).
- `ahotu_queue` — present.
- `integration_credentials` — providers: `GOOGLE_ADS` (2026-09-19),
  `GOOGLE_ANALYTICS` (2026-09-25), `YOUTUBE` (2026-09-27). No META row —
  Meta uses Worker secret `NWANA_META_TOKEN`. **VERIFIED PRODUCTION**
  (provider names and dates only; secret values never read).
- `audit_events` — contains `audit-4cbdb3d6d82c`, action `PUBLICATION_RESET`,
  module `series-2026`, status COMPLETED, `2026-09-29T03:28:40Z`.
- `objects` — **0 rows. The Registry is NOT seeded in production D1.**
  Canonical registry lives only in `registry/objects.yaml` in the repo (§5).
- `result_card_images` — **table exists**, but migration `0048` is NOT recorded
  in `d1_migrations` (latest recorded: **47**, applied 2026-09-28 23:53:39).
  The table was created outside migration tracking during the superseded
  GitHub Actions experiment (§15). **VERIFIED PRODUCTION** / **VERIFIED REPO**
- Repo has migrations through `0048-result-card-images.sql`; production log
  ends at 47. **MISMATCH (explicit, low risk):** the only delta is the
  superseded 0048 table, which already exists.

## 5. Canonical NWANA objects and source IDs

**VERIFIED REPO** (`registry/objects.yaml`; NOT in production D1 — see §4):

- `NWANA-RACE-000001` → `RUNSIGNUP_TICKETSIGNUP` source_id `209464`,
  purpose `SERIES_PUBLIC_HUB` (`https://series.nwaofna.org/`).
- `RUNSIGNUP_ASSET_ALBERT_FATIKHOV` → source_id `213546`, purpose
  `ATHLETE_ASSET`.
- `RUNSIGNUP_ASSET_NWANA_SPORT` → source_id `212466`, purpose `SPORT_ASSET`.
- `RUNSIGNUP_ASSET_PARTNER_NETWORK` → source_id `214054`, purpose
  `PARTNER_NETWORK`.

Series 2026 race containers, **VERIFIED REPO** (`src/series-2026-results.ts`;
defined in code, not in `registry/objects.yaml`):

- 1K: raceId `209980`, raceSeriesId 1444, raceSeriesYearId 2110
- 3K: raceId `210000`, raceSeriesId 1447, raceSeriesYearId 2112
- 5K: raceId `209477`, raceSeriesId 1439, raceSeriesYearId 2102
- 10K: raceId `210018`, raceSeriesId 1449, raceSeriesYearId 2114
- 15K: raceId `210016`, raceSeriesId 1448, raceSeriesYearId 2113
- 20K: raceId `210020`, raceSeriesId 1450, raceSeriesYearId 2115

## 6. RunSignup / TicketSignup integration

- Public results API: working — the three 5K results were live-verified
  against it. **VERIFIED PRODUCTION**
- Participants API: has never returned data in production (648 sync attempts,
  all 0 rows). Registration state is therefore UNKNOWN, not zero; the
  unregistered-athlete exception applies only when registration data is
  actually present (fixed 2026-09-28). **VERIFIED PRODUCTION** (behavior) /
  **VERIFIED REPO** (fix in code)
- Registrations sync (`POST /api/series-2026/registrations/sync`,
  migration 0043): code deployed, owner-key gated, **0 rows synced** — first
  live sync pending. **VERIFIED BOTH**
- Approve endpoint refuses results absent from live RunSignup data.
  **VERIFIED REPO**
- RunSignup website-question inbox: none found in the dashboard (checked
  2026-09-29 via live browser as `president@nwaofna.org`); form questions are
  delivered to `info@nwaofna.org` email only. **VERIFIED PRODUCTION**
  (manual check)

## 7. Result lifecycle and approval flow (ADR-0042 / ADR-0043)

- Owner's single reserved action: approving an athlete's result. After approval
  the Machine runs the full downstream autonomously
  (levels/places/points → standings → website results/Winners → winner news →
  social → next-race promotion). No per-step confirmations. The Machine never
  approves results itself. **VERIFIED REPO** (ADR-0042, code)
- Trigger per event: (A) all expected participants submitted and every result
  approved, or (B) the official submission deadline passed (only approved
  results processed). **VERIFIED REPO**
- Event-driven processing: immediate downstream after the last owner decision
  (ADR-0043), plus the daily 06:17 UTC deadline wake-up. **VERIFIED BOTH**
- Disqualify model: DSQ = 0 points, excluded from scoring, Performance
  Level/Level Place fields cleared in RunSignup on rebuild.
  **VERIFIED REPO** (migration 0045 applied to production D1 2026-09-28 —
  **VERIFIED PRODUCTION** that the table exists)
- 5K event 1173956 (2026-09-27): 3 approvals recorded 2026-09-28
  (source='chat'), event finalized. **VERIFIED PRODUCTION**
- OC Sport → Results: approval UI (Actions), athlete pipeline table
  Registered → Submitted → Approved → Processed → Published (Details); manual
  Publish removed from the standard flow. **VERIFIED REPO**

## 8. Publication flow

- Event 1173956 aggregate status: **PUBLISHED_PARTIAL**.
  **VERIFIED PRODUCTION**
- Deliveries PUBLISHED (4): **VERIFIED PRODUCTION**
  - `FACEBOOK_NWANA` → `122211340520875474`
  - `FACEBOOK_NORDIC_WALKING_SPORT` → `1066579789505053`
  - `INSTAGRAM_NWANA_OFFICIAL` → `17966156247189824`
  - `INSTAGRAM_N_W_SPORT` → `18126023974894438`
- `site_news` and `next_race_promo` skipped as already-existing duplicates;
  winner-news editorial draft remains **DRAFT** (`ready_for_approval=true`) —
  one owner approval pending. **VERIFIED PRODUCTION**
- Canonical rule: publication builds from the D1 canonical snapshot; RunSignup
  read is not mandatory in the publication path (commit `a4160e4`).
  **VERIFIED BOTH**
- `buildResultCardSvg()` is the single canonical card generator; rasterization
  is in-Worker via `@resvg/resvg-wasm` (SVG→PNG, no external service).
  **VERIFIED BOTH**
- `@resvg/resvg-wasm` in `package.json` is `^2.6.2`; lockfile resolves to
  exactly `2.6.2`. **VERIFIED REPO** (exact pin `2.6.2` without caret is still
  open)
- Audit: the single direct-D1 lifecycle intervention is recorded as
  `audit-4cbdb3d6d82c` (`PUBLICATION_RESET`, method `direct_d1_reset`).
  **VERIFIED PRODUCTION**

## 9. Athlete-profile / status logic

- `athlete_profiles.slug='albert-fatikhov'`: `athlete_role =
  "Competitive Nordic Walking athlete; NWANA Elite Athletes Club member"`,
  `org_role = "President of the Nordic Walking Association of North America"`.
  **VERIFIED PRODUCTION**
- **MISMATCH (explicit, known):** the canonical-status rule (commits `971ca04`,
  `2917311`) requires the canonical status to read Elite; the production
  profile row still carries the old "Competitive…" role string. Not corrected
  in this pass — needs the canonical profile write path, not a direct D1 edit.
- `computed_stats_json`: 25 starts, 25 finishes, 25 wins; `best_times`
  1K 5:36 / 3K 18:25 / 5K 30:38 / 10K 1:15:15 / 15K 1:54:04 / 20K 2:45:08;
  `performance_distribution` = Elite 64 / High Performance 8 / Performance 4 /
  Competitive 20 / Open 4; `dominant_performance_level` = Elite.
  **VERIFIED PRODUCTION**
- Architectural rule: canonical athlete status comes only from the athlete
  profile + verified credentials, never derived from race results; the Machine
  reports the performance-level distribution and names a dominant level only
  on absolute majority (>50%). **VERIFIED REPO** (commits `971ca04`, `2917311`;
  713/713 tests at that commit)

## 10. GA4 and Google Ads

- GA4: `connected: true`, `configured: true`, property `534556675`,
  `execution_allowed: false`. **VERIFIED PRODUCTION**
  (`/integrations/google-analytics/status`, public)
- Google Ads: `connected: true`, `configured: true`, access level `EXPLORER`,
  customer `customers/6758500147`, `execution_allowed: false`.
  **VERIFIED PRODUCTION** (`/integrations/google-ads/status`, public)
- 2026-08-26 → 2026-09-28 account totals: 1599 impressions, 88 clicks,
  $895.64 cost, 99 conversions — clicks/cost match owner-verified UI figures.
  **VERIFIED PRODUCTION** (live API check 2026-09-28; re-check not run in this
  pass)
- Developer token: not required (Google sunset 2026-09-09); the
  `GOOGLE_ADS_DEVELOPER_TOKEN` requirement was removed from code.
  **VERIFIED BOTH**

## 11. Meta / Facebook / Instagram / YouTube

- Meta: `connected: true`, 4 destinations — Facebook `NWANA`, Instagram
  `nwana.official`, Facebook `Nordic Walking Sport`, Instagram `n_w_sport`;
  `execution_allowed: false`. **VERIFIED PRODUCTION**
  (`/integrations/meta/status`, public)
- Auth: 60-day long-lived user token as Worker secret `NWANA_META_TOKEN`
  (covers two business portfolios); the 4 PUBLISHED deliveries (§8) prove it
  works. Exact expiry date **NEEDS CHECK** (prior record: ~2026-11-26;
  renewal reminder still open).
- YouTube: `connected: true`, `configured: true`, channel
  `UC2f_TSMW1BWKThUy6XV1onw` ("NORDIC WALKING ASSOCIATION OF NORTH AMERICA
  NWANA"), 20 subscribers, 9115 total views, 18 videos.
  **VERIFIED PRODUCTION** (`/integrations/youtube/status`, public)
- YouTube OAuth is in Testing mode: re-consent due ~2026-10-04 (prior record).
  **NEEDS CHECK**
- Threads: no API integration — posts are manual copy-paste; needs
  `threads_basic` token (Worker secret `THREADS_ACCESS_TOKEN`).
  **VERIFIED REPO** (`OWNER-ACTION-REQUIRED.md`)
- LinkedIn: no API integration; OC shows stale "8 followers (2026-09-22)".
  Needs Community Management API app + token. **VERIFIED REPO**
  (`OWNER-ACTION-REQUIRED.md`)

## 12. Funds, sponsorship, sellers, partners

Counts **VERIFIED PRODUCTION** (production D1, 2026-09-29):

- `funds`: 1 · `fund_prospects`: 15 · `sellers`: 10 · `partners`: 1 ·
  `sponsorship_assets`: 0
- Media distribution tables (`media_outlets`, `media_contacts`,
  `media_submission_endpoints`, …) present; row counts not checked in this pass.
- Moodle / NWANA Academy: not connected — needs web-services token
  (`MOODLE_API_TOKEN`). **VERIFIED REPO** (`OWNER-ACTION-REQUIRED.md`)
- Membership / licenses / NW Groups: no source system exists anywhere
  (decision A/B open). **VERIFIED REPO** (`OWNER-ACTION-REQUIRED.md`)

## 13. Scheduled / recurring work actually deployed

- One Cloudflare cron on `nwana-engine`: `17 6 * * *` (deadline wake-up).
  **VERIFIED PRODUCTION** — the only recurring trigger in the account.
- No cron on `nwana-site`. **VERIFIED PRODUCTION**
- 1 of 5 free-plan cron slots used. Operating cost: VERIFIED $0.
  **VERIFIED BOTH**

## 14. Owner-only actions still requiring manual approval

**VERIFIED REPO** (ADR-0042, OC design, `OWNER-ACTION-REQUIRED.md`):

- Approving an athlete's result (OC Sport → Results, or chat) — the single
  reserved action; everything downstream is autonomous.
- Approving the winner-news editorial draft (5K: currently DRAFT —
  **VERIFIED PRODUCTION**).
- OC Actions tabs contain only real manual owner actions (Machine automation
  stays primary).
- Outside the Machine: Zelle license refund to Kimberly Spears (amount
  unknown; not sent); LinkedIn post (manual); PRLog (needs owner-created
  account); YouTube weekly re-consent (~2026-10-04); Meta token renewal
  (~2026-11-26); Threads/LinkedIn/Moodle credentials; membership system
  decision (A/B).

## 15. Known production limitations / broken integrations

- RunSignup participants feed returns 0 rows in production → registration
  counts unknown; `series_registrations` = 0 rows (first live sync pending
  owner key). **VERIFIED PRODUCTION**
- Production D1 `objects` table is empty — Registry reconciliation not seeded;
  canonical registry exists only in repo. **VERIFIED PRODUCTION** /
  **VERIFIED REPO**
- Threads / LinkedIn / Moodle: no API integration (see §11–12).
  **VERIFIED REPO**
- Albert's production `athlete_role` still reads "Competitive…" (see §9).
  **VERIFIED PRODUCTION**
- `SYSTEM_STATE.md` still documents older deployed versions
  (`e62df23f` / `0509b342`) — stale relative to §1. **VERIFIED REPO**
- Integrity Nine PDF (`~/workspace/your_files/…Integrity_Nine.pdf`) is dated
  2026-09-28 and predates the 2026-09-29 fixes (not rebuilt in this pass).
  **VERIFIED REPO** (file date)
- `@resvg/resvg-wasm` is `^2.6.2` in package.json (lockfile: exactly 2.6.2);
  exact pin without caret still open. **VERIFIED REPO**

## 16. DO NOT REINTRODUCE

Superseded or forbidden paths, with the commit that removed them
(**VERIFIED REPO** via git history):

- GitHub Actions SVG→PNG pipeline (`ec556e1`; removed by `28c0512`).
  Remnants: `result_card_images` table + migration `0048` (see §4).
- Baked JPEG result cards (`c6c9e93`; reverted by `4ef6739`).
- Text-only social fallback without approval (`bb790b9`; removed).
- Cloudflare Images SVG rasterization (IMAGES_TRANSFORM_ERROR 9412;
  replaced by in-Worker `@resvg/resvg-wasm`).
- Direct D1 lifecycle edits bypassing the audit trail. The single historical
  instance is `audit-4cbdb3d6d82c` (method `direct_d1_reset`).
- `*/5 * * * *` cron trigger (removed by ADR-0043; Albert's 2026-09-18
  removal stands).
- `GOOGLE_ADS_DEVELOPER_TOKEN` requirement (Google sunset the token
  2026-09-09).
- Mandatory RunSignup read in the publication path (removed by `a4160e4`;
  publication builds from the D1 canonical snapshot).
- Deriving canonical athlete status from race results (forbidden by `971ca04`;
  status comes only from profile + verified credentials).
- Race-specific workarounds; hardcoded athlete/result/date/publicationKey;
  demo production data.

## 17. Repo state at snapshot time

- HEAD `2917311`, tree clean except untracked `src/assets/fonts/`
  (`LiberationSans-Regular.ttf`, `LiberationSans-Bold.ttf`, ~825 KB).
  **VERIFIED REPO**
- The TTFs are the source artifacts for the base64 embedded in the tracked
  `src/assets/fonts.ts` (which is what the build bundles); the deployed
  worker renders text correctly without the untracked files. **MISMATCH
  (explicit):** untracked — commit them or delete them (owner decision; not
  resolved in this pass).
- No GitHub Actions / PAT in use. **VERIFIED REPO**

---

*End of snapshot. Next Muse: start from this file + `SYSTEM_STATE.md` +
`OPERATING_PLAN.md` + `docs/adr/`. Do not reconstruct state from chat memory.*
