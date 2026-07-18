CREATE TABLE IF NOT EXISTS collaboration_items (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  impact_level TEXT NOT NULL,
  requester_user_id TEXT,
  requester_department_id TEXT,
  owner_user_id TEXT,
  owner_department_id TEXT,
  due_at TEXT,
  source_app_id TEXT,
  payload TEXT NOT NULL CHECK(length(payload) <= 32768),
  version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);

CREATE TABLE IF NOT EXISTS collaboration_participants (
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  item_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (subject_type, subject_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_collaboration_participants_scope
  ON collaboration_participants (subject_type, subject_id, item_id);

CREATE INDEX IF NOT EXISTS idx_collaboration_items_order
  ON collaboration_items (updated_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS collaboration_activities (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  idempotency_key TEXT,
  action TEXT NOT NULL,
  payload TEXT NOT NULL CHECK(length(payload) <= 32768),
  created_at TEXT NOT NULL,
  UNIQUE (item_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_collaboration_activities_item
  ON collaboration_activities (item_id, created_at DESC);
