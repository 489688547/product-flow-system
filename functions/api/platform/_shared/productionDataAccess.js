import { splitUtf8 } from "../../state.js";

export const PRODUCTION_WRITE_CONFIRMATION = "修改线上真实数据";
export const PRODUCTION_WRITE_TTL_MS = 15 * 60 * 1000;
const SNAPSHOT_LIMIT = 30;

export function productionAccessError(message, status, code, retryable = false) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.retryable = retryable;
  return error;
}

export async function hashSecret(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value || "")));
  return [...new Uint8Array(digest)].map(item => item.toString(16).padStart(2, "0")).join("");
}

function randomSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function requestId() {
  return crypto.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

export async function ensureProductionAccessTables(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS production_data_access_tokens (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, union_id TEXT NOT NULL, name TEXT NOT NULL,
      capabilities TEXT NOT NULL, created_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT, last_used_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS production_write_unlocks (
      unlock_hash TEXT PRIMARY KEY, access_token_hash TEXT NOT NULL, reason TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS production_data_snapshots (
      id TEXT PRIMARY KEY, version TEXT NOT NULL, state_updated_at TEXT, state_updated_by TEXT, created_at TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS production_data_snapshot_parts (
      snapshot_id TEXT NOT NULL, part_index INTEGER NOT NULL, payload TEXT NOT NULL,
      PRIMARY KEY (snapshot_id, part_index)
    )`,
    `CREATE TABLE IF NOT EXISTS production_data_audit (
      id TEXT PRIMARY KEY, action TEXT NOT NULL, source_environment TEXT NOT NULL,
      user_id TEXT NOT NULL, union_id TEXT, name TEXT NOT NULL, reason TEXT NOT NULL,
      snapshot_id TEXT, before_version TEXT, before_updated_at TEXT,
      after_version TEXT, after_updated_at TEXT, status TEXT NOT NULL,
      request_id TEXT NOT NULL, created_at TEXT NOT NULL
    )`
  ];
  for (const sql of statements) await db.prepare(sql).run();
}

function bearerToken(request) {
  const match = String(request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || "";
}

function parseCapabilities(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function authorizeProductionAccess(request, db, { capability = "read", now = new Date() } = {}) {
  await ensureProductionAccessTables(db);
  const rawToken = bearerToken(request);
  if (!rawToken) throw productionAccessError("缺少生产数据个人令牌。", 401, "PRODUCTION_TOKEN_REQUIRED");
  const tokenHash = await hashSecret(rawToken);
  const row = await db.prepare(`SELECT token_hash, user_id, union_id, name, capabilities, expires_at, revoked_at
    FROM production_data_access_tokens WHERE token_hash = ?`).bind(tokenHash).first();
  if (!row || row.revoked_at || (row.expires_at && Date.parse(row.expires_at) <= now.getTime())) {
    throw productionAccessError("生产数据个人令牌无效或已过期。", 401, "PRODUCTION_TOKEN_INVALID");
  }
  const capabilities = parseCapabilities(row.capabilities);
  if (!capabilities.includes(capability)) {
    throw productionAccessError("当前个人令牌没有所需的生产数据能力。", 403, "PRODUCTION_CAPABILITY_REQUIRED");
  }
  const identity = await db.prepare(`SELECT user_id, union_id, name, role, active
    FROM product_flow_org_members WHERE user_id = ?`).bind(row.user_id).first();
  if (!identity || !identity.active || identity.union_id !== row.union_id || identity.role !== "executive") {
    throw productionAccessError("当前钉钉身份不再具备生产数据最高权限。", 403, "PRODUCTION_ROLE_REQUIRED");
  }
  await db.prepare("UPDATE production_data_access_tokens SET last_used_at = ? WHERE token_hash = ?")
    .bind(now.toISOString(), tokenHash)
    .run();
  return {
    tokenHash,
    capabilities,
    userId: row.user_id,
    unionId: row.union_id,
    name: row.name || identity.name || row.user_id
  };
}

export function validateUnlockInput(input = {}) {
  const reason = String(input.reason || "").trim();
  if (input.confirmation !== PRODUCTION_WRITE_CONFIRMATION) {
    throw productionAccessError(`请输入“${PRODUCTION_WRITE_CONFIRMATION}”确认。`, 400, "PRODUCTION_CONFIRMATION_REQUIRED");
  }
  if (reason.length < 4 || reason.length > 200) {
    throw productionAccessError("生产写入原因需要 4 至 200 个字符。", 400, "PRODUCTION_REASON_INVALID");
  }
  return reason;
}

export async function createProductionWriteUnlock(db, access, input, { now = new Date() } = {}) {
  const reason = validateUnlockInput(input);
  const unlockToken = randomSecret();
  const unlockHash = await hashSecret(unlockToken);
  const expiresAt = new Date(now.getTime() + PRODUCTION_WRITE_TTL_MS).toISOString();
  await db.prepare(`INSERT INTO production_write_unlocks
    (unlock_hash, access_token_hash, reason, created_at, expires_at, revoked_at)
    VALUES (?, ?, ?, ?, ?, NULL)`).bind(unlockHash, access.tokenHash, reason, now.toISOString(), expiresAt).run();
  return { unlockToken, expiresAt, reason };
}

export async function requireProductionWriteUnlock(request, db, access, { now = new Date() } = {}) {
  const rawUnlock = String(request.headers.get("x-pfs-production-unlock") || "").trim();
  if (!rawUnlock) throw productionAccessError("生产写入尚未解锁。", 423, "PRODUCTION_WRITE_LOCKED");
  const unlockHash = await hashSecret(rawUnlock);
  const row = await db.prepare(`SELECT unlock_hash, access_token_hash, reason, expires_at, revoked_at
    FROM production_write_unlocks WHERE unlock_hash = ?`).bind(unlockHash).first();
  if (!row || row.access_token_hash !== access.tokenHash || row.revoked_at || Date.parse(row.expires_at) <= now.getTime()) {
    throw productionAccessError("生产写入解锁无效或已过期。", 423, "PRODUCTION_WRITE_LOCKED");
  }
  return { reason: row.reason, expiresAt: row.expires_at, unlockHash };
}

export async function revokeProductionWriteUnlocks(db, access, { now = new Date() } = {}) {
  await db.prepare("UPDATE production_write_unlocks SET revoked_at = ? WHERE access_token_hash = ? AND revoked_at IS NULL")
    .bind(now.toISOString(), access.tokenHash)
    .run();
  return true;
}

export async function saveProductionSnapshot(db, stored, { now = new Date() } = {}) {
  const id = `snapshot_${crypto.randomUUID?.() || Date.now().toString(36)}`;
  const serialized = JSON.stringify(stored?.state || {});
  const parts = splitUtf8(serialized);
  await db.prepare(`INSERT INTO production_data_snapshots
    (id, version, state_updated_at, state_updated_by, created_at) VALUES (?, ?, ?, ?, ?)`)
    .bind(id, String(stored?.version || "unknown"), stored?.updatedAt || "", stored?.updatedBy || "", now.toISOString())
    .run();
  for (const [index, payload] of parts.entries()) {
    await db.prepare(`INSERT INTO production_data_snapshot_parts (snapshot_id, part_index, payload)
      VALUES (?, ?, ?)`).bind(id, index, payload).run();
  }
  await pruneProductionSnapshots(db);
  return id;
}

export async function pruneProductionSnapshots(db, limit = SNAPSHOT_LIMIT) {
  const result = await db.prepare(`SELECT id FROM production_data_snapshots
    ORDER BY created_at DESC LIMIT -1 OFFSET ?`).bind(Math.max(1, limit)).all();
  for (const row of result?.results || []) {
    await db.prepare("DELETE FROM production_data_snapshot_parts WHERE snapshot_id = ?").bind(row.id).run();
    await db.prepare("DELETE FROM production_data_snapshots WHERE id = ?").bind(row.id).run();
  }
}

export async function readProductionSnapshot(db, snapshotId) {
  const meta = await db.prepare(`SELECT id, version, state_updated_at, state_updated_by, created_at
    FROM production_data_snapshots WHERE id = ?`).bind(snapshotId).first();
  if (!meta) throw productionAccessError("找不到可回滚的写前快照。", 404, "PRODUCTION_SNAPSHOT_NOT_FOUND");
  const result = await db.prepare(`SELECT part_index, payload FROM production_data_snapshot_parts
    WHERE snapshot_id = ? ORDER BY part_index`).bind(snapshotId).all();
  const payload = (result?.results || []).map(row => row.payload).join("");
  if (!payload) throw productionAccessError("写前快照内容不完整。", 500, "PRODUCTION_SNAPSHOT_INVALID");
  return {
    state: JSON.parse(payload),
    version: meta.version,
    updatedAt: meta.state_updated_at,
    updatedBy: meta.state_updated_by
  };
}

export async function startProductionAudit({ db, action, access, unlock, snapshotId, before, sourceEnvironment = "development", now = new Date() }) {
  const id = `audit_${crypto.randomUUID?.() || Date.now().toString(36)}`;
  const auditRequestId = requestId();
  await db.prepare(`INSERT INTO production_data_audit
    (id, action, source_environment, user_id, union_id, name, reason, snapshot_id,
      before_version, before_updated_at, status, request_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      id, action, sourceEnvironment, access.userId, access.unionId, access.name, unlock.reason,
      snapshotId, String(before?.version || "unknown"), before?.updatedAt || "", "pending", auditRequestId, now.toISOString()
    ).run();
  return { id, requestId: auditRequestId };
}

export async function finishProductionAudit(db, auditId, after, status = "succeeded") {
  await db.prepare(`UPDATE production_data_audit SET after_version = ?, after_updated_at = ?, status = ? WHERE id = ?`)
    .bind(String(after?.version || "unknown"), after?.updatedAt || "", status, auditId)
    .run();
}

export async function findProductionAudit(db, auditId) {
  return db.prepare(`SELECT id, action, snapshot_id, status, reason, before_version, before_updated_at,
    after_version, after_updated_at, created_at FROM production_data_audit WHERE id = ?`).bind(auditId).first();
}

export async function listProductionAudits(db, limit = SNAPSHOT_LIMIT) {
  const result = await db.prepare(`SELECT id, action, source_environment, name, reason, snapshot_id,
    before_version, before_updated_at, after_version, after_updated_at, status, request_id, created_at
    FROM production_data_audit ORDER BY created_at DESC LIMIT ?`).bind(Math.min(SNAPSHOT_LIMIT, Math.max(1, limit))).all();
  return result?.results || [];
}
