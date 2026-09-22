# ADR-0013: Next-race promo auto-publish on result publication

Date: 2026-09-22
Status: Accepted

## Context

ADR-0011 made a confirmed result publication auto-create a winner
announcement; ADR-0012 made the lifecycle sync announce each new race event
the moment the engine first sees it. Both distribute the past or the newly
created object. The one remaining gap in the competition lifecycle loop
(series -> registration -> results -> levels -> standings -> publication ->
next event) was publication -> next event: a publication celebrated the past
but did nothing for the future. The reader of a winner announcement had no
path to the next registration.

## Decision

When a result publication is confirmed with an explicit `PUBLISH` in
`publishSeries2026Result`, the engine now also writes one "next race" promo
row into `site_news` (kind `news`, created_by `engine:auto-publish`): the
next not-yet-run event of the same series and distance, by date, with the
race name, date, distance, and the registration link the lifecycle sync
observed from RunSignup. "Not-yet-run" follows the engine's own convention:
event_date strictly after today (today counts as past, like the results
page).

The lookup uses the engine's series/distance grouping (`race_event_results`
is keyed by series, distance, event_id): the published event's own distance
is read from its snapshot row, then the earliest future event of that
series and distance is chosen. Stored dates are normalized in JS (US,
ISO, ISO datetime) the same way the lifecycle state does.

The registration link is factual observed data, not constructed: migration
0024 adds `registration_url` to `race_event_results`, and the lifecycle sync
persists the race-level URL (`race.url`) it already fetched from RunSignup
onto every event snapshot row it writes.

The write is idempotent per publication key: the slug is derived
deterministically from the publication key (`next-race-<key>`), and an
existing row with that slug is never duplicated.

kind is `news` (same choice as ADR-0012): the `site_news` CHECK constraint
only allows `news` and `winner_announcement`, and a promo is not a winner
announcement; a new kind would require a risky D1 table rebuild for no
rendering benefit.

When there is no upcoming event, or no stored snapshot for the published
event, nothing is written and the publish response reports
`next_race_news: { published: false, skipped: <reason> }` instead of failing
the publication.

Content is built by the pure function `buildNextRacePromoNews`. All
user-controlled text is HTML-escaped before it reaches `body_html`; the
title is stored raw because the public site escapes titles at render time
(same contract as `publishSiteNews`).

## Consequences

- Every future confirmed publication automatically promotes the next race
  of that distance on the public site news feed, with no human site edits.
- The publish response now includes a `next_race_news` outcome object next
  to the existing `site_news` outcome, visible in the operating center and
  API logs.
- The next sync after this deploy backfills `registration_url` onto the
  existing snapshot rows; until then a promo for an event whose row has
  never re-synced simply omits the registration line (no link is invented).
- Owner-key `POST /api/site/news` remains for hand-written federation news.
- Verified locally: Vitest suite passes, TypeScript clean. Authenticated
  end-to-end publication still requires the owner key and Meta token, so
  the live auto-publish path is exercised only on the next real
  publication.
