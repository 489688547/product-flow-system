CREATE TABLE IF NOT EXISTS production_data_access_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  union_id TEXT NOT NULL,
  name TEXT NOT NULL,
  capabilities TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  revoked_at TEXT,
  last_used_at TEXT
);

CREATE TABLE IF NOT EXISTS production_write_unlocks (
  unlock_hash TEXT PRIMARY KEY,
  access_token_hash TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE IF NOT EXISTS production_data_snapshots (
  id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  state_updated_at TEXT,
  state_updated_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS production_data_snapshot_parts (
  snapshot_id TEXT NOT NULL,
  part_index INTEGER NOT NULL,
  payload TEXT NOT NULL,
  PRIMARY KEY (snapshot_id, part_index)
);

CREATE TABLE IF NOT EXISTS production_data_audit (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  source_environment TEXT NOT NULL,
  user_id TEXT NOT NULL,
  union_id TEXT,
  name TEXT NOT NULL,
  reason TEXT NOT NULL,
  snapshot_id TEXT,
  before_version TEXT,
  before_updated_at TEXT,
  after_version TEXT,
  after_updated_at TEXT,
  status TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);
