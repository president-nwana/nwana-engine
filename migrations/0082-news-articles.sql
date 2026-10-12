-- 0082: Canonical news store — ONE source for NWANA site + Charity Challenge.
--
-- NEWS POLICY (enforced by CHECK constraints below; human judgment for the rest):
--   PUBLISH (has public value):
--     notable sport results, new participant (only if a real human story),
--     new team, fundraising milestone, new instructor/organization,
--     partnership, competition update, Challenge milestone, recognition.
--   NEVER PUBLISH (internal kitchen, no public value):
--     who sent whom a file, internal research for the team, internal work
--     messages, Engine/RunSignup technical actions.
--   NEVER auto-create a news item per registration. Registrations may be used
--   selectively as social proof; news is for substantive stories.
--
-- VISIBILITY MODEL:
--   audience = 'nwana'   → renders on nwaofna.org /news only
--   audience = 'charity'  → renders on challenges.nwaofna.org /news only
--   audience = 'both'    → renders on both sites from this single row
--   One article, flags decide where it renders. No manual copy-paste between
--   sites. No two copies of one article. No copy loops (NWANA copying
--   Challenge copying NWANA).
--
-- NOTE: legacy pipeline table `site_news` remains as auto-news bookkeeping.
-- Curated news renders from THIS table.

CREATE TABLE IF NOT EXISTS news_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL DEFAULT '',
  body_html TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL CHECK (category IN (
    'Challenge', 'Results', 'Participants', 'Teams',
    'Fundraising', 'NWANA Competition', 'Organizations / Partners'
  )),
  audience TEXT NOT NULL CHECK (audience IN ('nwana', 'charity', 'both')),
  published_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('draft', 'published')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_news_articles_audience_published
  ON news_articles(audience, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_articles_slug
  ON news_articles(slug);
CREATE INDEX IF NOT EXISTS idx_news_articles_status
  ON news_articles(status);
