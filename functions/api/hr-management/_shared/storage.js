import { normalizeHrManagementState } from "../../../../src/domain/hrManagement.js";
import { requestBusinessDatabase } from "../../platform/_shared/dataEnvironment.js";

export const HR_TABLES = {
  employees: "hr_employees",
  assignments: "hr_assignments",
  roleAssignments: "hr_role_assignments",
  lifecycleEvents: "hr_lifecycle_events",
  performanceTemplates: "hr_performance_templates",
  performanceCycles: "hr_performance_cycles",
  performanceItems: "hr_performance_items",
  evidenceSnapshots: "hr_evidence_snapshots",
  auditLogs: "hr_audit_logs"
};

export function hrDatabase(env = {}, data = {}) {
  return requestBusinessDatabase({ env, data });
}

async function readMeta(db, key) {
  return (await db.prepare("SELECT value FROM hr_management_meta WHERE key = ?").bind(key).first())?.value || "";
}

export async function readHrManagementState(db) {
  const raw = {};
  for (const [collection, table] of Object.entries(HR_TABLES)) {
    const result = await db.prepare(`SELECT payload FROM ${table}`).all();
    raw[collection] = (result?.results || []).flatMap(row => {
      try { return [JSON.parse(row.payload)]; } catch { return []; }
    });
  }
  raw.version = Math.max(0, Math.trunc(Number(await readMeta(db, "company_version")) || 0));
  raw.updatedAt = await readMeta(db, "updated_at");
  raw.sourceMode = "shared";
  return normalizeHrManagementState(raw);
}

function base(record, actor, now) {
  return [JSON.stringify(record), Math.max(1, Math.trunc(Number(record.version) || 1)), record.createdAt || now, now, actor];
}

function insertStatement(db, collection, record, actor, now) {
  const table = HR_TABLES[collection];
  if (collection === "employees") return db.prepare(`INSERT INTO ${table} (id, user_id, union_id, name, employment_status, payload, version, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(record.id, record.userId || null, record.unionId || null, record.name, record.employmentStatus, ...base(record, actor, now));
  if (collection === "assignments") return db.prepare(`INSERT INTO ${table} (id, employee_id, department_id, department_name, position_name, manager_employee_id, effective_from, effective_to, status, payload, version, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(record.id, record.employeeId, record.departmentId || null, record.departmentName, record.positionName, record.managerEmployeeId || null, record.effectiveFrom, record.effectiveTo || null, record.status || "active", ...base(record, actor, now));
  if (collection === "roleAssignments") return db.prepare(`INSERT INTO ${table} (id, employee_id, role, scope_type, scope_id, effective_from, effective_to, payload, version, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(record.id, record.employeeId, record.role, record.scopeType || "company", record.scopeId || null, record.effectiveFrom, record.effectiveTo || null, ...base(record, actor, now));
  if (collection === "lifecycleEvents") return db.prepare(`INSERT INTO ${table} (id, employee_id, event_type, status, effective_date, payload, version, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(record.id, record.employeeId, record.eventType, record.status || "draft", record.effectiveDate, ...base(record, actor, now));
  if (collection === "performanceTemplates") return db.prepare(`INSERT INTO ${table} (id, name, status, payload, version, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(record.id, record.name, record.status || "draft", ...base(record, actor, now));
  if (collection === "performanceCycles") return db.prepare(`INSERT INTO ${table} (id, name, period_start, period_end, status, payload, version, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(record.id, record.name, record.periodStart || "", record.periodEnd || "", record.status || "draft", ...base(record, actor, now));
  if (collection === "performanceItems") return db.prepare(`INSERT INTO ${table} (id, cycle_id, employee_id, status, weight, self_score, suggested_score, manager_score, payload, version, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(record.id, record.cycleId, record.employeeId, record.status || "draft", record.weight, record.selfScore, record.suggestedScore, record.managerScore, ...base(record, actor, now));
  if (collection === "evidenceSnapshots") return db.prepare(`INSERT INTO ${table} (id, performance_item_id, source_app, source_entity_type, source_entity_id, source_version, acquired_at, payload, version, created_at, updated_at, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(record.id, record.performanceItemId, record.sourceApp, record.sourceEntityType, record.sourceEntityId, record.sourceVersion || null, record.acquiredAt, ...base(record, actor, now));
  return db.prepare(`INSERT INTO ${table} (id, entity_type, entity_id, action, actor_id, actor_name, reason, payload, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(record.id, record.entityType, record.entityId, record.action, record.actorId || null, record.actor || actor, record.reason || null, JSON.stringify(record), record.createdAt || now);
}

export async function writeHrManagementState(db, state, actor) {
  const now = new Date().toISOString();
  const normalized = normalizeHrManagementState(state);
  const statements = [];
  const entries = Object.entries(HR_TABLES);
  for (const [, table] of [...entries].reverse()) statements.push(db.prepare(`DELETE FROM ${table}`));
  for (const [collection] of entries) {
    for (const record of normalized[collection]) statements.push(insertStatement(db, collection, record, actor, now));
  }
  statements.push(db.prepare("INSERT INTO hr_management_meta (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by").bind("company_version", String(normalized.version), now, actor));
  statements.push(db.prepare("INSERT INTO hr_management_meta (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by").bind("updated_at", now, now, actor));
  await db.batch(statements);
  return { state: normalized, version: normalized.version, updatedAt: now };
}
