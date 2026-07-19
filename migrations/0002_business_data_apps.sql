CREATE TABLE IF NOT EXISTS data_sources (
  entity_type TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (entity_type, id)
);

CREATE TABLE IF NOT EXISTS data_runners AS SELECT * FROM data_sources WHERE 0;
CREATE TABLE IF NOT EXISTS data_sync_runs AS SELECT * FROM data_sources WHERE 0;
CREATE TABLE IF NOT EXISTS data_source_files AS SELECT * FROM data_sources WHERE 0;
CREATE TABLE IF NOT EXISTS data_dimension_mappings AS SELECT * FROM data_sources WHERE 0;
CREATE TABLE IF NOT EXISTS data_metric_definitions AS SELECT * FROM data_sources WHERE 0;
CREATE TABLE IF NOT EXISTS data_quality_issues AS SELECT * FROM data_sources WHERE 0;
CREATE TABLE IF NOT EXISTS data_app_subscriptions AS SELECT * FROM data_sources WHERE 0;
CREATE TABLE IF NOT EXISTS data_audit_logs AS SELECT * FROM data_sources WHERE 0;

CREATE UNIQUE INDEX IF NOT EXISTS data_runners_entity_id ON data_runners(entity_type, id);
CREATE UNIQUE INDEX IF NOT EXISTS data_sync_runs_entity_id ON data_sync_runs(entity_type, id);
CREATE UNIQUE INDEX IF NOT EXISTS data_source_files_entity_id ON data_source_files(entity_type, id);
CREATE UNIQUE INDEX IF NOT EXISTS data_dimension_mappings_entity_id ON data_dimension_mappings(entity_type, id);
CREATE UNIQUE INDEX IF NOT EXISTS data_metric_definitions_entity_id ON data_metric_definitions(entity_type, id);
CREATE UNIQUE INDEX IF NOT EXISTS data_quality_issues_entity_id ON data_quality_issues(entity_type, id);
CREATE UNIQUE INDEX IF NOT EXISTS data_app_subscriptions_entity_id ON data_app_subscriptions(entity_type, id);
CREATE UNIQUE INDEX IF NOT EXISTS data_audit_logs_entity_id ON data_audit_logs(entity_type, id);

CREATE TABLE IF NOT EXISTS data_center_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ecommerce_operation_records (
  entity_type TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (entity_type, id)
);

CREATE TABLE IF NOT EXISTS ecommerce_operation_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ecommerce_operation_state (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);

CREATE TABLE IF NOT EXISTS performance_management_records (
  entity_type TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (entity_type, id)
);

CREATE TABLE IF NOT EXISTS performance_management_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS performance_management_state (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT
);
