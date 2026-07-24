CREATE TABLE IF NOT EXISTS development_backlog_items (
  sequence_no INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  display_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  background TEXT NOT NULL DEFAULT '',
  module_id TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('p0', 'p1', 'p2', 'p3')),
  status TEXT NOT NULL CHECK (status IN ('clarification', 'ready', 'in_progress', 'review', 'completed', 'blocked', 'cancelled')),
  acceptance_criteria_json TEXT NOT NULL DEFAULT '[]',
  scope_paths_json TEXT NOT NULL DEFAULT '[]',
  dependency_ids_json TEXT NOT NULL DEFAULT '[]',
  source_type TEXT NOT NULL CHECK (source_type IN ('ai_assistant', 'codex', 'manual')),
  owner_user_id TEXT,
  owner_name_snapshot TEXT,
  claimed_branch TEXT,
  pull_request_url TEXT,
  acceptance_evidence TEXT,
  blocked_reason TEXT,
  resume_condition TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  cancelled_at TEXT
);

CREATE TABLE IF NOT EXISTS development_backlog_events (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL,
  action TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT,
  changed_fields_json TEXT NOT NULL DEFAULT '[]',
  actor_user_id TEXT NOT NULL,
  actor_name_snapshot TEXT NOT NULL DEFAULT '',
  branch_snapshot TEXT,
  evidence_summary TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(item_id) REFERENCES development_backlog_items(id)
);

CREATE INDEX IF NOT EXISTS idx_development_backlog_items_status_priority
  ON development_backlog_items(status, priority, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_development_backlog_items_module_status
  ON development_backlog_items(module_id, status);

CREATE INDEX IF NOT EXISTS idx_development_backlog_items_owner_status
  ON development_backlog_items(owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_development_backlog_events_item_created
  ON development_backlog_events(item_id, created_at DESC);
