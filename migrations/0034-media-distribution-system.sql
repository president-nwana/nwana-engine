-- Migration 0034: media distribution system data layer.
--
-- The verified media registry. Backs the Media Distribution System
-- (docs/media-distribution-system.md):
--   NWANA object -> relevant outlets -> contacts -> release/pitch/tip
--   -> send/submission path -> status -> reply -> follow-up
--   -> coverage -> publication link -> analytics.
--
-- Tables:
--   media_outlets              - publications, stations, platforms, calendars
--   media_contacts             - journalists/editors/desks; consent_class is the
--                                hard boundary: RESEARCHED_COLD contacts are
--                                individual outreach only, never Email V2 bulk.
--   media_submission_endpoints - where/how to submit: form URL, tip email,
--                                assignment-desk phone; manual_last_mile holds the
--                                exact human steps (no submission API exists on
--                                any free platform - verified 2026-09-27).
--   media_content_variants     - per-article variants: full/short release, pitch,
--                                news tip, event listing, guest pitch, opinion.
--   media_followups            - follow-up schedule per distribution attempt.
--   media_coverage             - earned coverage: publication URL + analytics notes.
--
-- Extends media_distributions (migration 0029) with variant/endpoint/contact
-- references, a lifecycle status, and the external publication URL.
--
-- Rules enforced here:
--   - verification_level: only 'opened' rows are cleared for immediate use;
--     'search_verified'/'third_party' rows require manual browser verification
--     before first use (flagged, not blocked - the owner decides per case).
--   - No automatic sends anywhere. The machine prepares; a person sends.
--
-- Operating cost: $0 (existing D1, no new services).

CREATE TABLE IF NOT EXISTS media_outlets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  outlet_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  outlet_type TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'local',
  geography TEXT NOT NULL DEFAULT '',
  categories TEXT NOT NULL DEFAULT '[]',
  website_url TEXT,
  verification_level TEXT NOT NULL DEFAULT 'third_party'
    CHECK (verification_level IN ('opened', 'search_verified', 'third_party')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contact_id TEXT NOT NULL UNIQUE,
  outlet_id TEXT REFERENCES media_outlets(outlet_id),
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT '',
  email TEXT,
  phone TEXT,
  beat TEXT NOT NULL DEFAULT '',
  consent_class TEXT NOT NULL DEFAULT 'RESEARCHED_COLD'
    CHECK (consent_class IN ('OPTED_IN', 'RELATIONSHIP', 'RESEARCHED_COLD')),
  source TEXT NOT NULL DEFAULT '',
  verification_level TEXT NOT NULL DEFAULT 'third_party'
    CHECK (verification_level IN ('opened', 'search_verified', 'third_party')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_submission_endpoints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint_id TEXT NOT NULL UNIQUE,
  outlet_id TEXT REFERENCES media_outlets(outlet_id),
  name TEXT NOT NULL,
  url TEXT,
  accepts TEXT NOT NULL DEFAULT '[]',
  path_type TEXT NOT NULL DEFAULT 'web_form',
  cost_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  eligibility TEXT NOT NULL DEFAULT '',
  verification_level TEXT NOT NULL DEFAULT 'third_party'
    CHECK (verification_level IN ('opened', 'search_verified', 'third_party')),
  manual_last_mile TEXT NOT NULL DEFAULT '',
  account_required INTEGER NOT NULL DEFAULT 0,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_content_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  variant_id TEXT NOT NULL UNIQUE,
  article_id TEXT NOT NULL REFERENCES media_articles(article_id),
  variant_type TEXT NOT NULL
    CHECK (variant_type IN ('press_release_full', 'press_release_short', 'pitch_email', 'news_tip', 'event_listing', 'guest_pitch', 'opinion')),
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'READY', 'APPROVED')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  followup_id TEXT NOT NULL UNIQUE,
  distribution_id TEXT NOT NULL REFERENCES media_distributions(distribution_id),
  due_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'cancelled')),
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS media_coverage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  coverage_id TEXT NOT NULL UNIQUE,
  distribution_id TEXT NOT NULL REFERENCES media_distributions(distribution_id),
  outlet_id TEXT REFERENCES media_outlets(outlet_id),
  publication_url TEXT NOT NULL,
  published_at TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_media_outlets_type
ON media_outlets(outlet_type, verification_level);

CREATE INDEX IF NOT EXISTS idx_media_contacts_outlet
ON media_contacts(outlet_id, consent_class);

CREATE INDEX IF NOT EXISTS idx_media_endpoints_outlet
ON media_submission_endpoints(outlet_id, verification_level);

CREATE INDEX IF NOT EXISTS idx_media_variants_article
ON media_content_variants(article_id, variant_type);

-- Extend media_distributions (0029). Plain ADD COLUMN: idempotent only on a
-- fresh DB; the migration journal records 0034 as applied, never re-run it.
ALTER TABLE media_distributions ADD COLUMN variant_id TEXT REFERENCES media_content_variants(variant_id);
ALTER TABLE media_distributions ADD COLUMN endpoint_id TEXT REFERENCES media_submission_endpoints(endpoint_id);
ALTER TABLE media_distributions ADD COLUMN contact_id TEXT REFERENCES media_contacts(contact_id);
ALTER TABLE media_distributions ADD COLUMN status TEXT NOT NULL DEFAULT 'prepared'
  CHECK (status IN ('prepared', 'sent', 'submitted', 'published', 'replied', 'follow_up_done', 'covered', 'declined'));
ALTER TABLE media_distributions ADD COLUMN external_url TEXT;

CREATE INDEX IF NOT EXISTS idx_media_distributions_status
ON media_distributions(status, sent_at);
