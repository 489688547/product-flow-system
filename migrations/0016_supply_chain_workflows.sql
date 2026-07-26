CREATE TABLE IF NOT EXISTS supply_chain_workflow_entities (
  resource_type TEXT NOT NULL,
  id TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  owner_department TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  archived_at TEXT,
  created_at TEXT NOT NULL,
  created_by TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  PRIMARY KEY(resource_type, id)
);

CREATE TABLE IF NOT EXISTS supply_chain_workflow_events (
  id TEXT PRIMARY KEY,
  resource_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  expected_version INTEGER NOT NULL,
  result_version INTEGER NOT NULL,
  idempotency_key TEXT NOT NULL UNIQUE,
  reason TEXT,
  fields TEXT NOT NULL DEFAULT '{}',
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  actor_department TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(resource_type, entity_id, result_version),
  FOREIGN KEY(resource_type, entity_id)
    REFERENCES supply_chain_workflow_entities(resource_type, id)
);

CREATE INDEX IF NOT EXISTS idx_supply_chain_workflow_entities_resource_status
  ON supply_chain_workflow_entities(resource_type, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_supply_chain_workflow_events_entity
  ON supply_chain_workflow_events(resource_type, entity_id, result_version DESC);
