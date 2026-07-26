import {
  assertSupplyChainWorkflowAction,
  normalizeSupplyChainWorkflowFields,
  ownerDepartmentForResource,
  supplyChainWorkflowInitialStatus
} from "../../../../../../src/domain/supplyChainWorkflows.js";
import { requestBusinessDatabase } from "../../../_shared/dataEnvironment.js";
import { workflowError } from "./http.js";

function parseObject(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function entity(row) {
  if (!row) return null;
  return {
    id: row.id,
    resource: row.resource_type,
    status: row.status,
    version: Number(row.version),
    ownerDepartment: row.owner_department,
    fields: parseObject(row.payload),
    archivedAt: row.archived_at || null,
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  };
}

function event(row) {
  if (!row) return null;
  return {
    eventId: row.id,
    action: row.action,
    fromStatus: row.from_status || null,
    toStatus: row.to_status,
    expectedVersion: Number(row.expected_version),
    resultVersion: Number(row.result_version),
    createdAt: row.created_at
  };
}

function eventId() {
  return globalThis.crypto?.randomUUID?.() || `workflow-event-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function supplyWorkflowDatabase(env = {}, data = {}) {
  return requestBusinessDatabase({ env, data });
}

export async function ensureSupplyWorkflowTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS supply_chain_workflow_entities (
    resource_type TEXT NOT NULL, id TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL,
    owner_department TEXT NOT NULL, payload TEXT NOT NULL, archived_at TEXT, created_at TEXT NOT NULL,
    created_by TEXT NOT NULL, updated_at TEXT NOT NULL, updated_by TEXT NOT NULL,
    PRIMARY KEY(resource_type, id))`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS supply_chain_workflow_events (
    id TEXT PRIMARY KEY, resource_type TEXT NOT NULL, entity_id TEXT NOT NULL, action TEXT NOT NULL,
    from_status TEXT, to_status TEXT NOT NULL, expected_version INTEGER NOT NULL,
    result_version INTEGER NOT NULL, idempotency_key TEXT NOT NULL UNIQUE, reason TEXT,
    fields TEXT NOT NULL, actor_id TEXT NOT NULL, actor_name TEXT NOT NULL,
    actor_department TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(resource_type, entity_id, result_version))`).run();
}

async function readEntityRow(db, resource, id) {
  return db.prepare(`SELECT * FROM supply_chain_workflow_entities
    WHERE resource_type = ? AND id = ?`).bind(resource, id).first();
}

async function readReplay(db, key) {
  return db.prepare(`SELECT * FROM supply_chain_workflow_events
    WHERE idempotency_key = ?`).bind(key).first();
}

export async function listSupplyWorkflowEntities(db, resource, { status = "", cursor = 0 } = {}) {
  const result = await db.prepare(`SELECT * FROM supply_chain_workflow_entities
    WHERE resource_type = ?
    ORDER BY updated_at DESC, id`).bind(resource).all();
  const filtered = (result?.results || []).filter(row => !status || row.status === status);
  const pageSize = 500;
  const rows = filtered.slice(cursor, cursor + pageSize);
  return {
    items: rows.map(entity),
    nextCursor: cursor + rows.length < filtered.length ? String(cursor + rows.length) : ""
  };
}

function createEventStatement(db, values) {
  return db.prepare(`INSERT INTO supply_chain_workflow_events
    (id, resource_type, entity_id, action, from_status, to_status, expected_version, result_version,
      idempotency_key, reason, fields, actor_id, actor_name, actor_department, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values);
}

export async function createSupplyWorkflowEntity(db, {
  resource,
  id,
  fields,
  idempotencyKey,
  actor,
  now = new Date().toISOString()
}) {
  const replay = await readReplay(db, idempotencyKey);
  if (replay) {
    if (replay.resource_type !== resource || replay.entity_id !== id || replay.action !== "create") {
      throw workflowError(409, "SUPPLY_WORKFLOW_IDEMPOTENCY_CONFLICT", "幂等键已用于其他工作流操作。");
    }
    return {
      entity: entity(await readEntityRow(db, resource, id)),
      event: event(replay),
      idempotentReplay: true
    };
  }
  if (await readEntityRow(db, resource, id)) {
    throw workflowError(409, "SUPPLY_WORKFLOW_ALREADY_EXISTS", "供应链工作流实体已存在。");
  }
  const safeFields = normalizeSupplyChainWorkflowFields(fields);
  const status = supplyChainWorkflowInitialStatus(resource);
  const ownerDepartment = ownerDepartmentForResource(resource);
  const eventRow = [
    eventId(), resource, id, "create", null, status, 0, 1, idempotencyKey, null,
    JSON.stringify(safeFields), actor.id, actor.name, actor.department, now
  ];
  try {
    await db.batch([
      db.prepare(`INSERT INTO supply_chain_workflow_entities
        (resource_type, id, status, version, owner_department, payload, archived_at,
          created_at, created_by, updated_at, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        resource, id, status, 1, ownerDepartment, JSON.stringify(safeFields), null,
        now, actor.name, now, actor.name
      ),
      createEventStatement(db, eventRow)
    ]);
  } catch (error) {
    throw workflowError(409, "SUPPLY_WORKFLOW_WRITE_CONFLICT", "供应链工作流已被其他操作更新，请刷新后重试。");
  }
  return {
    entity: entity(await readEntityRow(db, resource, id)),
    event: event({
      id: eventRow[0], action: "create", from_status: null, to_status: status,
      expected_version: 0, result_version: 1, created_at: now
    }),
    idempotentReplay: false
  };
}

function externalRecovery(action) {
  if (action === "submit") return { required: true, type: "dingtalk_approval", status: "pending_manual" };
  if (action === "order") return { required: true, type: "erp_purchase_order", status: "pending_manual" };
  return null;
}

export async function applySupplyWorkflowAction(db, {
  resource,
  id,
  action,
  expectedVersion,
  fields,
  reason,
  idempotencyKey,
  actor,
  now = new Date().toISOString()
}) {
  const replay = await readReplay(db, idempotencyKey);
  if (replay) {
    if (replay.resource_type !== resource || replay.entity_id !== id || replay.action !== action) {
      throw workflowError(409, "SUPPLY_WORKFLOW_IDEMPOTENCY_CONFLICT", "幂等键已用于其他工作流操作。");
    }
    return {
      entity: entity(await readEntityRow(db, resource, id)),
      event: event(replay),
      idempotentReplay: true
    };
  }
  const currentRow = await readEntityRow(db, resource, id);
  if (!currentRow) throw workflowError(404, "SUPPLY_WORKFLOW_NOT_FOUND", "供应链工作流实体不存在。");
  if (Number(currentRow.version) !== expectedVersion) {
    throw workflowError(409, "SUPPLY_WORKFLOW_VERSION_CONFLICT", "供应链工作流已更新，请刷新后重试。");
  }
  const transition = assertSupplyChainWorkflowAction({
    resource,
    status: currentRow.status,
    action
  });
  const patch = normalizeSupplyChainWorkflowFields(fields);
  const recovery = externalRecovery(action);
  const nextPayload = {
    ...parseObject(currentRow.payload),
    ...patch,
    ...(recovery ? { externalAction: recovery } : {})
  };
  const nextVersion = expectedVersion + 1;
  const archivedAt = transition.toStatus === "archived" ? now : currentRow.archived_at || null;
  const eventRow = [
    eventId(), resource, id, action, transition.fromStatus, transition.toStatus,
    expectedVersion, nextVersion, idempotencyKey, String(reason || "").slice(0, 500) || null,
    JSON.stringify(patch), actor.id, actor.name, actor.department, now
  ];
  try {
    await db.batch([
      db.prepare(`UPDATE supply_chain_workflow_entities SET
        status = ?, version = ?, payload = ?, archived_at = ?, updated_at = ?, updated_by = ?
        WHERE resource_type = ? AND id = ? AND version = ?`).bind(
        transition.toStatus, nextVersion, JSON.stringify(nextPayload), archivedAt, now, actor.name,
        resource, id, expectedVersion
      ),
      createEventStatement(db, eventRow)
    ]);
  } catch {
    throw workflowError(409, "SUPPLY_WORKFLOW_VERSION_CONFLICT", "供应链工作流已更新，请刷新后重试。");
  }
  return {
    entity: entity(await readEntityRow(db, resource, id)),
    event: event({
      id: eventRow[0], action, from_status: transition.fromStatus, to_status: transition.toStatus,
      expected_version: expectedVersion, result_version: nextVersion, created_at: now
    }),
    idempotentReplay: false
  };
}
