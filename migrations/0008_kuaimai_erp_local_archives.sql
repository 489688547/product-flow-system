ALTER TABLE erp_collection_batches ADD COLUMN archive_id TEXT;

CREATE TABLE IF NOT EXISTS erp_file_archives (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  file_name TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  relative_path TEXT NOT NULL,
  storage_type TEXT NOT NULL DEFAULT 'local_desktop',
  runner_id TEXT,
  status TEXT NOT NULL DEFAULT 'archived',
  batch_id TEXT,
  archived_at TEXT NOT NULL,
  processed_at TEXT,
  error_code TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform_id, content_hash),
  FOREIGN KEY(batch_id) REFERENCES erp_collection_batches(id)
);

CREATE TABLE IF NOT EXISTS erp_collector_tokens (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'kuaimai_erp_ingest',
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT,
  revoked_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_erp_file_archives_resource_status
  ON erp_file_archives(resource_type, status, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_erp_collection_batches_archive
  ON erp_collection_batches(archive_id);

CREATE INDEX IF NOT EXISTS idx_erp_collector_tokens_status
  ON erp_collector_tokens(status, scope);
