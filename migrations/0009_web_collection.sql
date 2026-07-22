CREATE TABLE IF NOT EXISTS web_collection_runners (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scope TEXT NOT NULL DEFAULT 'company_web_collection',
  status TEXT NOT NULL DEFAULT 'active',
  version TEXT,
  chrome_status TEXT,
  current_job_id TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  revoked_at TEXT,
  revoked_by TEXT
);

CREATE TABLE IF NOT EXISTS web_collection_jobs (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  business_date TEXT NOT NULL,
  range_kind TEXT NOT NULL,
  range_start TEXT,
  range_end TEXT,
  time_zone TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  schedule_version TEXT NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued',
  stage TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  runner_id TEXT,
  lease_expires_at TEXT,
  selector_version TEXT,
  error_code TEXT,
  error_summary TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  FOREIGN KEY(runner_id) REFERENCES web_collection_runners(id)
);

CREATE TABLE IF NOT EXISTS web_collection_runs (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  runner_id TEXT NOT NULL,
  attempt INTEGER NOT NULL,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  batch_id TEXT,
  archive_id TEXT,
  file_hash TEXT,
  row_count INTEGER,
  error_code TEXT,
  error_summary TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES web_collection_jobs(id),
  FOREIGN KEY(runner_id) REFERENCES web_collection_runners(id)
);

CREATE TABLE IF NOT EXISTS web_collection_cursors (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  business_date TEXT NOT NULL,
  job_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  batch_id TEXT,
  completed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(provider_id, resource_type),
  FOREIGN KEY(job_id) REFERENCES web_collection_jobs(id),
  FOREIGN KEY(run_id) REFERENCES web_collection_runs(id)
);

CREATE TABLE IF NOT EXISTS web_collection_notifications (
  id TEXT PRIMARY KEY,
  job_id TEXT,
  runner_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  dedupe_key TEXT NOT NULL UNIQUE,
  result TEXT NOT NULL,
  sent_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY(job_id) REFERENCES web_collection_jobs(id),
  FOREIGN KEY(runner_id) REFERENCES web_collection_runners(id)
);

CREATE INDEX IF NOT EXISTS idx_web_collection_jobs_claim
  ON web_collection_jobs(status, lease_expires_at, created_at);

CREATE INDEX IF NOT EXISTS idx_web_collection_jobs_provider_date
  ON web_collection_jobs(provider_id, business_date, status);

CREATE INDEX IF NOT EXISTS idx_web_collection_runs_job
  ON web_collection_runs(job_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_web_collection_runners_seen
  ON web_collection_runners(status, last_seen_at DESC);

