-- Stage 8: register the existing 2026 Series result-processing logic.

INSERT INTO processing_profiles (
  profile_id,
  name,
  domain,
  profile_type,
  program_family,
  season,
  status,
  configuration,
  metadata
)
VALUES (
  'PROFILE-SERIES-2026-RESULTS',
  '2026 Open Series Result Processing',
  'COMPETITION',
  'RESULT_PROCESSING',
  'OPEN_SERIES',
  2026,
  'active',
  '{
    "levels":["Elite","High Performance","Performance","Competitive","Open"],
    "comparison":"STRICT_LESS_THAN",
    "time_source_order":["chip_time","clock_time"],
    "grouping":["level","gender"],
    "level_place":{"sort":"time_ascending","assignment":"sequential"},
    "points":{"formula":"1001-position","start":1000,"decrement":1},
    "tie_break":{"implemented":false,"published_label":"best time"},
    "distances":{
      "1K":{"Elite":"00:06:00","HighPerformance":"00:06:30","Performance":"00:07:00","Competitive":"00:07:30"},
      "3K":{"Elite":"00:20:00","HighPerformance":"00:21:00","Performance":"00:22:00","Competitive":"00:23:00"},
      "5K":{"Elite":"00:33:00","HighPerformance":"00:35:00","Performance":"00:37:00","Competitive":"00:40:00"},
      "10K":{"Elite":"01:05:00","HighPerformance":"01:10:00","Performance":"01:15:00","Competitive":"01:20:00"},
      "15K":{"Elite":"01:40:00","HighPerformance":"01:50:00","Performance":"02:00:00","Competitive":"02:10:00"},
      "20K":{"Elite":"02:20:00","HighPerformance":"02:30:00","Performance":"02:40:00","Competitive":"02:50:00"}
    }
  }',
  '{
    "implementation":"NWANA-FINAL.ps1",
    "implementation_version":"2026-09-05-v4",
    "current_runtime":"desktop-powershell",
    "writes_to":"RunSignup",
    "status":"existing-working-implementation"
  }'
)
ON CONFLICT(profile_id) DO UPDATE SET
  name=excluded.name,
  domain=excluded.domain,
  profile_type=excluded.profile_type,
  program_family=excluded.program_family,
  season=excluded.season,
  status=excluded.status,
  configuration=excluded.configuration,
  metadata=excluded.metadata,
  updated_at=CURRENT_TIMESTAMP;

INSERT INTO object_processing_profiles (
  object_id,
  profile_id,
  profile_role,
  priority,
  enabled,
  metadata
)
SELECT
  object_id,
  'PROFILE-SERIES-2026-RESULTS',
  'PRIMARY',
  100,
  1,
  '{"scope":"2026-open-series"}'
FROM objects
WHERE object_type='COMPETITION-SERIES-HUB'
  AND program_family='OPEN_SERIES'
  AND season=2026
ON CONFLICT(object_id, profile_id, profile_role) DO UPDATE SET
  priority=excluded.priority,
  enabled=excluded.enabled,
  metadata=excluded.metadata,
  updated_at=CURRENT_TIMESTAMP;
