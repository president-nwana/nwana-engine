# nwana-site

The public NWANA federation website. A Cloudflare Worker that server-renders
HTML pages from the engine D1 database (`nwana-engine-db`) in read-only
fashion. Staging: https://nwana-site.nwana-engine.workers.dev

This is Phase 1 of the nwaofna.org migration: the site is built and reviewed
on the staging address first; DNS for nwaofna.org is switched only after
owner approval. Strategy: `~/workspace/your_files/nwaofna-dns-migration-strategy.md`.

## Pages

- `/` Home: hero, season stats from D1, next races, latest winners, news teaser
- `/results` Results and standings, per distance (`?distance=10K`), newest
  first, all five performance levels shown per event (federation-complete)
- `/calendar` Upcoming competitions grouped by month, RunSignup register links
- `/winners` Congratulations to recent level winners
- `/news` News feed from the `site_news` table
- `/about` About: federation story, founder and president (button to
  albertfatikhov.nwaofna.org), elite athletes, board of directors
- `/results?view=standings&distance=10K` Season standings: points per race
  (1000/999/998 inside level and division) accumulated across the season,
  all five levels shown, ties broken by faster approved result

## Assets

- `public/logo.jpg`: the NWANA seal, downscaled to 512px from the master file
  Albert provided (`workspace/user/media_library/image/fd/fdad1be6b6f63ee4c20069b3b7cd01c8b08a140f0e6e2573171c9b09027f0347.jpg`).
  Served by the worker at `/logo.jpg` via Workers Static Assets; used in the
  site header and footer. Do not hotlink the media-library path.

The Network menu links every NWANA property: series.nwaofna.org,
sport.nwaofna.org, ticketsignup.io/w/nwaofna, academy.nwaofna.org,
albertfatikhov.nwaofna.org, nwaofna.com, federation.nwaofna.org.

## News distribution

News rows are written only by the engine's owner-key-protected
`POST /api/site/news` endpoint (see engine ADR-0010). This worker never
writes to D1. Engine-side auto-publish on result publication is a later step.

## Develop

```bash
npx wrangler dev        # local dev (needs D1 remote or local)
npx tsc --noEmit        # typecheck
```

Deploy via the Cloudflare skill wrapper (attaches the credential):

```bash
NWANA_ENGINE_DIR=~/workspace/nwana-site python3 ~/workspace/skills/cloudflare/bin/cf-wrangler.py deploy
```

## Rules

- All copy is English. No em-dashes anywhere in user-facing strings.
- Read-only D1 usage. No writes from this worker.
- Design for the federation it will be: complete structures, honest empty
  states, never scaled down to current participation.
