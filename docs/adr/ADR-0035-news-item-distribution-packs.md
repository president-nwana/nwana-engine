# ADR-0035 — Distribution packs for NWANA news (NEWS_ITEM / ELITE_ATHLETE_JOINED)

Date: 2026-09-27
Status: Implemented on feature branch `feature/news-item-distribution-packs`. NOT merged to main. NOT deployed.

## Context

`src/manual-distribution-packs.ts` covered exactly four object types:
`series_results`, `competition_event`, `championship`, `challenge`
(verified in code; `PACK_OBJECT_TYPES`). Ordinary NWANA news — e.g. the
2026-09-26 site news "Sven Thorslund joins the NWANA Elite Athletes Club"
(https://www.nwaofna.org/news/sven-thorslund-joins-elite-athletes-club) —
had no pack support and no `ELITE_ATHLETE_JOINED`-style event recognition.

## Decision

1. New pack object type `news_item`. A `newsKind` field shapes the frame:
   `elite_athlete_joined` renders the congratulatory frame plus the
   `#EliteAthletes` tag; any other kind uses a generic NWANA news frame.
2. The canonical news URL is the object identity (`packet_id` =
   `news:<canonical_url>`). The machine never recreates the news item and
   the owner re-enters nothing. Missing values become `[NEEDS: …]`
   placeholders — never invented facts.
3. `buildAllPacks` skips the `eventbrite` channel for `news_item`
   (a news item is not an event listing).
4. `GET /api/operating-center/distribution/packs` accepts `type=news_item`
   with the news fields as query params; no creation packet id is required
   for news. Read-only; nothing is published anywhere.
5. Owner UI: the packs panel gains the "NWANA news" type option; for news
   the packet-id field accepts the canonical news URL.

## Consequences

- The first real package (Sven Thorslund news) was generated from verified
  page facts: 4 channel packs (threads, linkedin, youtube, generic), no
  truncation, no missing fields.
- Channel readiness (verified 2026-09-27): Threads @nwana.official connected
  (threads-cli); Meta connected with 4 destinations (FB NWANA, IG
  nwana.official, FB Nordic Walking Sport, IG n_w_sport); YouTube connected
  (@NWANA.Official); LinkedIn Community Management API still "Review in
  progress" → manual posting.
- Nothing was posted or sent; no D1 writes. All sends remain owner-approved
  manual last mile.
- Open follow-ups (not in this branch): a creation-packet kind `news`
  mapped in `PACKET_KIND_TO_PACK_TYPE`; `media_distributions.sent_at NOT
  NULL` (0029) blocks honest `prepared` rows — needs a migration making it
  nullable or a `prepared_at` column.

## Operating cost

VERIFIED $0 — pure functions plus a read-only endpoint; no new services.
