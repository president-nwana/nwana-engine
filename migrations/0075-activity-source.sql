-- Track input source for My Activities (FIT/GPX/TCX file vs manual entry).
ALTER TABLE challenge_activities ADD COLUMN source TEXT;
