-- Migration 0036: dedupe media_outlets seeded by 0035.
--
-- The 0035 seed imported the research catalog section-by-section, so 6 outlets
-- that appear in two catalog categories (Florida local media + TV/radio, or
-- national + newspaper/magazine) were seeded as two rows each. This migration
-- merges each pair into the canonical row:
--   1) repoints the 5 contacts that reference dropped outlet_ids,
--   2) unions the categories JSON on the canonical row,
--   3) deletes the 6 duplicate outlet rows.
-- No endpoints reference the dropped rows (verified 2026-09-27).
-- Idempotent: safe to re-run (UPDATEs converge, DELETE of missing rows is a no-op).

-- 1) Repoint contacts from dropped outlets to canonical outlets.
UPDATE media_contacts SET outlet_id = 'wplg-local-10-miami' WHERE outlet_id = 'wplg-local-10';
UPDATE media_contacts SET outlet_id = 'fox-35-orlando-wofl' WHERE outlet_id = 'fox-35-orlando';
UPDATE media_contacts SET outlet_id = 'central-florida-public-media-orlando-npr-member' WHERE outlet_id = 'central-florida-public-media-npr';
UPDATE media_contacts SET outlet_id = 'usa-today-forum-opinion' WHERE outlet_id = 'usa-today-forum';
-- wftv-9-investigates and wfts-tv-tampa-bay-28-2 have no contacts; nothing to repoint.

-- 2) Union categories on the canonical rows.
UPDATE media_outlets SET categories = '["florida", "local", "radio", "tv"]' WHERE outlet_id = 'central-florida-public-media-orlando-npr-member';
UPDATE media_outlets SET categories = '["florida", "local", "radio", "tv"]' WHERE outlet_id = 'wfts-tv-tampa-bay-28';
UPDATE media_outlets SET categories = '["florida", "local", "radio", "tv"]' WHERE outlet_id = 'fox-35-orlando-wofl';
UPDATE media_outlets SET categories = '["magazine", "national", "newspaper"]' WHERE outlet_id = 'usa-today-forum-opinion';
UPDATE media_outlets SET categories = '["florida", "local", "radio", "tv"]' WHERE outlet_id = 'wftv-9-investigates-orlando';
UPDATE media_outlets SET categories = '["florida", "local", "radio", "tv"]' WHERE outlet_id = 'wplg-local-10-miami';

-- 3) Delete the duplicate outlet rows.
DELETE FROM media_outlets WHERE outlet_id IN (
  'central-florida-public-media-npr',
  'wfts-tv-tampa-bay-28-2',
  'fox-35-orlando',
  'usa-today-forum',
  'wftv-9-investigates',
  'wplg-local-10'
);
