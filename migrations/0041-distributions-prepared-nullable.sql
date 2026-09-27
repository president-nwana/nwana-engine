-- Migration 0041: allow honest `prepared` distribution rows.
--
-- media_distributions.sent_at was NOT NULL (migration 0029), which forced a
-- fake send date onto rows whose real status is `prepared` (status column
-- added in 0034). A prepared distribution is not sent yet: nothing has gone
-- out, so there is no send timestamp to record. Making sent_at nullable lets
-- the machine store the true state:
--   prepared  -> sent_at IS NULL (created_at records when it was prepared)
--   sent      -> sent_at = actual send time (set by the owner-confirmed send)
-- No automatic sends anywhere. The machine prepares; a person sends.
--
-- SQLite cannot ALTER COLUMN nullability, so the table is rebuilt
-- (data-preserving), then both indexes are recreated.

CREATE TABLE media_distributions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  distribution_id TEXT NOT NULL UNIQUE,
  article_id TEXT NOT NULL REFERENCES media_articles(article_id),
  channel TEXT NOT NULL,
  outlet_name TEXT,
  sent_at TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status TEXT NOT NULL DEFAULT 'prepared'
    CHECK (status IN ('prepared', 'sent', 'submitted', 'published', 'replied', 'follow_up_done', 'covered', 'declined')),
  external_url TEXT
);

INSERT INTO media_distributions_new
  (id, distribution_id, article_id, channel, outlet_name, sent_at, notes, created_at, status, external_url)
SELECT id, distribution_id, article_id, channel, outlet_name, sent_at, notes, created_at, status, external_url
FROM media_distributions;

DROP TABLE media_distributions;

ALTER TABLE media_distributions_new RENAME TO media_distributions;

CREATE INDEX IF NOT EXISTS idx_media_distributions_article
ON media_distributions(article_id, sent_at);

CREATE INDEX IF NOT EXISTS idx_media_distributions_status
ON media_distributions(status, sent_at);
