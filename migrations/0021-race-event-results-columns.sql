-- Migration 0021: results page columns for publication status and the
-- RunSignup full-results link. Written by lifecycle sync only (read-only
-- from RunSignup); never written by any other path.

ALTER TABLE race_event_results ADD COLUMN results_url TEXT;
ALTER TABLE race_event_results ADD COLUMN publication_status TEXT NOT NULL DEFAULT 'PENDING';
