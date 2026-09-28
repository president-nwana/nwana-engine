# OWNER ACTION REQUIRED — Audience Data Integrations

**Date:** 2026-09-28
**Context:** NWANA Engine is now the canonical source for audience/analytics/ads/social/participation data. The integrations below require owner actions that cannot be completed by the Machine. Each item lists exactly what is needed, why, and step-by-step how to grant it.

**Operating cost of all items below:** $0 (all use free tiers / free account features).

---

## 1. Google Ads — Developer Token

**Need:** Google Ads API developer token, stored as Worker secret `GOOGLE_ADS_DEVELOPER_TOKEN`.

**Why:** The Engine's Google Ads integration is OAuth-connected and code-complete, but the Google Ads API refuses ALL requests without a developer-token header. Until this token exists, every Ads metrics read returns `OWNER_ACTION_REQUIRED` instead of live data. This is the single blocker for verifying the 88 clicks / ~$895.60 Ad Grant figures in production.

**Account:** The Google Ads account holding customer ID `6758500147` (or its Manager/MCC account — the token lives on the MCC).

**Steps:**
1. Open [ads.google.com](https://ads.google.com) and sign in as the Google Ads admin.
2. If you do not have a Manager (MCC) account: go to [ads.google.com/home/tools/manager-accounts/](https://ads.google.com/home/tools/manager-accounts/) → "Create a manager account" (free, no ads required) → link the existing account `675-850-0147`: Accounts → Sub-account settings → **+** → Link existing account → enter the customer ID → accept the invitation from inside the regular Ads account.
3. In the Manager account: **Admin** (or Tools & Settings → Setup) → **API Center**.
4. Accept the Google Ads API Terms of Service. The developer token is issued immediately — copy it (reveal with "View token").
5. In the API Center, expand **Access level** → click **"Apply for Basic Access"** → describe the use case: "Internal read-only reporting for our own nonprofit Ad Grant account — campaign performance metrics only, low request volume, no third-party accounts." Approval typically takes 24–48 hours. (New tokens start at test-account-only access; Basic Access is required for production data.)
6. Send the token value back. I will store it as the Worker secret `GOOGLE_ADS_DEVELOPER_TOKEN` (never in chat, never in code).

**Reversible:** Yes — the token can be regenerated or revoked in API Center at any time.

**Send back:** The developer token string (via the secure credential flow I will provide), plus confirmation when Basic Access is approved.

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

**Why:** LinkedIn has no integration at all today — the Engine shows a hardcoded "8 followers (observed 2026-09-22)". The official API provides follower counts and follower statistics (including by geography) at $0.

**Account:** A LinkedIn account that is a **super admin** of the NWANA company page (`linkedin.com/company/nwana`).

**Steps:**
1. Open [developer.linkedin.com/apps](https://developer.linkedin.com/apps) → **Create app** → fill in app name ("NWANA Engine"), associate it with the **NWANA company page** (LinkedIn verifies via a link a page admin must click: app → Settings → Verify).
2. **Products** tab → find **Community Management API** → **Request access** → fill the form (reason: "Read-only analytics for our own company page — follower counts and engagement statistics"). Approval ranges from instant (development tier) to a short review.
3. **Auth** tab → note the **Client ID** and **Client Secret** (needed only if we later switch to full OAuth; for now the token generator suffices).
4. Generate a token: [linkedin.com/developers/tools/oauth/token-generator](https://www.linkedin.com/developers/tools/oauth/token-generator) → select the app → check scopes `r_organization_social`, `r_organization_followers`, `rw_organization_admin` → Request Access Token → sign in as the page admin → copy the token (~60-day lifetime; I will build the refresh reminder).
5. Find the Organization ID: open the company page as admin — the URL contains `/company/<number>/admin/` — the **number alone** is the ID.
6. Send back via the secure credential flow: the access token + the organization ID number.

**App review:** The Community Management API product request IS the review — no separate Marketing Developer Platform review needed for read-only org analytics.

**Reversible:** Yes — revoke the token in the app's Auth tab at any time.

**Send back:** Access token (secure flow) + organization ID number + confirmation the Community Management API product is approved.

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
| 1 | Google Ads | Developer token → secret `GOOGLE_ADS_DEVELOPER_TOKEN` | Live Ads metrics + verification of 88 clicks / $895.60 | Yes | Yes |
| 2 | Threads | `threads_basic` token → secret `THREADS_ACCESS_TOKEN` | Threads followers/insights | Yes | Yes |
| 3 | LinkedIn | Community Management API + token → secret `LINKEDIN_ACCESS_TOKEN` + org ID | LinkedIn followers/stats (replaces hardcoded "8") | Yes | Yes |
| 4 | Moodle | Web services token → secret `MOODLE_API_TOKEN` | Academy users/enrollments/completions | Yes | Yes |
| 5 | Membership/Groups | Decision: Engine-owned D1 tables (A) or external system (B) | Member/license/group metrics | Yes | n/a |

**Note on credential delivery:** For each token, I will provide a secure credential-capture link when you are ready — tokens go straight to secure storage, never through chat text. Say the word for any item and I will start its flow.
