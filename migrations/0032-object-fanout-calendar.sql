-- Object fan-out: one canonical public calendar table inside the shared D1.
--
-- Rule: create an object once in the Machine; it then appears in every
-- internal and public surface where it belongs, with no repeated manual
-- entry. nwana-site reads this table directly (read-only binding, same D1);
-- no data copies on the site.
--
-- `kind` keeps the public separation the owner requires:
-- competition-like objects (series, championship, competition_event/race)
-- get kind='competition'; challenges get kind='challenge'. The two public
-- calendars share this source but never mix in the public views.
--
-- Downstream systems read this table + `objects` + `relationships`:
-- distribution, marketing, social, email, press, Google Ads, analytics,
-- reporting, Board summaries. Distribution itself is not built here.

CREATE TABLE IF NOT EXISTS public_calendar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    object_id TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('competition', 'challenge')),
    title TEXT NOT NULL,
    event_date TEXT,
    url TEXT,
    series_ref TEXT,
    championship_ref TEXT,
    status TEXT NOT NULL DEFAULT 'scheduled',
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    UNIQUE (object_id, kind)
);

CREATE INDEX IF NOT EXISTS idx_public_calendar_kind_date
    ON public_calendar (kind, event_date);
