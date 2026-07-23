CREATE TABLE IF NOT EXISTS data_environment_grants (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  environment_id TEXT NOT NULL DEFAULT 'production',
  environment_version INTEGER NOT NULL DEFAULT 1,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (environment_id IN ('production', 'display'))
);

CREATE INDEX IF NOT EXISTS idx_data_environment_grants_actor
  ON data_environment_grants(actor_id, expires_at);

CREATE TABLE IF NOT EXISTS demo_data_environment_state (
  id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'empty',
  version INTEGER NOT NULL DEFAULT 1,
  active_job_id TEXT,
  rule_version TEXT NOT NULL DEFAULT 'sales-2x-v1',
  source_updated_at TEXT,
  coverage_json TEXT NOT NULL DEFAULT '{}',
  validation_json TEXT NOT NULL DEFAULT '{}',
  last_error_code TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  CHECK (id = 'display'),
  CHECK (enabled IN (0, 1)),
  CHECK (status IN ('empty', 'ready', 'refreshing', 'failed'))
);

INSERT OR IGNORE INTO demo_data_environment_state (
  id, enabled, status, version, rule_version, updated_at
) VALUES (
  'display', 1, 'empty', 1, 'sales-2x-v1', '1970-01-01T00:00:00.000Z'
);

CREATE TABLE IF NOT EXISTS demo_data_refresh_jobs (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT NOT NULL DEFAULT 'preflight',
  current_table TEXT,
  cursor_json TEXT NOT NULL DEFAULT '{}',
  source_version TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  counts_json TEXT NOT NULL DEFAULT '{}',
  last_error_code TEXT,
  lease_expires_at TEXT,
  actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  CHECK (stage IN ('preflight', 'clear', 'copy', 'transform', 'recalculate', 'validate', 'activate'))
);

CREATE INDEX IF NOT EXISTS idx_demo_data_refresh_jobs_status
  ON demo_data_refresh_jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS data_environment_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  environment_version INTEGER NOT NULL,
  job_id TEXT,
  result_code TEXT NOT NULL,
  created_at TEXT NOT NULL,
  CHECK (environment_id IN ('production', 'display'))
);

CREATE INDEX IF NOT EXISTS idx_data_environment_audit_created
  ON data_environment_audit(created_at DESC);

ALTER TABLE web_collection_jobs
  ADD COLUMN target_environment TEXT NOT NULL DEFAULT 'production'
  CHECK (target_environment IN ('production', 'display'));

ALTER TABLE web_collection_jobs
  ADD COLUMN target_environment_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE erp_collection_batches
  ADD COLUMN target_environment TEXT NOT NULL DEFAULT 'production'
  CHECK (target_environment IN ('production', 'display'));

ALTER TABLE erp_collection_batches
  ADD COLUMN target_environment_version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE ai_usage_audit
  ADD COLUMN data_environment TEXT NOT NULL DEFAULT 'production'
  CHECK (data_environment IN ('production', 'display'));

ALTER TABLE ai_skill_audit
  ADD COLUMN data_environment TEXT NOT NULL DEFAULT 'production'
  CHECK (data_environment IN ('production', 'display'));
