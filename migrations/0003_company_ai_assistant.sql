CREATE TABLE IF NOT EXISTS data_ai_providers (
  entity_type TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (entity_type, id)
);

CREATE TABLE IF NOT EXISTS data_ai_policies (
  entity_type TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (entity_type, id)
);

CREATE TABLE IF NOT EXISTS ai_usage_audit (
  request_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  user_id TEXT NOT NULL,
  department TEXT,
  provider_id TEXT NOT NULL,
  model TEXT NOT NULL,
  allowed_domains TEXT NOT NULL DEFAULT '[]',
  blocked_domains TEXT NOT NULL DEFAULT '[]',
  domain_counts TEXT NOT NULL DEFAULT '{}',
  source_freshness TEXT NOT NULL DEFAULT '{}',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0,
  result_code TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS ai_usage_audit_created_at ON ai_usage_audit(created_at);
CREATE INDEX IF NOT EXISTS ai_usage_audit_user_id ON ai_usage_audit(user_id);

CREATE TABLE IF NOT EXISTS ai_request_leases (
  user_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
