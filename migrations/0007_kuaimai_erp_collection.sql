CREATE TABLE IF NOT EXISTS erp_collection_batches (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  source_file_name TEXT NOT NULL DEFAULT '',
  content_hash TEXT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT 'v1',
  range_start TEXT,
  range_end TEXT,
  row_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  collected_at TEXT NOT NULL,
  imported_at TEXT,
  imported_by TEXT,
  summary TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform_id, resource_type, content_hash)
);

CREATE TABLE IF NOT EXISTS erp_source_records (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_batch_id TEXT NOT NULL,
  occurred_at TEXT,
  modified_at TEXT,
  shop_id TEXT,
  warehouse_id TEXT,
  content_hash TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(resource_type, source_key),
  FOREIGN KEY(source_batch_id) REFERENCES erp_collection_batches(id)
);

CREATE TABLE IF NOT EXISTS erp_collection_issues (
  id TEXT PRIMARY KEY,
  source_batch_id TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  source_key TEXT,
  code TEXT NOT NULL,
  severity TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(source_batch_id) REFERENCES erp_collection_batches(id)
);

CREATE INDEX IF NOT EXISTS idx_erp_source_records_resource_occurred
  ON erp_source_records(resource_type, occurred_at);

CREATE INDEX IF NOT EXISTS idx_erp_source_records_batch
  ON erp_source_records(source_batch_id);

CREATE INDEX IF NOT EXISTS idx_erp_collection_issues_batch_status
  ON erp_collection_issues(source_batch_id, status);
