-- Migration 0029: external media distribution tracking.
--
-- Site publication (site_news via publishArticle) and external press
-- distribution are distinct owner-confirmed actions. An article must be
-- PUBLISHED before it can be distributed externally. Each distribution
-- records where the article was sent (outlet/channel), when, and by
-- whom, so the Board can see the full lifecycle:
--   DRAFT -> READY -> APPROVED -> PUBLISHED -> DISTRIBUTED (one or more)
--
-- The machine prepares the distribution record; the owner confirms the
-- actual send (email, press release wire, etc.) outside the system, then
-- records it here. No automatic sends.

CREATE TABLE IF NOT EXISTS media_distributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distribution_id TEXT NOT NULL UNIQUE,
  article_id TEXT NOT NULL REFERENCES media_articles(article_id),
  channel TEXT NOT NULL,
  outlet_name TEXT,
  sent_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_distributions_article
ON media_distributions(article_id, sent_at);
