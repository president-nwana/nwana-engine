-- ADR-0051: persist the event's result-publication key on the canonical
-- snapshot row. The key is observed from the RunSignup preview drafts at
-- the event's single acquisition moment and stored with the scored rows,
-- so every later processing run builds the publication draft from D1
-- (buildPublicationDraftFromD1) without a live RunSignup preview.
ALTER TABLE race_event_results ADD COLUMN publication_key TEXT;
