CREATE TABLE IF NOT EXISTS user_insight_category_mappings (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS user_insight_rules (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS user_insight_snapshots (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS user_insight_entities (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS user_insight_competitors (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS user_insight_sync_runs (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS user_insight_runner_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  allowed_scope TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  last_seen_at TEXT
);

CREATE TABLE IF NOT EXISTS user_insight_audit_logs (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS user_insight_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS user_insight_category_mappings_updated ON user_insight_category_mappings(updated_at);
CREATE INDEX IF NOT EXISTS user_insight_rules_updated ON user_insight_rules(updated_at);
CREATE INDEX IF NOT EXISTS user_insight_snapshots_updated ON user_insight_snapshots(updated_at);
CREATE INDEX IF NOT EXISTS user_insight_entities_updated ON user_insight_entities(updated_at);
CREATE INDEX IF NOT EXISTS user_insight_competitors_updated ON user_insight_competitors(updated_at);
CREATE INDEX IF NOT EXISTS user_insight_sync_runs_updated ON user_insight_sync_runs(updated_at);
CREATE INDEX IF NOT EXISTS user_insight_audit_logs_updated ON user_insight_audit_logs(updated_at);
