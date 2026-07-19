CREATE TABLE IF NOT EXISTS hr_employees (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  union_id TEXT,
  name TEXT NOT NULL,
  employment_status TEXT NOT NULL DEFAULT 'draft',
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employees_user_id
  ON hr_employees(user_id) WHERE user_id IS NOT NULL AND user_id <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_employees_union_id
  ON hr_employees(union_id) WHERE union_id IS NOT NULL AND union_id <> '';

CREATE TABLE IF NOT EXISTS hr_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  department_id TEXT,
  department_name TEXT NOT NULL,
  position_name TEXT NOT NULL,
  manager_employee_id TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES hr_employees(id)
);

CREATE INDEX IF NOT EXISTS idx_hr_assignments_employee_effective
  ON hr_assignments(employee_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_hr_assignments_manager_effective
  ON hr_assignments(manager_employee_id, effective_from, effective_to);

CREATE TABLE IF NOT EXISTS hr_role_assignments (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  role TEXT NOT NULL,
  scope_type TEXT NOT NULL DEFAULT 'company',
  scope_id TEXT,
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES hr_employees(id)
);

CREATE INDEX IF NOT EXISTS idx_hr_roles_employee_effective
  ON hr_role_assignments(employee_id, effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_hr_roles_scope
  ON hr_role_assignments(role, scope_type, scope_id);

CREATE TABLE IF NOT EXISTS hr_lifecycle_events (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  effective_date TEXT NOT NULL,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES hr_employees(id)
);

CREATE INDEX IF NOT EXISTS idx_hr_lifecycle_employee_date
  ON hr_lifecycle_events(employee_id, effective_date);
CREATE INDEX IF NOT EXISTS idx_hr_lifecycle_status
  ON hr_lifecycle_events(status, effective_date);

CREATE TABLE IF NOT EXISTS hr_performance_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hr_performance_cycles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_cycles_period_status
  ON hr_performance_cycles(period_start, period_end, status);

CREATE TABLE IF NOT EXISTS hr_performance_items (
  id TEXT PRIMARY KEY,
  cycle_id TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  weight REAL NOT NULL,
  self_score REAL,
  suggested_score REAL,
  manager_score REAL,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (cycle_id) REFERENCES hr_performance_cycles(id),
  FOREIGN KEY (employee_id) REFERENCES hr_employees(id)
);

CREATE INDEX IF NOT EXISTS idx_hr_performance_cycle_employee
  ON hr_performance_items(cycle_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_performance_employee_status
  ON hr_performance_items(employee_id, status);

CREATE TABLE IF NOT EXISTS hr_evidence_snapshots (
  id TEXT PRIMARY KEY,
  performance_item_id TEXT NOT NULL,
  source_app TEXT NOT NULL,
  source_entity_type TEXT NOT NULL,
  source_entity_id TEXT NOT NULL,
  source_version TEXT,
  acquired_at TEXT NOT NULL,
  payload TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  FOREIGN KEY (performance_item_id) REFERENCES hr_performance_items(id)
);

CREATE INDEX IF NOT EXISTS idx_hr_evidence_performance_item
  ON hr_evidence_snapshots(performance_item_id, acquired_at);
CREATE INDEX IF NOT EXISTS idx_hr_evidence_source
  ON hr_evidence_snapshots(source_app, source_entity_type, source_entity_id);

CREATE TABLE IF NOT EXISTS hr_audit_logs (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT,
  actor_name TEXT NOT NULL,
  reason TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hr_audit_entity_created
  ON hr_audit_logs(entity_type, entity_id, created_at);

CREATE TABLE IF NOT EXISTS hr_management_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT NOT NULL
);
