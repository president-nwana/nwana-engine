-- Migration 0037: Ahotu lane.
--
-- Verified live 2026-09-27. Ahotu (https://ahotu.com, World's Sports Group)
-- is a global endurance race calendar; "Nordic walking" is an official sport
-- category (https://www.ahotu.com/sport/nordic-walking). No NWANA events are
-- listed; no NWANA organiser account exists. An organiser account is REQUIRED
-- and FREE: https://www.ahotu.com/members/registration/organiser — the owner
-- creates it; the Machine never creates accounts.
--
-- No API, no bulk/CSV import: manual per-event entry only, inside the
-- organiser dashboard. Official flow
-- (https://help.ahotu.com/article/22-how-can-i-add-an-event-to-ahotu):
-- sign in -> "My events" -> "+ Add event" -> event name + contact details ->
-- Save -> add the edition date + more info via the left-hand menu -> Save.
-- REQUIRED: an edition date AND at least one race/distance, otherwise the
-- event is NOT listed. Ahotu deletes duplicates: always check the event is
-- not already listed before adding. Challenges are NOT supported (the format
-- requires an edition date + race/distance). Eligible kinds: race, series,
-- championship.
--
-- What this migration does:
--   1) merges the duplicate outlets 'ahotu' + 'ahotu-2' into canonical
--      'ahotu' (event_calendar / international / opened),
--   2) replaces the wrong 'ahotu-event-listings-pitch' endpoint (bad URL,
--      accepts ["pitch"]) with 'ahotu-add-event', preserving
--      media_distributions references,
--   3) adds the ahotu_queue table: the Machine auto-enqueues every eligible
--      new object (race/series/championship) with a submission package;
--      a person does the dashboard last mile.
--
-- Idempotent: safe to re-run (UPDATEs converge, INSERT OR IGNORE and
-- DELETE-of-missing-row are no-ops, CREATE TABLE/INDEX IF NOT EXISTS).

-- 1) Merge duplicates into canonical 'ahotu'.
UPDATE media_submission_endpoints SET outlet_id = 'ahotu' WHERE outlet_id = 'ahotu-2';
UPDATE media_contacts SET outlet_id = 'ahotu' WHERE outlet_id = 'ahotu-2';

UPDATE media_outlets
SET name = 'AHOTU',
    outlet_type = 'event_calendar',
    scope = 'international',
    categories = '["event", "calendar", "running", "endurance", "outdoor"]',
    website_url = 'https://ahotu.com',
    verification_level = 'opened',
    notes = 'Global endurance race calendar (World''s Sports Group). "Nordic walking" is an official sport category: https://www.ahotu.com/sport/nordic-walking. Free organiser listing; organiser account REQUIRED (owner creates it: https://www.ahotu.com/members/registration/organiser). No NWANA events listed yet, verified live 2026-09-27.'
WHERE outlet_id = 'ahotu';

DELETE FROM media_outlets WHERE outlet_id = 'ahotu-2';

-- 2) Replace the wrong pitch endpoint with the real organiser entry point.
INSERT OR IGNORE INTO media_submission_endpoints
  (endpoint_id, outlet_id, name, url, accepts, path_type, cost_status,
   eligibility, verification_level, manual_last_mile, account_required, notes)
VALUES (
  'ahotu-add-event',
  'ahotu',
  'AHOTU — Add event (organiser dashboard)',
  'https://www.ahotu.com/members/registration/organiser',
  '["event"]',
  'web_form',
  'VERIFIED $0',
  'Eligible: race, series, championship. NOT challenges — Ahotu requires an edition date + at least one race/distance. Check the event is not already listed before adding (Ahotu deletes duplicates).',
  'opened',
  'EXACT MANUAL LAST MILE — AHOTU (verified live 2026-09-27). A person performs every step; the Machine never submits.
1. If the free NWANA organiser account does not exist yet, create it (OWNER action, one-time): https://www.ahotu.com/members/registration/organiser — sign up as an organiser. Listing an event is free.
2. Sign in to the organiser dashboard, open "My events" -> "+ Add event".
3. FIRST check the event is not already listed (Ahotu deletes duplicates): https://www.ahotu.com/sport/nordic-walking
4. Enter the event name + contact details -> Save.
5. Add the edition date AND at least one race/distance via the left-hand menu -> Save. REQUIRED: without a date + distance the event is NOT listed.
6. When the event is live on ahotu.com, record its URL in ahotu_queue (markAhotuListed) and in media_distributions.external_url.
Official instructions: https://help.ahotu.com/article/22-how-can-i-add-an-event-to-ahotu',
  1,
  'No API, no bulk/CSV import — manual per-event entry only. North America has 2 non-NWANA nordic-walking events listed; no duplicates to claim.'
);

-- Preserve any existing distribution attempts that reference the old endpoint.
UPDATE media_distributions SET endpoint_id = 'ahotu-add-event'
WHERE endpoint_id = 'ahotu-event-listings-pitch';

DELETE FROM media_submission_endpoints WHERE endpoint_id = 'ahotu-event-listings-pitch';

-- 3) Ahotu queue: auto-enqueued submission packages for eligible objects.
CREATE TABLE IF NOT EXISTS ahotu_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  object_id TEXT NOT NULL UNIQUE REFERENCES objects(object_id),
  kind TEXT NOT NULL CHECK (kind IN ('race', 'series', 'championship')),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'package_ready', 'submitted', 'listed', 'duplicate_found', 'declined')),
  package_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  submitted_at TEXT,
  ahotu_url TEXT,
  notes TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_ahotu_queue_status ON ahotu_queue(status);
