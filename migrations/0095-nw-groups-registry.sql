-- 0095: NW Groups canonical registry (public NW Groups site, 2026-10-16).
-- RunSignup has no group entity under a MemberOrg and no Developing/RECOGNIZED
-- status field: the group registry is Engine/D1-owned by construction.
-- RunSignup stays the source of truth for club identity and license facts
-- (memberorg_memberships). Categories are DATA (spec: not hardcoded UI).
-- instructor_ref = canonical Academy/Moodle user id (academy_instructor_snapshot.user_id);
-- display_name is set only when the name is intended for publication.

CREATE TABLE IF NOT EXISTS nw_group_categories (
  category_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  eligibility TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS nw_groups (
  group_id TEXT PRIMARY KEY,
  runsignup_club_id INTEGER,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  category_key TEXT REFERENCES nw_group_categories(category_key),
  status TEXT NOT NULL DEFAULT 'developing' CHECK (status IN ('developing','recognized')),
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT NOT NULL DEFAULT 'US',
  latitude REAL,
  longitude REAL,
  description TEXT,
  public_url TEXT,
  runsignup_url TEXT,
  donate_url TEXT,
  fundraising_url TEXT,
  leader_name TEXT,
  leader_role TEXT,
  contact_email TEXT,
  activities_json TEXT,
  programs_json TEXT,
  events_json TEXT,
  news_json TEXT,
  challenge_participation TEXT,
  series_participation TEXT,
  payment_account_state TEXT CHECK (payment_account_state IN ('nwana_administered','own_account')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  recognized_date TEXT
);
CREATE INDEX IF NOT EXISTS idx_nw_groups_state ON nw_groups(state);
CREATE INDEX IF NOT EXISTS idx_nw_groups_city ON nw_groups(city);
CREATE INDEX IF NOT EXISTS idx_nw_groups_zip ON nw_groups(zip);
CREATE INDEX IF NOT EXISTS idx_nw_groups_category ON nw_groups(category_key);
CREATE INDEX IF NOT EXISTS idx_nw_groups_status ON nw_groups(status);
CREATE INDEX IF NOT EXISTS idx_nw_groups_active_status ON nw_groups(active, status);

CREATE TABLE IF NOT EXISTS nw_group_instructors (
  group_id TEXT NOT NULL REFERENCES nw_groups(group_id),
  instructor_ref TEXT NOT NULL,
  display_name TEXT,
  role TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (group_id, instructor_ref)
);

CREATE TABLE IF NOT EXISTS nw_group_sponsors (
  sponsor_id INTEGER PRIMARY KEY AUTOINCREMENT,
  group_id TEXT NOT NULL REFERENCES nw_groups(group_id),
  sponsor_name TEXT NOT NULL,
  sponsor_url TEXT,
  logo_url TEXT,
  note TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_nw_group_sponsors_group ON nw_group_sponsors(group_id, active);
