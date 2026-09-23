# ADR-0029: Ads screen reads the live Google Ads integration

Date: 2026-09-23
Status: Accepted, deployed

## Context

The ADR-0027 Ads screen (`/operating-center/ads`) hardcoded
`google_ads: { connected: false }` with the note "Not connected. The owner
login for the Google Ads account is not established, so the machine has
not created or touched any campaign." That statement was factually
wrong: the Google Ads API integration has been live and verified since
2026-09-19 (`SYSTEM_STATE.md`, section GOOGLE ADS API — VERIFIED
2026-09-19): OAuth completed as admin@nwaofna.org, connected=true,
configured=true, access_level=EXPLORER, accessible production customer
customers/6758500147, encrypted refresh token in remote D1, campaign
creation/mutation disabled.

The screen must read the existing live integration
(`getGoogleAdsStatus()` in `src/google-ads.ts`), never a hardcoded flag.
Google Analytics is deliberately untouched by this change; its honest
"not set up" state stays as is.

## Decision

- `getAdsOverview()` becomes `getAdsOverview(env, readStatus)` and is
  async. The default reader is the real `getGoogleAdsStatus(env)` from
  the existing integration; the injectable parameter exists so tests can
  stub the status without calling Google. `google-ads-state.ts` (the
  ADR-0016 desired-state spec) is untouched.
- The `AdsOverview.google_ads` block now carries the real state:
  connected, configured, access_level, customers, execution_allowed,
  plus the actual error when the integration fails, and an honest
  human-readable note built from that state. The planned campaigns
  section stays as a separate "Planned / not created" block; the stale
  "will show once connected" list is replaced by "What this screen
  shows today".
- The screen's client script renders a green "Connected" badge when the
  integration is connected and shows access level, accessible
  account(s), and execution/mutation status; on failure it shows the
  real error. The hardcoded "Not connected" text and the "owner login
  ... not established" claim are removed. The Analytics block is
  unchanged.
- The downloadable Ads report (`buildAdsReport`) uses the same real
  state: a green "Connected" tag with the account(s) when connected,
  the real error when broken; it no longer claims Ads is not connected.
- No campaigns are created or changed, execution/mutation stays
  disabled, OAuth credentials and secrets are untouched, no new
  integration is created, no cron or polling is added, and no other
  operating-center screen is modified.

## The no-fabrication rule, enforced

Three new regression tests in
`test/operating-center-screens.spec.ts` pin the rule: with a stubbed
connected status the overview JSON and the report HTML must never
contain a "Not connected" claim for Google Ads; a stubbed connection
error must surface the real error text in both the overview and the
report; a stubbed missing configuration must render the honest
missing-config note. The existing ads test that asserted the hardcoded
`connected: false` is replaced.

## Verification

- `npx tsc --noEmit` clean.
- Vitest 252/252 (21 files).
- Live: `/operating-center/ads` renders the real connected state;
  `/api/operating-center/ads/overview` and
  `/api/operating-center/report/ads` remain 401 without the owner key.
- No Google Ads mutations: the change only reads status.

## Consequences

- The Ads screen can no longer drift from the integration again: any
  future "Not connected" claim on the screen or in the report must come
  from the live status function, and the regression tests fail if a
  hardcoded flag is reintroduced.
- When the integration genuinely breaks (revoked token, missing
  secret), the screen shows the real error instead of a stale blanket
  statement, so the failure is diagnosable from the operating center.
