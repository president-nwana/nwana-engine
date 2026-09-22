# ADR-0011: Engine-side news auto-publish on result publication

Date: 2026-09-22
Status: Accepted

## Context

ADR-0010 created the public site news channel: the `site_news` table and an
owner-key-protected `POST /api/site/news` endpoint on the engine worker. The
endpoint, schema, and docs went live, but the engine itself did not publish
anything: winner congratulations still required a human to call the endpoint
with the owner key after every publication.

Result publication is the heart of the competition lifecycle. Per the machine
purpose, distribution starts at the moment of publication, not in a later
manual step.

## Decision

When a result publication is confirmed with an explicit `PUBLISH` in
`publishSeries2026Result`, the engine now also writes one winner-announcement
row into `site_news` (kind `winner_announcement`, created_by
`engine:auto-publish`). The write is internal to the engine's own D1
database, next to the publication history rows the same function already
writes. No owner key is needed at this point: the owner's explicit `PUBLISH`
confirmation is the authorization. Nothing is sent externally and nothing is
written back to RunSignup.

Content is built by the pure function `buildWinnerAnnouncementNews` from the
stored per-event results snapshot (`race_event_results`): level-place-1
finishers grouped by performance level in level order, with the athlete name,
gender, and time. All user-controlled text is HTML-escaped before it reaches
`body_html`; the title is stored raw because the public site escapes titles
at render time (same contract as `publishSiteNews`).

The write is idempotent per publication key: the slug is derived
deterministically from the publication key (`winner-announcement-<key>`),
and an existing row with that slug is never duplicated.

When there is no stored results snapshot, or no level winner, nothing is
written and the publish response reports `site_news: { published: false,
skipped: <reason> }` instead of failing the publication.

## Consequences

- Every future confirmed publication automatically produces a winner
  announcement on the public site news feed, with no human site edits.
- The publish response now includes a `site_news` outcome object, visible in
  the operating center and API logs.
- Owner-key `POST /api/site/news` remains for hand-written federation news.
- Verified locally: Vitest suite passes, TypeScript clean. Authenticated
  end-to-end publication still requires the owner key and Meta token, so the
  live auto-publish path is exercised only on the next real publication.
