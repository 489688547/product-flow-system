import {
  backlogEventRowToEvent,
  backlogRowToItem,
  formatBacklogDisplayId
} from "../../../../../../src/domain/developmentBacklog.js";
import { BacklogHttpError } from "./http.js";

function id(prefix) {
  return globalThis.crypto?.randomUUID?.() || `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function backlogDatabase(env = {}, data = {}) {
  return data.controlDb || env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export function requireBacklogDatabase(env = {}, data = {}) {
  const db = backlogDatabase(env, data);
  if (!db) {
    throw new BacklogHttpError(503, "BACKLOG_STORAGE_UNAVAILABLE", "研发待办数据库暂不可用。", undefined, true);
  }
  return db;
}

function itemInsert(db, sequenceNo, item) {
  return db.prepare(`INSERT INTO development_backlog_items (
    sequence_no, id, display_id, title, background, module_id, priority, status,
    acceptance_criteria_json, scope_paths_json, dependency_ids_json, source_type,
    owner_user_id, owner_name_snapshot, claimed_branch, pull_request_url,
    acceptance_evidence, blocked_reason, resume_condition, version,
    created_by, updated_by, created_at, updated_at, completed_at, cancelled_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    sequenceNo,
    item.id,
    item.displayId,
    item.title,
    item.background,
    item.moduleId,
    item.priority,
    item.status,
    JSON.stringify(item.acceptanceCriteria),
    JSON.stringify(item.scopePaths),
    JSON.stringify(item.dependencyIds),
    item.sourceType,
    item.ownerUserId,
    item.ownerName,
    item.claimedBranch,
    item.pullRequestUrl,
    item.acceptanceEvidence,
    item.blockedReason,
    item.resumeCondition,
    item.version,
    item.createdBy,
    item.updatedBy,
    item.createdAt,
    item.updatedAt,
    item.completedAt,
    item.cancelledAt
  );
}

function eventInsert(db, event, guard) {
  const columns = `(id, item_id, action, from_status, to_status, changed_fields_json,
    actor_user_id, actor_name_snapshot, branch_snapshot, evidence_summary, created_at)`;
  const values = [
    event.id,
    event.itemId,
    event.action,
    event.fromStatus,
    event.toStatus,
    JSON.stringify(event.changedFields),
    event.actorUserId,
    event.actorName,
    event.branch,
    event.evidenceSummary,
    event.createdAt
  ];
  if (!guard) {
    return db.prepare(`INSERT INTO development_backlog_events ${columns}
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values);
  }
  return db.prepare(`INSERT INTO development_backlog_events ${columns}
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (
      SELECT 1 FROM development_backlog_items WHERE id = ? AND version = ?
    )`).bind(...values, guard.itemId, guard.version);
}

function createEvent(item, actor, action, options = {}) {
  return {
    id: id("backlog_event"),
    itemId: item.id,
    action,
    fromStatus: options.fromStatus || null,
    toStatus: options.toStatus || item.status,
    changedFields: options.changedFields || [],
    actorUserId: actor.userId,
    actorName: actor.name,
    branch: item.claimedBranch || null,
    evidenceSummary: options.evidenceSummary || null,
    createdAt: options.now || item.updatedAt
  };
}

export async function createBacklogItem(db, draft, actor, now = new Date().toISOString()) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const sequenceRow = await db.prepare("SELECT COALESCE(MAX(sequence_no), 0) + 1 AS next_sequence FROM development_backlog_items").first();
    const sequenceNo = Number(sequenceRow?.next_sequence || 1);
    const item = {
      ...draft,
      id: id("backlog"),
      displayId: formatBacklogDisplayId(sequenceNo),
      sequenceNo,
      ownerUserId: null,
      ownerName: null,
      claimedBranch: null,
      pullRequestUrl: null,
      acceptanceEvidence: null,
      blockedReason: null,
      resumeCondition: null,
      version: 1,
      createdBy: actor.userId,
      updatedBy: actor.userId,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      cancelledAt: null
    };
    const event = createEvent(item, actor, "create", {
      changedFields: ["title", "background", "moduleId", "priority", "acceptanceCriteria", "scopePaths", "dependencyIds"],
      now
    });
    try {
      await db.batch([itemInsert(db, sequenceNo, item), eventInsert(db, event)]);
      return item;
    } catch (error) {
      const unique = /unique|constraint/i.test(String(error?.message || ""));
      if (!unique || attempt === 1) throw error;
    }
  }
  throw new BacklogHttpError(500, "BACKLOG_WRITE_FAILED", "研发待办编号生成失败。", undefined, true);
}

export async function readBacklogItem(db, itemId) {
  const row = await db.prepare("SELECT * FROM development_backlog_items WHERE id = ?").bind(itemId).first();
  return backlogRowToItem(row);
}

export async function readBacklogEvents(db, itemId) {
  const result = await db.prepare(`SELECT * FROM development_backlog_events
    WHERE item_id = ? ORDER BY created_at DESC, id DESC`).bind(itemId).all();
  return (result?.results || []).map(backlogEventRowToEvent);
}

export async function readAllBacklogItems(db) {
  const result = await db.prepare(`SELECT * FROM development_backlog_items
    ORDER BY updated_at DESC, sequence_no DESC`).all();
  return (result?.results || []).map(backlogRowToItem);
}

export async function listBacklogItems(db, query) {
  const allItems = await readAllBacklogItems(db);
  const summary = {
    clarification: allItems.filter(item => item.status === "clarification").length,
    ready: allItems.filter(item => item.status === "ready").length,
    inProgress: allItems.filter(item => item.status === "in_progress").length,
    review: allItems.filter(item => item.status === "review").length,
    blocked: allItems.filter(item => item.status === "blocked").length
  };
  const term = query.query.toLocaleLowerCase("zh-CN");
  const filtered = allItems.filter(item => {
    if (query.status && item.status !== query.status) return false;
    if (query.priority && item.priority !== query.priority) return false;
    if (query.moduleId && item.moduleId !== query.moduleId) return false;
    if (query.ownerId && item.ownerUserId !== query.ownerId) return false;
    if (!query.includeClosed && ["completed", "cancelled"].includes(item.status)) return false;
    if (term && !`${item.displayId} ${item.title} ${item.ownerName || ""}`.toLocaleLowerCase("zh-CN").includes(term)) return false;
    return true;
  });
  filtered.sort((left, right) => {
    const exception = Number(right.status === "blocked") - Number(left.status === "blocked");
    if (exception) return exception;
    const priority = left.priority.localeCompare(right.priority);
    if (priority) return priority;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
  const offset = (query.page - 1) * query.pageSize;
  return {
    items: filtered.slice(offset, offset + query.pageSize),
    summary,
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total: filtered.length,
      totalPages: Math.max(1, Math.ceil(filtered.length / query.pageSize))
    }
  };
}

function itemUpdate(db, item, expectedVersion) {
  return db.prepare(`UPDATE development_backlog_items SET
    title = ?, background = ?, module_id = ?, priority = ?, status = ?,
    acceptance_criteria_json = ?, scope_paths_json = ?, dependency_ids_json = ?,
    owner_user_id = ?, owner_name_snapshot = ?, claimed_branch = ?, pull_request_url = ?,
    acceptance_evidence = ?, blocked_reason = ?, resume_condition = ?, version = ?,
    updated_by = ?, updated_at = ?, completed_at = ?, cancelled_at = ?
    WHERE id = ? AND version = ?`).bind(
    item.title,
    item.background,
    item.moduleId,
    item.priority,
    item.status,
    JSON.stringify(item.acceptanceCriteria),
    JSON.stringify(item.scopePaths),
    JSON.stringify(item.dependencyIds),
    item.ownerUserId,
    item.ownerName,
    item.claimedBranch,
    item.pullRequestUrl,
    item.acceptanceEvidence,
    item.blockedReason,
    item.resumeCondition,
    item.version,
    item.updatedBy,
    item.updatedAt,
    item.completedAt,
    item.cancelledAt,
    item.id,
    expectedVersion
  );
}

export async function updateBacklogItem(db, current, patch, actor, action, options = {}) {
  const expectedVersion = Number(options.expectedVersion);
  if (current.version !== expectedVersion) {
    throw new BacklogHttpError(409, "BACKLOG_VERSION_CONFLICT", "事项已被其他任务更新，请刷新后重试。", {
      currentVersion: current.version
    });
  }
  const now = options.now || new Date().toISOString();
  const nextStatus = patch.status || current.status;
  const next = {
    ...current,
    ...patch,
    status: nextStatus,
    version: current.version + 1,
    updatedBy: actor.userId,
    updatedAt: now,
    completedAt: nextStatus === "completed" ? now : nextStatus === "ready" ? null : current.completedAt,
    cancelledAt: nextStatus === "cancelled" ? now : nextStatus === "ready" ? null : current.cancelledAt
  };
  const event = createEvent(next, actor, action, {
    fromStatus: current.status,
    toStatus: next.status,
    changedFields: options.changedFields || Object.keys(patch),
    evidenceSummary: options.evidenceSummary,
    now
  });
  const results = await db.batch([
    itemUpdate(db, next, expectedVersion),
    eventInsert(db, event, { itemId: next.id, version: next.version })
  ]);
  const changes = Number(results?.[0]?.meta?.changes ?? results?.[0]?.changes ?? 0);
  if (changes < 1) {
    throw new BacklogHttpError(409, "BACKLOG_VERSION_CONFLICT", "事项已被其他任务更新，请刷新后重试。");
  }
  return next;
}
