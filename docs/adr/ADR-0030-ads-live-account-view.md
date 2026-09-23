# ADR-0030: Google Ads Screen as a Read-Only Operational View of the Real Account

Status: Accepted
Date: 2026-09-23

## Context

ADR-0029 removed the hardcoded "Not connected" state from `/operating-center/ads`
and made it show the real connection state from the existing OAuth integration
(`src/google-ads.ts`). The screen was still a connection-status screen: it did
not show what actually exists inside the connected account.

## Decision

The Ads screen is now a read-only operational view of the real Google Ads
account `customers/6758500147`:

- `src/google-ads.ts` gains `getGoogleAdsAccountSnapshot()`: one bounded
  read-only GAQL request per call via the existing OAuth integration (refresh
  token from D1, `googleAds:search`). It returns per-campaign name, status,
  daily budget, impressions, clicks, conversions, and cost for
  `DURING LAST_30_DAYS`, excluding REMOVED campaigns. It never throws: failures
  come back as `{ ok: false, error }` with the real API message.
- `getAdsOverview()` accepts an injectable account reader (default: the real
  one) and exposes `live_account` (`available`, `customer_id`, `date_range`,
  `campaigns`, `error`).
- The screen shows a `LIVE GOOGLE ADS ACCOUNT` block: real campaigns with
  status, daily budget, impressions, clicks, conversions, spend. Empty account
  shows "No campaigns found in the connected Google Ads account." A read
  failure shows the real error, separately from the connection state. No
  invented zeros.
- `PLANNED / NOT CREATED` stays separate below; live campaigns are never
  mixed with the planned spec.
- The downloadable Ads report carries the same live snapshot and the separate
  planned section.

## Non-goals (unchanged)

No campaign creation, no changes to campaigns, no pause/enable, no budget
changes, no keywords or ads, no Google Analytics integration, no OAuth or
secret changes, no other screen changes, no cron/polling/recurring sync, no
copying live campaign data into D1. `google-ads-state.ts` (the planned spec)
is untouched; mutation/execution stays disabled.

## GAQL used

```
SELECT campaign.id, campaign.name, campaign.status,
       campaign_budget.amount_micros,
       metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros
FROM campaign
WHERE campaign.status != 'REMOVED'
AND segments.date DURING LAST_30_DAYS
```

Bugfix 2026-09-23: the first version of this ADR shipped the date range as a
bare `DURING LAST_30_DAYS` clause after FROM, which is invalid GAQL. The
Google Ads API requires the date range as a condition on `segments.date`.
Only the query changed; fields, endpoint, and everything else are untouched.

Endpoint: `POST https://googleads.googleapis.com/v22/customers/6758500147/googleAds:search`
with `Authorization: Bearer <refreshed access token>`.

## Consequences

Each open/refresh of the Ads screen performs one bounded read-only API
request. There is no background polling. Tests stub the account reader, so the
suite never touches Google.
