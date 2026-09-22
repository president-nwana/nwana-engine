-- Migration 0022: site_news table - the public site news feed.
-- Written only by the owner-key-protected POST /api/site/news endpoint
-- (the machine's news distribution channel). Read by the public nwana-site
-- Worker. Rows are never updated or deleted except by an owner-key request.

CREATE TABLE IF NOT EXISTS site_news (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  body_html TEXT NOT NULL DEFAULT '',
  published_at TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'news'
    CHECK (kind IN ('news', 'winner_announcement')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_site_news_published
ON site_news(published_at DESC);
