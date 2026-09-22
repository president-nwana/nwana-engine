# ADR-0010: Public Site News as a Machine Distribution Channel

Date: 2026-09-22
Status: Accepted

## Context

The NWANA Machine's purpose is that at the moment an object is created, its
life and distribution start immediately: socials, mailings, press releases,
registration. Result publication is the heart of the competition lifecycle,
but until now its distribution stopped at social/meta drafts and the
operating center. The public website had no news feed the machine could
write to, so winner congratulations and federation updates required manual
site edits.

## Decision

1. Add a `site_news` table to the engine D1 (migration 0022): id, slug
   (unique), title, body_html, published_at, kind
   (`news` | `winner_announcement`), created_by, created_at. Write path is
   the owner-key endpoint only; the public site reads it directly.
2. Add `POST /api/site/news` on the engine worker, protected by the same
   owner-key pattern as the operating center (`Authorization: Bearer <key>`
   or `?key=`, timing-safe compare against `OPERATING_CENTER_KEY`).
   Request body: `{ title, slug?, body_html?, published_at?, kind?,
   created_by? }`. Slug is auto-generated from the title and de-duplicated.
   Returns 201 with `{ ok, id, slug, kind, published_at }`.
3. Build the public site as a separate Worker (`nwana-site`) bound to the
   same D1 in read-only fashion. It renders `/news`, `/news/:slug`, and the
   winners page from `site_news` and the race results tables.
4. Engine-side auto-publish on result publication (calling the endpoint when
   results move to published) is explicitly deferred to a later step.

## Consequences

- The machine gains a real distribution channel for the moment of result
  publication: news and winner announcements can be published by key,
  without human site edits.
- The public site never writes to D1; all writes stay behind the owner key.
- The endpoint is inert until the engine calls it or the owner does; no
  behavior changes for existing flows (tests 62/62 green).

## Endpoint spec

```
POST https://nwana-engine.nwana-engine.workers.dev/api/site/news
Authorization: Bearer <OPERATING_CENTER_KEY>
Content-Type: application/json

{
  "title": "September 6 10K: congratulations to the level winners",
  "slug": "sep-6-10k-winners",          // optional, auto-generated if omitted
  "body_html": "<p>...</p>",           // optional, trusted owner-key caller
  "published_at": "2026-09-06",        // optional, defaults to now (UTC ISO)
  "kind": "winner_announcement",       // "news" (default) | "winner_announcement"
  "created_by": "machine:result-publication"  // optional audit label
}

201: { "ok": true, "id": 3, "slug": "sep-6-10k-winners",
       "kind": "winner_announcement", "published_at": "2026-09-06" }
401: { "ok": false, "error": "Site news publishing requires the owner key" }
400: { "ok": false, "error": "<validation reason>" }
```

Slug rules: lowercased, non-alphanumeric runs become single hyphens,
max 140 chars, suffixed `-2`, `-3`, ... on collision.
`published_at` accepts `YYYY-MM-DD` or a full ISO timestamp.
`body_html` is stored and rendered as-is; the caller is trusted via the
owner key, and the public site escapes everything else.
