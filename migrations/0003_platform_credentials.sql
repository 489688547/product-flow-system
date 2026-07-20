CREATE TABLE IF NOT EXISTS platform_credentials (
  platform_id TEXT PRIMARY KEY,
  ciphertext TEXT NOT NULL,
  iv TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  key_version INTEGER NOT NULL,
  configured_fields TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  enabled INTEGER NOT NULL DEFAULT 1,
  verified_at TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_credential_audit (
  id TEXT PRIMARY KEY,
  platform_id TEXT NOT NULL,
  action TEXT NOT NULL,
  changed_fields TEXT NOT NULL,
  result TEXT NOT NULL,
  request_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS platform_credential_audit_platform_time
  ON platform_credential_audit(platform_id, created_at);
