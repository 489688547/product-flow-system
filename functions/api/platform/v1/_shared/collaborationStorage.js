import { CollaborationHttpError } from "./collaborationHttp.js";
import { requestBusinessDatabase } from "../../_shared/dataEnvironment.js";

export function collaborationDatabase(env = {}, data = {}) {
  return requestBusinessDatabase({ env, data });
}

export async function ensureCollaborationTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS collaboration_items (
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
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS collaboration_participants (
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    item_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (subject_type, subject_id, item_id)
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_collaboration_participants_scope ON collaboration_participants (subject_type, subject_id, item_id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_collaboration_items_order ON collaboration_items (updated_at DESC, id DESC)").run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS collaboration_activities (
    id TEXT PRIMARY KEY,
    item_id TEXT NOT NULL,
    idempotency_key TEXT,
    action TEXT NOT NULL,
    payload TEXT NOT NULL CHECK(length(payload) <= 32768),
    created_at TEXT NOT NULL,
    UNIQUE (item_id, idempotency_key)
  )`).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_collaboration_activities_item ON collaboration_activities (item_id, created_at DESC)").run();
}

function parsePayload(row) {
  if (!row?.payload) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

function identityKey(identity) {
  return String(identity?.userId || identity?.unionId || identity?.id || identity?.name || "").trim();
}

function departmentKey(department) {
  return String(department?.id || department?.name || "").trim();
}

function participantEntries(item) {
  const entries = [];
  const add = (type, id) => {
    const value = String(id || "").trim();
    if (value && !entries.some(entry => entry.type === type && entry.id === value)) entries.push({ type, id: value });
  };
  for (const identity of [item.requesterUser, item.ownerUser, item.decisionOwner]) {
    add("user", identity?.userId);
    add("user", identity?.unionId);
  }
  for (const department of [item.requesterDepartment, item.ownerDepartment, ...(item.partnerDepartments || [])]) {
    add("department", department?.id);
    add("department", department?.name);
  }
  return entries;
}

function itemValues(item) {
  return [
    item.kind,
    item.status,
    item.impactLevel,
    identityKey(item.requesterUser),
    departmentKey(item.requesterDepartment),
    identityKey(item.ownerUser),
    departmentKey(item.ownerDepartment),
    item.dueAt || "",
    item.source?.appId || "",
    JSON.stringify(item),
    item.version,
    item.updatedAt,
    item.archivedAt || ""
  ];
}

function participantInsert(db, item, createdAt = item.updatedAt) {
  return participantEntries(item).map(entry => db.prepare(`INSERT INTO collaboration_participants
    (subject_type, subject_id, item_id, created_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(subject_type, subject_id, item_id) DO NOTHING`).bind(entry.type, entry.id, item.id, createdAt));
}

function activityInsert(db, activity) {
  return db.prepare(`INSERT INTO collaboration_activities
    (id, item_id, idempotency_key, action, payload, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(item_id, idempotency_key) DO NOTHING`).bind(
    activity.id,
    activity.itemId,
    activity.idempotencyKey || null,
    activity.action,
    JSON.stringify(activity),
    activity.createdAt
  );
}

export async function findItemById(db, id) {
  const row = await db.prepare("SELECT payload, version, updated_at FROM collaboration_items WHERE id = ?").bind(id).first();
  return parsePayload(row);
}

export async function findItemByIdempotencyKey(db, idempotencyKey) {
  const row = await db.prepare("SELECT payload, version, updated_at FROM collaboration_items WHERE idempotency_key = ?").bind(idempotencyKey).first();
  return parsePayload(row);
}

export async function findActivityByIdempotencyKey(db, itemId, idempotencyKey) {
  const row = await db.prepare("SELECT payload FROM collaboration_activities WHERE item_id = ? AND idempotency_key = ?").bind(itemId, idempotencyKey).first();
  return parsePayload(row);
}

export async function insertItem(db, item, activity) {
  const statements = [
    db.prepare(`INSERT INTO collaboration_items (
      id, idempotency_key, kind, status, impact_level, requester_user_id, requester_department_id,
      owner_user_id, owner_department_id, due_at, source_app_id, payload, version, created_at, updated_at, archived_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      item.id,
      item.idempotencyKey,
      ...itemValues(item).slice(0, 11),
      item.createdAt,
      item.updatedAt,
      item.archivedAt || ""
    ),
    ...participantInsert(db, item, item.createdAt),
    activityInsert(db, activity)
  ];
  await db.batch(statements);
}

export async function updateItem(db, item, expectedVersion, activity) {
  const statements = [
    db.prepare(`UPDATE collaboration_items SET
      kind = ?, status = ?, impact_level = ?, requester_user_id = ?, requester_department_id = ?,
      owner_user_id = ?, owner_department_id = ?, due_at = ?, source_app_id = ?, payload = ?, version = ?,
      updated_at = ?, archived_at = ? WHERE id = ? AND version = ?`).bind(
      ...itemValues(item),
      item.id,
      expectedVersion
    ),
    db.prepare("DELETE FROM collaboration_participants WHERE item_id = ?").bind(item.id),
    ...participantInsert(db, item),
    activityInsert(db, activity)
  ];
  const results = await db.batch(statements);
  const changes = Number(results?.[0]?.meta?.changes ?? results?.[0]?.changes ?? 0);
  return changes > 0;
}

function cursorPayload(value) {
  if (!value) return null;
  try {
    const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(normalized));
  } catch {
    throw new CollaborationHttpError(400, "COLLABORATION_ITEM_INVALID", "分页游标无效，请重新加载。");
  }
}

function encodeCursor(value) {
  return btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fingerprint(query) {
  return JSON.stringify({
    view: query.view || "my_scope",
    status: [...(query.status || [])].sort(),
    appId: query.appId || "",
    kind: query.kind || "",
    impactLevel: query.impactLevel || "",
    departmentId: query.departmentId || "",
    query: query.query || "",
    dueBefore: query.dueBefore || "",
    includeArchived: Boolean(query.includeArchived)
  });
}

export async function listItems(db, actor, query, subjects) {
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 50));
  const cursor = cursorPayload(query.cursor);
  const filterFingerprint = fingerprint(query);
  if (cursor && cursor.fingerprint !== filterFingerprint) {
    throw new CollaborationHttpError(400, "COLLABORATION_ITEM_INVALID", "分页游标与当前筛选条件不匹配。");
  }
  const conditions = [];
  const bindings = [];
  let sql = "SELECT ci.payload, ci.updated_at, ci.id FROM collaboration_items ci";
  if (!actor.executive) {
    const placeholders = subjects.map(() => "?").join(", ") || "''";
    conditions.push(`EXISTS (SELECT 1 FROM collaboration_participants cp WHERE cp.item_id = ci.id AND cp.subject_id IN (${placeholders}))`);
    bindings.push(...subjects);
  }
  if (!query.includeArchived) conditions.push("(ci.archived_at IS NULL OR ci.archived_at = '')");
  if (query.status?.length) {
    conditions.push(`ci.status IN (${query.status.map(() => "?").join(", ")})`);
    bindings.push(...query.status);
  }
  for (const [column, value] of [["source_app_id", query.appId], ["kind", query.kind], ["impact_level", query.impactLevel]]) {
    if (value) {
      conditions.push(`ci.${column} = ?`);
      bindings.push(value);
    }
  }
  if (query.dueBefore) {
    conditions.push("ci.due_at <= ?");
    bindings.push(query.dueBefore);
  }
  if (cursor) {
    conditions.push("(ci.updated_at < ? OR (ci.updated_at = ? AND ci.id < ?))");
    bindings.push(cursor.updatedAt, cursor.updatedAt, cursor.id);
  }
  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY ci.updated_at DESC, ci.id DESC LIMIT ?";
  bindings.push(limit + 1);
  const result = await db.prepare(sql).bind(...bindings).all();
  let rows = result?.results || [];
  const items = rows.map(parsePayload).filter(Boolean);
  const pageItems = items.slice(0, limit);
  const last = rows[Math.min(limit, rows.length) - 1];
  const nextCursor = rows.length > limit && last
    ? encodeCursor({ updatedAt: last.updated_at, id: last.id, fingerprint: filterFingerprint })
    : "";
  return { items: pageItems, nextCursor };
}

export async function listActivities(db, itemId) {
  const result = await db.prepare("SELECT payload FROM collaboration_activities WHERE item_id = ? ORDER BY created_at DESC, id DESC").bind(itemId).all();
  return (result?.results || []).map(parsePayload).filter(Boolean);
}

export function createActivity(item, actor, action = "create", options = {}) {
  const now = options.now instanceof Date ? options.now.toISOString() : String(options.now || item.updatedAt || new Date().toISOString());
  return {
    id: globalThis.crypto?.randomUUID?.() || `activity_${Date.now().toString(36)}`,
    itemId: item.id,
    idempotencyKey: String(options.idempotencyKey || `${action}:${item.id}:${item.version}`).slice(0, 160),
    action,
    fromStatus: options.fromStatus || "",
    toStatus: options.toStatus || item.status,
    actorUser: { userId: actor.userId, unionId: actor.unionId, name: actor.name },
    actorDepartment: { id: actor.departmentIds[0] || actor.departmentNames[0] || "", name: actor.departmentNames[0] || "" },
    reason: String(options.reason || "").slice(0, 1000),
    changedFields: options.changedFields || [],
    createdAt: now
  };
}
