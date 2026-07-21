CREATE TABLE IF NOT EXISTS data_connector_instances (
  id TEXT PRIMARY KEY,
  connector_id TEXT NOT NULL,
  name TEXT NOT NULL,
  company_subject TEXT,
  account_type TEXT,
  capture_method TEXT NOT NULL,
  console_url TEXT,
  datasets TEXT NOT NULL,
  owner TEXT,
  runner_id TEXT,
  credential_entry_id TEXT,
  schedule TEXT NOT NULL,
  time_basis TEXT NOT NULL,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  version INTEGER NOT NULL DEFAULT 1,
  last_validated_at TEXT,
  last_success_at TEXT,
  last_data_date TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  archived_at TEXT,
  archived_by TEXT
);

CREATE INDEX IF NOT EXISTS data_connector_instances_status
  ON data_connector_instances(connector_id, status, archived_at);

CREATE TABLE IF NOT EXISTS credential_vault_entries (
  id TEXT PRIMARY KEY,
  scope_type TEXT NOT NULL,
  scope_id TEXT NOT NULL,
  category TEXT NOT NULL,
  name TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  archived_at TEXT,
  archived_by TEXT
);

CREATE INDEX IF NOT EXISTS credential_vault_entries_scope
  ON credential_vault_entries(scope_type, scope_id, archived_at);

CREATE TABLE IF NOT EXISTS credential_vault_permissions (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  actions TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS credential_vault_permissions_subject
  ON credential_vault_permissions(subject_type, subject_id, expires_at);

CREATE TABLE IF NOT EXISTS credential_vault_audit (
  id TEXT PRIMARY KEY,
  entry_id TEXT NOT NULL,
  action TEXT NOT NULL,
  field_categories TEXT NOT NULL,
  actor_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  purpose TEXT NOT NULL,
  result TEXT NOT NULL,
  request_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS credential_vault_audit_entry_time
  ON credential_vault_audit(entry_id, created_at);

CREATE TABLE IF NOT EXISTS internal_vault_items (
  id TEXT PRIMARY KEY,
  item_type TEXT NOT NULL,
  name TEXT NOT NULL,
  company_subject TEXT,
  location TEXT,
  address TEXT,
  protocol TEXT,
  resource_path TEXT,
  owner TEXT,
  purpose TEXT,
  review_date TEXT,
  credential_entry_id TEXT,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  archived_at TEXT,
  archived_by TEXT
);

CREATE INDEX IF NOT EXISTS internal_vault_items_type
  ON internal_vault_items(item_type, status, archived_at);
