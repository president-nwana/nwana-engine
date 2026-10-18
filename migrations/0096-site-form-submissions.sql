-- 0096: main-site (nwana-site) form submissions.
-- The /forms page on nwaofna.org names nine official forms; this table
-- stores their online submissions (form slug + JSON of submitted fields).
-- Written by the nwana-site worker (binding nwana_site_db, same D1).
CREATE TABLE IF NOT EXISTS site_form_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  form_slug TEXT NOT NULL,
  fields_json TEXT NOT NULL,
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  ip TEXT,
  user_agent TEXT,
  referer TEXT
);
CREATE INDEX IF NOT EXISTS idx_site_form_submissions_slug
  ON site_form_submissions (form_slug, submitted_at);
