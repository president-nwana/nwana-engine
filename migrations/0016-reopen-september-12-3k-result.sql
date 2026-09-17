-- Reopen the verified September 12, 2026 3K result for the first
-- controlled NWANA Engine publication.
--
-- The owner confirmed that this result was not published by the legacy
-- publisher. Only this exact publication key is removed from the historical
-- baseline. No Meta request is made by this migration.

DELETE FROM result_publication_history
WHERE publication_key = 'runsignup:series-2026:210000:1178567:666098'
  AND series = 'SERIES_2026'
  AND status = 'LEGACY_BASELINE';
