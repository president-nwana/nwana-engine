-- Migration 0047: canonical athlete profiles (static verified credentials + materialized dynamic stats).
--
-- One canonical athlete data model used by:
--   - personal athlete pages
--   - Elite Athletes page (site Worker reads the same D1)
--   - sponsor-safe exports (/api/operating-center/export/audience)
--   - Operating Center
--   - news/athlete cards and future results/registry interfaces
--
-- Static credentials (World Championships, national championships, competition
-- bests, club membership) are persistent verified records: each carries its
-- source. They are written only from NWANA-owned canonical/public sources and
-- never invented.
--
-- Dynamic stats (starts, finishes, wins, podiums, by distance, season wins,
-- lifetime wins, best times) are DERIVED from official finalized competition
-- results in race_event_results and materialized into computed_stats_json.
-- Victory rule (documented, single definition everywhere):
--   win = level_place exactly "1" in a finalized official result record,
--   excluding DSQ/DNS/DNF/blank times and any non-finalized record.
--   Source of truth = official finalized competition results.
--
-- The Engine is the single writer of computed_stats_json: it is refreshed
-- automatically after every result apply and by the daily cron. Readers never
-- compute their own copies, so no page can drift from the canonical numbers.

CREATE TABLE IF NOT EXISTS athlete_profiles (
  slug TEXT PRIMARY KEY,                 -- 'albert-fatikhov'
  full_name TEXT NOT NULL,               -- 'Albert Fatikhov'
  results_name TEXT NOT NULL,            -- exact name as stored in results_json
  org_role TEXT,                         -- 'President of NWANA'
  athlete_role TEXT,                     -- 'Competitive Nordic Walking athlete'
  country_code TEXT,                     -- 'US'
  public_property_url TEXT,              -- personal athlete property
  photo_url TEXT,
  credentials_json TEXT NOT NULL DEFAULT '[]',
  computed_stats_json TEXT,              -- materialized derived stats (Engine writes)
  stats_computed_at TEXT,
  updated_at TEXT NOT NULL
);

-- Seed: Albert Fatikhov verified static credentials.
-- Sources (all NWANA-owned, verified 2026-09-28):
--   https://www.nwaofna.org/elite
--   https://albertfatikhov.nwaofna.org/
-- No discrepancies found between the two sources on 2026-09-28.
INSERT OR IGNORE INTO athlete_profiles
  (slug, full_name, results_name, org_role, athlete_role, country_code,
   public_property_url, photo_url, credentials_json, updated_at)
VALUES (
  'albert-fatikhov',
  'Albert Fatikhov',
  'Albert Fatikhov',
  'President of the Nordic Walking Association of North America',
  'Competitive Nordic Walking athlete; NWANA Elite Athletes Club member',
  'US',
  'https://albertfatikhov.nwaofna.org/',
  'https://d2mkojm4rk40ta.cloudfront.net/us-east-1-src/prod/clientUploads/2026-06/21/13/824/efade10b-4183-42c3-8549-bdcfaed4b27c-bQoiOp.png',
  '[
    {"type":"world_championship","title":"Silver Medal, 4 x 5K Men''s Relay","detail":"World Championship, Lahti, Finland (2024)","source":"nwaofna.org/elite","source_url":"https://www.nwaofna.org/elite","verified_at":"2026-09-28"},
    {"type":"world_championship","title":"Bronze Medal, 5K","detail":"World Championship, Lahti, Finland (2024)","source":"nwaofna.org/elite","source_url":"https://www.nwaofna.org/elite","verified_at":"2026-09-28"},
    {"type":"national_championship","title":"6 Latvian Championship Medals","detail":"1 Bronze in 2023 and 5 medals in 2024","source":"nwaofna.org/elite","source_url":"https://www.nwaofna.org/elite","verified_at":"2026-09-28"},
    {"type":"competition_best","title":"30:58 Official 5K Competition Best","detail":"Latvian Championship, Vakarbulli (2024)","source":"nwaofna.org/elite","source_url":"https://www.nwaofna.org/elite","verified_at":"2026-09-28"},
    {"type":"club","title":"NWANA Elite Athletes Club member","detail":"Verified international-level athlete","source":"nwaofna.org/elite","source_url":"https://www.nwaofna.org/elite","verified_at":"2026-09-28"},
    {"type":"focus","title":"Current Competitive Focus: 1K, 3K and 5K","detail":"Active competition across the shorter Nordic Walking distances","source":"nwaofna.org/elite","source_url":"https://www.nwaofna.org/elite","verified_at":"2026-09-28"}
  ]',
  '2026-09-28T23:59:00Z'
);
