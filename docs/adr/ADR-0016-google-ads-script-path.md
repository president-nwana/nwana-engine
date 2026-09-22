# ADR-0016: Google Ads via in-account script first, API later

Date: 2026-09-22
Status: Accepted

## Context

Google Ads is a machine distribution channel per Engine.docx: the machine must
add/update campaigns for each object. NWANA holds an active Google Ad Grant.
Research on 2026-09-22 established:

- Developer tokens were sunset on 2026-09-09. API access now attaches to a
  Google Cloud project with tiers (Test / Explorer / Basic / Standard).
  Campaign writes need the Basic tier, which requires brand verification of
  the Cloud project (nwaofna.org) plus an automated application.
- No API restrictions specific to Ad Grants accounts were found, but Ad Grants
  program policy must be encoded in every created campaign (search only, no
  search partners, no content network, $2.00 max CPC unless smart bidding,
  5% account CTR, 2+ sitelinks, conversion tracking, 2+ ad groups per
  campaign, 2+ ads per ad group, no single-word keywords, deliberate
  geo-targeting, $329/day shared budget).
- Service accounts are now Google's recommended backend auth, but that path
  still waits on brand verification (the slow human-gated step).
- Google Ads scripts run inside the Ads account with zero API onboarding:
  paste once, authorize, schedule hourly.

## Decision

Ship the script path first, pursue the API path in parallel:

1. The machine publishes a validated desired state at
   `GET /api/operating-center/google-ads/desired-state` (owner key).
2. `src/google-ads-state.ts` builds the spec and enforces every Ad Grants
   policy rule in code. A violation fails the build, never the live account.
3. `google-ads/nwana-reconcile-script.js` reconciles the account hourly:
   creates missing campaigns PAUSED, adds missing ad groups/keywords/ads/
   sitelinks, updates budgets. It never enables anything and never touches
   campaigns outside the `NWANA \u00b7 ` name prefix.
4. Campaigns are created PAUSED. A human reviews networks, locations, bidding,
   and ad copy in the Ads UI, then enables only approved campaigns
   (Albert's "presses Send" model; advertiser responsibility for AI-assisted
   content).

Initial desired state: one campaign per live machine object.
- `NWANA \u00b7 Series 2026 \u00b7 Virtual Races` ($200/day) -> series.nwaofna.org
- `NWANA \u00b7 Founding Circle \u00b7 Donate` ($100/day) -> RunSignup donation page
Total $300/day stays under the $329 grant cap.

## Consequences

- First machine-created campaign can go live within days of one ~20-minute
  human session in the Ads UI (paste script, store the owner key in script
  properties, authorize, schedule hourly).
- The Cloud project + brand verification work for the full API path can
  proceed in parallel without blocking distribution.
- The validator module is shared: when the API path lands, it consumes the
  same specs and the same policy checks.
