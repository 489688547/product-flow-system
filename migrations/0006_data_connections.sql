CREATE TABLE IF NOT EXISTS data_connections (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  account_label TEXT NOT NULL,
  credential_schema_id TEXT NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  key_version INTEGER NOT NULL DEFAULT 1,
  credential_version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'queued',
  version INTEGER NOT NULL DEFAULT 1,
  last_verified_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_connections_platform_status ON data_connections (platform_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS data_connection_shops (
  id TEXT PRIMARY KEY,
  connection_id TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  shop_id TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  shop_avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'connected',
  last_verified_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (platform_id, shop_id),
  FOREIGN KEY (connection_id) REFERENCES data_connections(id)
);

CREATE INDEX IF NOT EXISTS idx_data_connection_shops_connection ON data_connection_shops (connection_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS browser_agent_tasks (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'v1',
  cursor TEXT,
  platform_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  credential_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'queued',
  claimed_by TEXT,
  claim_expires_at TEXT,
  attempt INTEGER NOT NULL DEFAULT 0,
  result_summary TEXT NOT NULL DEFAULT '{}',
  error_code TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (connection_id) REFERENCES data_connections(id)
);

CREATE INDEX IF NOT EXISTS idx_browser_agent_tasks_queue ON browser_agent_tasks (platform_id, status, created_at);

CREATE TABLE IF NOT EXISTS browser_agent_task_grants (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  runner_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  credential_version INTEGER NOT NULL,
  grant_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (task_id) REFERENCES browser_agent_tasks(id),
  FOREIGN KEY (connection_id) REFERENCES data_connections(id)
);

CREATE INDEX IF NOT EXISTS idx_browser_agent_task_grants_task ON browser_agent_task_grants (task_id, runner_id, expires_at);

CREATE TABLE IF NOT EXISTS data_connection_audit (
  id TEXT PRIMARY KEY,
  connection_id TEXT,
  action TEXT NOT NULL,
  result TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_data_connection_audit_connection ON data_connection_audit (connection_id, created_at DESC);
