# ADR-0027: Seven new operating-center screens with downloadable reports

Date: 2026-09-23
Status: Accepted, deployed

## Context

The owner ordered seven more screens: Sites, Social, Google Ads + Analytics,
Sellers, Partners, Fundraising, NW Groups. Sponsorship already has its own
page (ADR-0026) and was explicitly left untouched; refinement comes later.

The second half of the order: every screen gets a "Download report" button
producing an external-ready document. The owner wants to hand these to
outsiders. The concrete trigger: Zubie Five (Adam Zubiate) replied 2026-09-22
asking for group-network size, virtual Series reach and registrations, and
brand relationships before a first call. The sellers report answers those
questions directly, with what the machine can verify.

## Decision

New pages (English only, owner-key auth model unchanged, public GET HTML
shells like every other operating-center page):

| Screen | Path | Data source |
|---|---|---|
| Sites | `/operating-center/sites` | 7 web properties, descriptions as code data |
| Social | `/operating-center/social` | 7 accounts; only verified stats |
| Ads | `/operating-center/ads` | connection states + planned campaign spec |
| Sellers | `/operating-center/sellers` | 10 seller records from the outreach registry + memory |
| Partners | `/operating-center/partners` | 1 partner record from the outreach registry (AARP, draft) |
| Fundraising | `/operating-center/fundraising` | Fund object via `getFundView()` (ADR-0015/0018) |
| Groups | `/operating-center/groups` | license ladder + funnel URLs as code data |

The shared `operatingCenterMenu()` now has 15 buttons, still a wrapping flex
row under the header on every page, current page marked `aria-current="page"`.

New JSON overview APIs: `/api/operating-center/<screen>/overview` (7),
owner-key protected like every other API route.

New report endpoints: `GET /api/operating-center/report/<screen>` (7),
owner-key protected. Each returns a self-contained, print-friendly HTML
document (inline styles, `@media print` CSS) with the screen's CURRENT real
data, the report date, and nothing internal: no owner keys, no internal
notes, no email addresses. Downloaded as `nwana-<screen>-report-YYYY-MM-DD.html`.

The sellers report carries a dedicated section answering what Zubie Five
asked on 2026-09-22:
- group network size: not yet tracked (honest; funnel URL given);
- Series reach/registrations: weekly Series 2026 races described, registration
  counts not tracked by the machine, verified per-event results with five
  performance levels;
- brand relationships: no signed relationships; prize-sponsor outreach listed
  factually (Urban Poling, Komperdell, AllTrails, Ibotta, Krazy Coupon Lady,
  PayPal Honey sent; Skratch form submitted; LMNT declined; Gruppo soft no).

## The no-fabrication rule, enforced

Every number comes from a real source. Where the source is not connected or
has no data, the screen and the report show an honest state:

- Sites: 7 properties listed; traffic statistics "Analytics not connected".
- Social: LinkedIn 8 followers (observed 2026-09-22) is the only
  follower/subscriber number shown. Instagram reel counts are dated
  observations. YouTube and Facebook pages show "not recorded / not
  confirmed" instead of invented stats. No Threads account is claimed.
- Ads: Google Ads "Not connected" (owner login not established; nothing
  created in any account), Google Analytics "Not set up". The two campaigns
  from `buildDesiredState()` are shown labeled "Planned campaigns (machine
  spec, not live)" with "Not created (planned only)" badges.
- Groups: group and member counts "Not yet tracked" (the engine never
  queried the RunSignup MemberOrg endpoint; verified by grep).
- Partners: exactly one record (AARP, draft, no recipient) — the registry's
  only partner-type entry. The page says the pipeline is thin.
- Sellers: 10 records. 7 earlier agencies are "Contacted — no reply" with
  real dates, not dropped.

## Verification

- TypeScript clean.
- Vitest 246/246 (29 new tests in `test/operating-center-screens.spec.ts`):
  15-button menu on every page, `new Function` script-parse regression
  tests for all 7 pages and the main page, summary cards link to new pages,
  overview getters return honest states, reports are dated and external-safe
  (no keys, no `owner_key`, no email-address pattern), sellers report
  answers Zubie Five.
- Live: all 7 new pages 200 with the 15-button menu; main page 200,
  dashboard-only; all 7 overview APIs and all 7 report endpoints 401
  without the owner key; other API 401s unchanged.

## Consequences

- The main page is now a dashboard of 15 summary cards (8 old + 7 new).
- The owner can download a dated, external-safe report from any of the 7
  new screens and hand it to an outsider (e.g. the sellers report to
  Zubie Five).
- When a source connects (Ads account, Analytics property, RunSignup group
  reads), the corresponding "not connected" block is replaced by real data
  in both the screen and the report; the honest-state code paths stay as
  the fallback.
