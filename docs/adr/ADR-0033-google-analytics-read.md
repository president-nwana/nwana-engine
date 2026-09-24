# ADR-0033: Google Analytics 4 Read-Only Traffic Connection

Status: Accepted
Date: 2026-09-24

## Context

The owner corrected the project's GA4 assessment on 2026-09-24: NWANA already
owns a GA4 property. No new property is created.

- Analytics account: NORDIC WALKING ASSOCIATION OF NORTH AMERICA (392577582)
- GA4 property: NORDIC WALKING ASSOCIATION OF NORTH AMERICA (534556675)
- Google account: admin@nwaofna.org (same account as Google Ads / Ad Grants)

A public tag audit on 2026-09-24 found gtag measurement IDs in page source:

- nwaofna.org, sport.nwaofna.org, groups.nwaofna.org, series.nwaofna.org,
  pathways.nwaofna.org, albertfatikhov.nwaofna.org, ticketsignup.io/w/nwaofna:
  `G-8RYTY6M2KD` and `G-QKEVS8BTWC`
- academy.nwaofna.org (Moodle): `G-8RYTY6M2KD` only
- nwana-site.nwana-engine.workers.dev (next-gen site, future nwaofna.org):
  no GA tag installed
- www.nwaofna.com: DNS does not resolve

The `G-QKEVS8BTWC` tag ships a gtag config with `domain: runsignup.com,
business_line: RunSignup`, so it is most likely RunSignup's own cross-site
tag, not NWANA's; `G-8RYTY6M2KD` is most likely NWANA's own tag (it is the
only one on the non-RunSignup academy site). Which stream belongs to property
534556675 is verifiable only inside GA4 Admin > Data Streams. No GTM
containers and no legacy UA tags were found anywhere.

The Sites screen and the overview page showed a hardcoded "Analytics: not
connected" state. OPERATING_PLAN.md requires the overview to show verified
channel outcomes as data becomes connected, without inventing totals.

## Decision

New module `src/google-analytics.ts` connects the existing GA4 property as a
read-only traffic source, mirroring the proven `src/google-ads.ts` OAuth
pattern:

- Owner-initiated OAuth2 (`/integrations/google-analytics/connect`), callback
  (`/integrations/google-analytics/callback`), status
  (`/integrations/google-analytics/status`). Scope is
  `https://www.googleapis.com/auth/analytics.readonly`; the module can never
  mutate the GA4 property.
- Refresh token AES-GCM encrypted with `GOOGLE_ANALYTICS_TOKEN_KEY`, stored
  in the existing `integration_credentials` D1 table under provider
  `GOOGLE_ANALYTICS`. No migration, no new table.
- The callback verifies the granted token can actually read property
  534556675 via the Data API metadata endpoint before storing anything.
- `getGa4TrafficOverview()`: exactly one Data API `runReport` per call
  (dimensions: `hostName`; metrics: `sessions`, `totalUsers`; range
  28daysAgo to yesterday; ordered by sessions desc; limit 50). No D1 writes,
  no caching, no background refresh. It never throws: failures return
  `{ ok: false, error }`.
- New owner-key-gated route `GET /api/operating-center/analytics/traffic`.
  The Sites screen renders per-host sessions/users and totals when connected,
  and keeps an honest not-connected note otherwise. The overview
  sites/ads summaries show live session totals once connected.
- `execution_allowed` is false everywhere. No cron, no polling.

## Operating cost

`Operating cost: VERIFIED $0`

- GA4 standard has no traffic-based charge; only Analytics 360 is paid.
- The GA4 Data API is free; it is quota-limited (200,000 core tokens per
  property per day for standard properties; a typical runReport consumes
  fewer than 10 tokens). There is no per-call billing.
- Read path issues one Data API request per owner page open, reuses the
  existing Worker and D1, adds no infrastructure.

Remaining non-cost gate: one-time OAuth consent by admin@nwaofna.org with at
least Viewer access on the property, plus the three new Worker secrets
(`GOOGLE_ANALYTICS_CLIENT_ID`, `GOOGLE_ANALYTICS_CLIENT_SECRET`,
`GOOGLE_ANALYTICS_TOKEN_KEY`). Until then every surface reports
"not connected" honestly.

## Non-goals

No tag installation automation, no Measurement Protocol writes, no event or
conversion management, no Admin API property changes, no BigQuery export,
no new GA4 property, no merging of GA4 data with fundraising/sponsorship
pipelines.

## Owner-confirmed tag facts (2026-09-24)

The owner confirmed the following; the earlier "most likely" wording above is
superseded:

- `G-8RYTY6M2KD` is the primary NWANA GA4 Measurement ID, installed by the
  owner on all NWANA sites. The Machine treats it as the canonical NWANA tag
  unless GA4 Admin > Data Streams shows otherwise.
- `G-QKEVS8BTWC` is a secondary tag of unknown ownership. It is not mixed
  with the primary NWANA tag. Its owner and purpose are investigated
  separately after the read-only connection is live.
- No new property and no new Measurement ID are created.

## Post-connection verification checklist (read-only)

Once OAuth is connected, verify inside property 534556675 without changing
anything:

1. Which Web Data Stream carries Measurement ID `G-8RYTY6M2KD`.
2. Which domains that stream accepts.
3. Whether data from all NWANA sites actually arrives in this property.
4. What `G-QKEVS8BTWC` is (separate stream/property/account?).
5. Whether double tagging causes duplicated `page_view` or other events.

## Tag freeze

No tag is added, removed, or changed until both Measurement IDs' purpose is
established and the double-counting risk is checked. In particular,
`nwana-site.nwana-engine.workers.dev` (future nwaofna.org) currently has no
GA tag; adding the existing `G-8RYTY6M2KD` there is planned before the
domain migration, but only after the verification above.
