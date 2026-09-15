-- Stage 8A: Rules Engine Core
-- Object -> Rule -> Audience -> Action -> Job

CREATE TABLE IF NOT EXISTS rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,

  match_object_type TEXT,
  match_program_family TEXT,
  match_commercial_role TEXT,
  match_capability_type TEXT,
  match_status TEXT,

  conditions TEXT,
  metadata TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_rules_enabled_priority
ON rules(enabled, priority);

CREATE INDEX IF NOT EXISTS idx_rules_object_type
ON rules(match_object_type);

CREATE INDEX IF NOT EXISTS idx_rules_program_family
ON rules(match_program_family);

CREATE INDEX IF NOT EXISTS idx_rules_commercial_role
ON rules(match_commercial_role);


CREATE TABLE IF NOT EXISTS rule_audiences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  audience_id TEXT NOT NULL UNIQUE,
  rule_id TEXT NOT NULL,
  audience_type TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  metadata TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (rule_id) REFERENCES rules(rule_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_audiences_unique
ON rule_audiences(rule_id, audience_type);

CREATE INDEX IF NOT EXISTS idx_rule_audiences_rule
ON rule_audiences(rule_id);

CREATE INDEX IF NOT EXISTS idx_rule_audiences_type
ON rule_audiences(audience_type);


CREATE TABLE IF NOT EXISTS rule_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action_id TEXT NOT NULL UNIQUE,
  rule_id TEXT NOT NULL,
  audience_id TEXT,

  action_type TEXT NOT NULL,
  channel TEXT NOT NULL,
  destination TEXT,

  execution_mode TEXT NOT NULL DEFAULT 'NOT_CONNECTED',
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER NOT NULL DEFAULT 100,

  metadata TEXT,

  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (rule_id) REFERENCES rules(rule_id),
  FOREIGN KEY (audience_id) REFERENCES rule_audiences(audience_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rule_actions_unique
ON rule_actions(
  rule_id,
  audience_id,
  action_type,
  channel,
  destination
);

CREATE INDEX IF NOT EXISTS idx_rule_actions_rule
ON rule_actions(rule_id);

CREATE INDEX IF NOT EXISTS idx_rule_actions_audience
ON rule_actions(audience_id);

CREATE INDEX IF NOT EXISTS idx_rule_actions_channel
ON rule_actions(channel);

CREATE INDEX IF NOT EXISTS idx_rule_actions_execution_mode
ON rule_actions(execution_mode);
