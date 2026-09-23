-- Migration 0027: media plan - the machine's editorial pipeline.
--
-- Albert's directive 2026-09-22: the machine composes a media plan
-- (Nordic Walking articles beyond event news), drafts the articles, and
-- sends them for publication after owner approval. RunSignup is not
-- involved anywhere in this flow. The publication channel is the new
-- site's news feed (site_news).
--
-- Lifecycle:
--   plan:    DRAFT -> APPROVED -> IN_PROGRESS -> DONE
--   article: DRAFT -> READY -> APPROVED -> PUBLISHED
--
-- Nothing reaches site_news without an explicit owner approval of the
-- article. The machine prepares; the owner approves and publishes.

CREATE TABLE IF NOT EXISTS media_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  period TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'DONE')),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  approved_at TEXT
);

CREATE TABLE IF NOT EXISTS media_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id TEXT NOT NULL UNIQUE,
  plan_id TEXT NOT NULL REFERENCES media_plans(plan_id),
  title TEXT NOT NULL,
  angle TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'READY', 'APPROVED', 'PUBLISHED')),
  body_html TEXT NOT NULL DEFAULT '',
  site_news_id INTEGER,
  scheduled_for TEXT,
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_articles_plan
ON media_articles(plan_id, status);
