# ADR-0012: Engine-side news auto-publish on first sight of a race event

Date: 2026-09-22
Status: Accepted

## Context

ADR-0011 closed the END of the competition lifecycle: publishing verified
results now automatically creates a winner-announcement entry in `site_news`.
The START of the lifecycle had no equivalent: when a new race event appeared
in RunSignup, nothing on the federation's public surfaces acknowledged it.
Registration could be open for days while the site stayed silent.

The machine's purpose is that creating an object immediately starts its life
and distribution. A race event is such an object. Its announcement should not
wait for a human site edit.

## Decision

When the lifecycle sync (`syncRaceLifecycleDistance`) first observes a race
event, the engine now also writes one "new race announced" row into
`site_news` (kind `news`, created_by `engine:auto-publish`). The write is
internal to the engine's own D1 database, next to the per-event snapshot rows
the same sync already writes. No owner key is needed at this point: the
owner's explicit sync trigger is the authorization. Nothing is sent
externally and nothing is written back to RunSignup.

Content is built by the pure function `buildRaceAnnouncementNews` from what
the sync actually observed: race name, date, distance, and the registration
link. Factual only; missing fields get neutral fallbacks (the event name
falls back to `NWANA <distance>`, the registration paragraph is omitted when
no link was observed). All user-controlled text is HTML-escaped before it
reaches `body_html`; the title is stored raw because the public site escapes
titles at render time (same contract as `publishSiteNews`).

New events only. `race_event_first_seen` (migration 0023) records every
(series, distance, event_id) the engine has observed. The deploy backfilled
all events already stored in `race_event_results`, so the first sync after
deploy announces nothing retroactively. Idempotency is per
(series, distance, event_id) via that marker plus the deterministic slug
`race-announced-<series>-<distance>-<eventId>`; an already-seen event is
never announced twice.

kind stays `news` deliberately: the `site_news` CHECK constraint allows only
`news` and `winner_announcement`, and the public site renders every kind in
the feed without filtering, so a new kind value would require a risky D1
table rebuild for no rendering benefit. The slug prefix `race-announced-`
and `created_by = 'engine:auto-publish'` identify these rows.

This is generic engine machinery, independent of any specific series: the
announcement fires for whatever series the lifecycle sync covers.

## Consequences

- Every future new race event automatically appears on the public site news
  feed at the moment the engine first sees it, with its registration link,
  no human site edits.
- The sync response now includes an `announcements` outcome array
  (`{ event_id, published, slug }` or `{ published: false, skipped }`),
  visible in the operating center and API logs.
- Owner-key `POST /api/site/news` remains for hand-written federation news.
- Verified locally: Vitest suite passes, TypeScript clean. The live path
  runs on the next sync that observes a genuinely new event; backfill
  guarantees the existing events stay silent.
