# OWNER ACTION REQUIRED — Audience Data Integrations

**Date:** 2026-09-28
**Context:** NWANA Engine is now the canonical source for audience/analytics/ads/social/participation data. The integrations below require owner actions that cannot be completed by the Machine. Each item lists exactly what is needed, why, and step-by-step how to grant it.

**Operating cost of all items below:** $0 (all use free tiers / free account features).

---

## 1. Google Ads — RESOLVED 2026-09-28 (no owner action needed)

**Status:** RESOLVED — verified live in production. Google sunset developer
tokens on 2026-09-09: the `developer-token` header is optional and ignored by
the API servers; production access is determined by the Google Cloud project
that owns the OAuth client. The Engine's newly added
`GOOGLE_ADS_DEVELOPER_TOKEN` requirement was obsolete and has been removed
from the code (the legacy header is sent only if still configured, never
required).

**Verified 2026-09-28 (live production API, no developer token sent):**
- Cloud project number: `440660818183` (project "NWANA ChatGPT Connector")
- OAuth: the Worker uses the stored "NWANA Engine Google Ads" OAuth
  credentials — refresh succeeds; the client belongs to project 440660818183
- `customers:listAccessibleCustomers` → `customers/6758500147`
- GAQL campaign search 2026-08-26 → 2026-09-28
- Aug 26 – Sep 28 account totals: **1599 impressions, 88 clicks, $895.64
  cost, 99 conversions** — clicks and cost match the owner-verified UI
  figures (88 / ~$895.60)
- Production access confirmed working (at least Explorer level; the exact
  tier — Explorer / Basic / Standard — is visible in Cloud Console → Google
  Ads API Overview for project 440660818183)

**Owner action:** none. To confirm or raise the tier, open
`https://console.cloud.google.com/google/ads-apis/overview?project=440660818183`
in the Cloud Console — the current level already serves production reads.
---

## 2. Threads — API Access

**Need:** Threads API access for `@nwana.official` via a Meta developer app with the `threads_basic` permission; the resulting long-lived token stored as Worker secret `THREADS_ACCESS_TOKEN`.

**Why:** There is no Threads read integration today — the Engine posts to Threads only as a manual copy-paste channel. The Threads API supports profile reads (`followers_count`) and account insights (`views, likes, replies, reposts, quotes`) at $0.

**Account:** The Meta developer app that owns the NWANA Meta assets (same Business portfolio as the Facebook/Instagram connection).

**Steps:**
1. Open [developers.facebook.com/apps](https://developers.facebook.com/apps) → select the NWANA app (or create one: Create App → Business type → associate with the NWANA Business portfolio).
2. In the app dashboard: **Add Product** → **Threads** → Set up.
3. Under Threads → **API Setup**: add `threads_basic` to the app's permissions. (For insights: also request `threads_insights` if listed separately.)
4. Generate a token: use the **Graph API Explorer** ([developers.facebook.com/tools/explorer](https://developers.facebook.com/tools/explorer)) → select the NWANA app → add permission `threads_basic` → Generate Access Token → sign in as the `@nwana.official` Threads account admin → authorize.
5. Exchange for a long-lived token (I will do this step once you send the short-lived token — or follow Meta's documented exchange: `GET graph.threads.net/oauth/access_token?grant_type=th_exchange_token`).
6. Send the token back via the secure credential flow.

**App review:** Not required for reading your own account's data with an app in Development mode (the token owner is the account admin). Publishing permissions would need review — we only need read.

**Reversible:** Yes — revoke the token or remove the app permission at any time.

**Send back:** The Threads access token (secure flow), or confirmation that the app + permission are set up and I should walk through token generation with you.

---

## 3. LinkedIn — Company Page API Access

**Need:** LinkedIn developer app with the **Community Management API** product; `r_organization_social` (+ `r_organization_followers` for follower stats) granted; access token stored as Worker secret `LINKEDIN_ACCESS_TOKEN`; organization ID for `linkedin.com/company/nwana`.

**Why:** LinkedIn has no integration at all today — the Engine shows a stale "8 followers (last observed 2026-09-22)". The official API provides follower counts and follower statistics (including by geography) at $0.

**Account:** A LinkedIn account that is a **super admin** of the NWANA company page (`linkedin.com/company/nwana`).

**Documented risk (verified 2026-09-28):** LinkedIn's docs describe the Community Management APIs as available to registered legal organizations for *commercial* use cases. NWANA is a 501(c)(3) nonprofit — a nonprofit-specific access path is not confirmed in the docs. Step 7 below resolves this before any implementation work.

**Steps:**
1. Open [developer.linkedin.com/apps](https://developer.linkedin.com/apps) → **Create app** → fill in app name ("NWANA Engine"), associate it with the **NWANA company page** (LinkedIn verifies via a link a page admin must click: app → Settings → Verify).
2. **Products** tab → find **Community Management API** → **Request access** → fill the form (reason: "Read-only analytics for our own company page — follower counts and engagement statistics").
3. **Auth** tab → note the **Client ID** and **Client Secret** (needed only if we later switch to full OAuth; for now the token generator suffices).
4. Generate a token: [linkedin.com/developers/tools/oauth/token-generator](https://www.linkedin.com/developers/tools/oauth/token-generator) → select the app → check scopes `r_organization_social`, `r_organization_followers`, `rw_organization_admin` → Request Access Token → sign in as the page admin → copy the token (~60-day lifetime; I will build the refresh reminder).
5. Find the Organization ID: open the company page as admin — the URL contains `/company/<number>/admin/` — the **number alone** is the ID.
6. Send back via the secure credential flow: the access token + the organization ID number.
7. **Nonprofit eligibility check:** confirm in the app's Products tab (or LinkedIn support reply) that the Community Management API product is approved for our 501(c)(3) organization. If LinkedIn denies nonprofit access, this item becomes `NO_SUPPORTED_ACCESS_PATH` and the stale follower count stays as the last verified observation — no further action.

**App review:** The Community Management API product request IS the review — no separate Marketing Developer Platform review needed for read-only org analytics.

**Reversible:** Yes — revoke the token in the app's Auth tab at any time.

**Send back:** Access token (secure flow) + organization ID number + confirmation the Community Management API product is approved (steps 2 and 7).

**Until then:** LinkedIn stays `OWNER_ACTION_REQUIRED`; the last verified observation (8 followers, 2026-09-22) is shown as STALE, never as live data.

---

## 4. Moodle / NWANA Academy — Web Services Token

**Need:** Moodle web services enabled on `academy.nwaofna.org` + a dedicated external service + a token with read functions; token stored as Worker secret `MOODLE_API_TOKEN`.

**Why:** The Academy shows "Moodle not connected" — there is zero API integration. Moodle's built-in web services provide user counts, enrollments, course completions, and certifications at $0.

**Account:** Moodle site administrator on `academy.nwaofna.org`.

**Steps:**
1. Log in to `academy.nwaofna.org` as site admin.
2. **Site administration → Advanced features** → tick **Enable web services** → Save.
3. **Site administration → Server → Web services → Manage protocols** → enable **REST protocol**.
4. **Site administration → Server → Web services → External services** → **Add** → name: `NWANA Engine` → tick **Enabled** + **Authorised users only** → Save.
5. Click **Functions** for the new service → **Add functions** → add:
   - `core_user_get_users` (user counts)
   - `core_course_get_courses` (course list)
   - `core_enrol_get_enrolled_users` (enrollments per course)
   - `core_completion_get_activities_completion_status` (completions)
   - `core_webservice_get_site_info` (connectivity test)
6. Back on the service page → **Authorised users** → add a dedicated service account (recommended: create a new user `nwana-engine-api` with no course roles; or use an existing admin).
7. **Site administration → Server → Web services → Manage tokens** → **Create token** → select the service account + the `NWANA Engine` service → Save → copy the token.
8. Send the token + the site's exact base URL back via the secure credential flow.

**Reversible:** Yes — delete the token or disable the service at any time.

**Send back:** The token (secure flow) + confirmation of the 5 functions above.

---

## 5. Membership / NW Groups — No Source System Exists

**Status:** `NO_SUPPORTED_ACCESS_PATH` (verified 2026-09-28 — no D1 tables, no API code, no external registry).

**What this means:** There is no membership database, licensing system, or group registry anywhere — not in the Engine, not in RunSignup, not in an external service. Memberships, licenses, and NW Groups are currently managed outside any system the Machine can read.

**Not an owner action on a platform** — this is a build decision:
- **Option A (recommended, $0):** The Engine builds `members`, `licenses`, `nw_groups`, `group_members` tables in D1 + OC Board/Growth screens for manual management. The Machine becomes the system of record.
- **Option B:** Albert designates an external system (e.g. a RunSignup membership product, a CRM, a spreadsheet) and the Engine integrates with it.

**Send back:** Decision — A or B. If B, which system.

---

## Summary Table

| # | Platform | Need | Blocks | $0 | Reversible |
|---|----------|------|--------|----|------------|
| 1 | Google Ads | RESOLVED 2026-09-28 — no action needed (token sunset; access via Cloud project, verified live: 1599 impr / 88 clicks / $895.64 / 99 conv) | Live Ads metrics + verification of 88 clicks / $895.60 | No | — |
| 2 | Threads | `threads_basic` token → secret `THREADS_ACCESS_TOKEN` | Threads followers/insights | Yes | Yes |
| 3 | LinkedIn | Community Management API + token → secret `LINKEDIN_ACCESS_TOKEN` + org ID | LinkedIn followers/stats (replaces hardcoded "8") | Yes | Yes |
| 4 | Moodle | Web services token → secret `MOODLE_API_TOKEN` | Academy users/enrollments/completions | Yes | Yes |
| 5 | Membership/Groups | Decision: Engine-owned D1 tables (A) or external system (B) | Member/license/group metrics | Yes | n/a |

**Note on credential delivery:** For each token, I will provide a secure credential-capture link when you are ready — tokens go straight to secure storage, never through chat text. Say the word for any item and I will start its flow.
