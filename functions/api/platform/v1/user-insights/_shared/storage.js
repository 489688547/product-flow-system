import { UserInsightHttpError } from "./http.js";

const TABLES = {
  categoryMappings: "user_insight_category_mappings",
  rules: "user_insight_rules",
  snapshots: "user_insight_snapshots",
  entities: "user_insight_entities",
  competitors: "user_insight_competitors",
  syncRuns: "user_insight_sync_runs",
  auditLogs: "user_insight_audit_logs"
};
const SENSITIVE_KEY = /(?:password|passwd|cookie|token|secret|authorization|verificationcode|smscode|session|rawhtml|screenshot)/i;

function tableFor(kind) {
  const table = TABLES[kind];
  if (!table) throw new UserInsightHttpError(400, "VALIDATION_COLLECTION_INVALID", "用户洞察集合无效。");
  return table;
}

export function sanitizeInsightRecord(value) {
  if (Array.isArray(value)) return value.map(sanitizeInsightRecord);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !SENSITIVE_KEY.test(key))
    .map(([key, nested]) => [key, sanitizeInsightRecord(nested)]));
}

function parseRow(row) {
  if (!row) return null;
  try {
    return { ...JSON.parse(row.payload), version: Number(row.version || 1), updatedAt: row.updated_at || "", updatedBy: row.updated_by || "" };
  } catch {
    return null;
  }
}

export async function listInsightRecords(db, kind) {
  const table = tableFor(kind);
  const result = await db.prepare(`SELECT id, payload, version, updated_at, updated_by FROM ${table} ORDER BY updated_at DESC`).all();
  return (result.results || []).map(parseRow).filter(Boolean);
}

export async function getInsightRecord(db, kind, id) {
  const table = tableFor(kind);
  return parseRow(await db.prepare(`SELECT id, payload, version, updated_at, updated_by FROM ${table} WHERE id = ?1`).bind(id).first());
}

export async function putInsightRecord(db, kind, record, actor = "系统", options = {}) {
  const table = tableFor(kind);
  const clean = sanitizeInsightRecord(record);
  const id = String(clean.id || "").trim();
  if (!id) throw new UserInsightHttpError(400, "VALIDATION_ID_REQUIRED", "记录 ID 不能为空。");
  const current = await getInsightRecord(db, kind, id);
  if (options.expectedVersion !== undefined && current && Number(options.expectedVersion) !== Number(current.version)) {
    throw new UserInsightHttpError(409, "VERSION_CONFLICT", "记录已被更新，请刷新后重试。", { currentVersion: current.version });
  }
  const version = current ? Number(current.version || 1) + 1 : Math.max(1, Number(clean.version || 1));
  const now = options.now || new Date().toISOString();
  const payload = { ...clean, version, updatedAt: now, updatedBy: actor };
  await db.prepare(`INSERT INTO ${table} (id, payload, version, updated_at, updated_by) VALUES (?1, ?2, ?3, ?4, ?5)
    ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(id, JSON.stringify(payload), version, now, actor).run();
  return payload;
}

export async function appendAudit(db, action, entityType, entityId, actor, details = {}) {
  const now = new Date().toISOString();
  const id = globalThis.crypto?.randomUUID?.() || `audit-${Date.now().toString(36)}`;
  return putInsightRecord(db, "auditLogs", {
    id,
    action,
    entityType,
    entityId,
    actor: actor.name,
    actorUserId: actor.userId,
    actorDepartments: actor.departments,
    details: sanitizeInsightRecord(details),
    createdAt: now
  }, actor.name, { now });
}

export async function sha256(value) {
  const encoded = new TextEncoder().encode(String(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", encoded);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export function createRunnerToken() {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  const value = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `uic_${value}`;
}

export async function registerRunner(db, { name, allowedScope }, actor) {
  const token = createRunnerToken();
  const tokenHash = await sha256(token);
  const id = globalThis.crypto?.randomUUID?.() || `runner-${Date.now().toString(36)}`;
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO user_insight_runner_tokens (id, token_hash, name, allowed_scope, status, created_at, created_by)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(id, tokenHash, String(name || "公司 Mac 采集器"), JSON.stringify(sanitizeInsightRecord(allowedScope || {})), "active", now, actor.name).run();
  await appendAudit(db, "register_runner", "runner", id, actor, { name, allowedScope });
  return { id, token, name: String(name || "公司 Mac 采集器"), allowedScope: sanitizeInsightRecord(allowedScope || {}), createdAt: now };
}

export async function authenticateRunner(db, request) {
  const authorization = String(request.headers.get("authorization") || "");
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) throw new UserInsightHttpError(401, "AUTH_RUNNER_TOKEN_REQUIRED", "采集设备令牌缺失。");
  const tokenHash = await sha256(token);
  const row = await db.prepare(`SELECT id, token_hash, name, allowed_scope, status, created_at, created_by, last_seen_at
    FROM user_insight_runner_tokens WHERE token_hash = ?1 AND status = 'active'`).bind(tokenHash).first();
  if (!row) throw new UserInsightHttpError(401, "AUTH_RUNNER_TOKEN_INVALID", "采集设备令牌无效或已停用。");
  const now = new Date().toISOString();
  await db.prepare("UPDATE user_insight_runner_tokens SET last_seen_at = ?1 WHERE id = ?2").bind(now, row.id).run();
  return {
    id: row.id,
    name: row.name,
    allowedScope: JSON.parse(row.allowed_scope || "{}"),
    lastSeenAt: now
  };
}

export function runnerAllows(runner, scope = {}) {
  const allowed = runner.allowedScope || {};
  const platformAllowed = !Array.isArray(allowed.platforms) || allowed.platforms.length === 0 || allowed.platforms.includes(scope.platform);
  const shopAllowed = !Array.isArray(allowed.shopIds) || allowed.shopIds.length === 0 || allowed.shopIds.includes(scope.shopId);
  return platformAllowed && shopAllowed;
}

export async function readIdempotency(db, key) {
  const row = await db.prepare("SELECT key, value FROM user_insight_meta WHERE key = ?1").bind(`ingest:${key}`).first();
  return row ? row.value : "";
}

export async function writeIdempotency(db, key, value) {
  await db.prepare(`INSERT INTO user_insight_meta (key, value) VALUES (?1, ?2)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`).bind(`ingest:${key}`, value).run();
}
