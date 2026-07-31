CREATE TABLE IF NOT EXISTS collector_templates (
  id TEXT PRIMARY KEY,
  current_version INTEGER NOT NULL,
  mode TEXT NOT NULL,
  provider_id TEXT NOT NULL,
  profile_id TEXT NOT NULL,
  status TEXT NOT NULL,
  create_idempotency_key TEXT NOT NULL UNIQUE,
  last_idempotency_key TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collector_template_versions (
  template_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  status TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  publish_idempotency_key TEXT UNIQUE,
  published_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  PRIMARY KEY(template_id, version),
  FOREIGN KEY(template_id) REFERENCES collector_templates(id)
);

CREATE TABLE IF NOT EXISTS collector_experimental_runs (
  id TEXT PRIMARY KEY,
  template_id TEXT NOT NULL,
  template_version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  runner_id TEXT NOT NULL,
  status TEXT NOT NULL,
  trust_level TEXT NOT NULL,
  quality TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  target_environment TEXT NOT NULL,
  target_environment_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY(template_id, template_version)
    REFERENCES collector_template_versions(template_id, version),
  FOREIGN KEY(runner_id) REFERENCES web_collection_runners(id)
);

CREATE TABLE IF NOT EXISTS collector_experimental_run_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT NOT NULL,
  to_status TEXT NOT NULL,
  expected_version INTEGER NOT NULL,
  result_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  request_hash TEXT NOT NULL,
  error_code TEXT,
  safe_summary TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  FOREIGN KEY(run_id) REFERENCES collector_experimental_runs(id)
);

CREATE INDEX IF NOT EXISTS idx_collector_templates_status
  ON collector_templates(status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_collector_runs_runner_status
  ON collector_experimental_runs(runner_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_collector_run_events_run
  ON collector_experimental_run_events(run_id, result_version);
