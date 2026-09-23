# ADR-0021: Media plan as a machine object

Date: 2026-09-22. Owner directive: the machine must compose a media plan
(Nordic Walking articles beyond event news), draft the articles, and send
them for publication. RunSignup is NOT involved in this flow at all.

## Decision

1. `media_plans` and `media_articles` are first-class machine objects
   (migration 0027). Plan lifecycle: DRAFT → APPROVED → IN_PROGRESS → DONE.
   Article lifecycle: DRAFT → READY → APPROVED → PUBLISHED.
2. The machine composes the plan from verified sources; it never invents
   editorial targets or cadence. `POST /api/operating-center/media/plans/compose`
   (and the "Compose plan from verified sources" button on the media page)
   builds a DRAFT plan whose article slots are derived from: (a) upcoming
   races in the verified race lifecycle, (b) recent winner announcements in
   `site_news`, (c) board uploads routed as MEDIA_DRAFT, and (d) the verified
   NWANA pillars from MACHINE_PURPOSE.md (performance levels, Academy ladder,
   NW Groups, Instructor Growth Fund, sponsorship assets, Series 2026) as
   explainer structure. Every slot's angle cites its source ("Source: ...").
   There is no seeded plan and no hard-coded article topics beyond the
   pillar explainers, which are standing structure, not invented news.
   (An earlier draft seeded a "Q4 2026" plan with eight invented topics;
   removed per the verified-requirements rule.)
3. The media workspace lives on its own page at `/operating-center/media`
   (English only, owner-key protected like the rest of the operating
   center). The main page shows only a compact summary with a link.
4. Site publication is a separate owner-confirmed action per article:
   publishing writes the article into `site_news` (the site news feed).
5. External press distribution is a separate owner-confirmed action per
   published article (migration 0029, table `media_distributions`). Only
   articles with status PUBLISHED can be distributed. The machine records
   the channel, outlet name, send time, and notes; the actual send happens
   outside the system after human confirmation. There are no automatic
   sends. Distribution is tracked per article and listed via the API and
   on the media page: each PUBLISHED article shows its distribution history
   and a "Record external distribution" form (channel, outlet, notes).
6. Nothing publishes or distributes without owner approval. Drafts are
   prepared by the machine (the assistant as the machine's editorial
   desk); the owner reviews, approves, publishes, and confirms each
   external distribution.

## Consequences

- New API: `/api/operating-center/media/*` (plans CRUD, articles CRUD,
  approve, publish, overview, distribute, distributions list). All
  owner-key protected.
- New page: `/operating-center/media` (public shell, protected APIs).
- The main operating-center page shows a media summary card, not the full
  workspace.
- `site_news` receives owner-approved articles via the publish endpoint.
- `media_distributions` records each confirmed external send; the send
  itself is manual.
