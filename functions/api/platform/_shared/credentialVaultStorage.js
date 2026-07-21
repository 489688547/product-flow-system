import { decryptCredential, encryptCredential } from "./credentialCrypto.js";

const SCOPE_TYPES = new Set(["connector", "internal"]);
const MAX_SECRET_FIELDS = 40;

function storageError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function cleanString(value, label, maxLength = 200) {
  if (value == null) return "";
  if (typeof value !== "string") throw storageError(`${label} 必须是字符串。`, "CREDENTIAL_ENTRY_INVALID", 400);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw storageError(`${label} 不能超过 ${maxLength} 个字符。`, "CREDENTIAL_ENTRY_INVALID", 400);
  return cleaned;
}

function normalizeSecretPayload(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw storageError("凭证内容必须是对象。", "CREDENTIAL_ENTRY_INVALID", 400);
  }
  const entries = Object.entries(value);
  if (!entries.length || entries.length > MAX_SECRET_FIELDS) {
    throw storageError("凭证内容字段数量不合法。", "CREDENTIAL_ENTRY_INVALID", 400);
  }
  return Object.fromEntries(entries.map(([key, item]) => {
    const field = cleanString(key, "凭证字段名", 80);
    if (!field || /(?:otp|smscode|verificationcode|captcha|qrcode|slider)/i.test(field)) {
      throw storageError("验证码、扫码或当次人工验证信息不能保存。", "CREDENTIAL_ENTRY_INVALID", 400);
    }
    return [field, cleanString(item, field, 4096)];
  }));
}

export function credentialDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensureCredentialVaultTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS credential_vault_entries (
    id TEXT PRIMARY KEY,
    scope_type TEXT NOT NULL,
    scope_id TEXT NOT NULL,
    category TEXT NOT NULL,
    name TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    key_version INTEGER NOT NULL,
    version INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    archived_at TEXT,
    archived_by TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS credential_vault_permissions (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    subject_type TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    actions TEXT NOT NULL,
    expires_at TEXT,
    created_at TEXT NOT NULL,
    created_by TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS credential_vault_audit (
    id TEXT PRIMARY KEY,
    entry_id TEXT NOT NULL,
    action TEXT NOT NULL,
    field_categories TEXT NOT NULL,
    actor_type TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    purpose TEXT NOT NULL,
    result TEXT NOT NULL,
    request_id TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`).run();
}

function metadataFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    scopeType: row.scope_type,
    scopeId: row.scope_id,
    category: row.category,
    name: row.name,
    schemaVersion: Number(row.schema_version || 1),
    keyVersion: Number(row.key_version || 1),
    version: Number(row.version || 1),
    hasSecret: Boolean(row.ciphertext),
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by,
    archivedAt: row.archived_at || ""
  };
}

async function audit(db, entryId, action, fields, context = {}, result = "success") {
  const createdAt = new Date().toISOString();
  await db.prepare(`INSERT INTO credential_vault_audit
    (id, entry_id, action, field_categories, actor_type, actor_id, actor_name, purpose, result, request_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(),
    entryId,
    action,
    JSON.stringify([...new Set(fields)].sort()),
    cleanString(context.actorType || "employee", "actorType", 40),
    cleanString(context.actorId || "unknown", "actorId", 160),
    cleanString(context.actorName || "unknown", "actorName", 160),
    cleanString(context.purpose || "", "purpose", 200),
    result,
    cleanString(context.requestId || "", "requestId", 120),
    createdAt
  ).run();
}

async function entryRow(db, id) {
  await ensureCredentialVaultTables(db);
  return db.prepare(`SELECT id, scope_type, scope_id, category, name, schema_version,
    ciphertext, iv, algorithm, key_version, version, created_at, created_by,
    updated_at, updated_by, archived_at, archived_by
    FROM credential_vault_entries WHERE id = ?`).bind(id).first();
}

function normalizeCreateInput(input = {}) {
  const scopeType = cleanString(input.scopeType, "scopeType", 40);
  if (!SCOPE_TYPES.has(scopeType)) throw storageError("凭证范围不合法。", "CREDENTIAL_ENTRY_INVALID", 400);
  const scopeId = cleanString(input.scopeId, "scopeId", 160);
  const category = cleanString(input.category, "category", 80);
  const name = cleanString(input.name, "name", 160);
  if (!scopeId || !category || !name) throw storageError("凭证范围、分类和名称不能为空。", "CREDENTIAL_ENTRY_INVALID", 400);
  return {
    id: cleanString(input.id || crypto.randomUUID(), "id", 120),
    scopeType,
    scopeId,
    category,
    name,
    schemaVersion: Number.isInteger(Number(input.schemaVersion)) ? Number(input.schemaVersion) : 1,
    secretPayload: normalizeSecretPayload(input.secretPayload)
  };
}

export async function listCredentialMetadata(db, filter = {}) {
  await ensureCredentialVaultTables(db);
  const result = await db.prepare(`SELECT id, scope_type, scope_id, category, name, schema_version,
    ciphertext, key_version, version, created_at, created_by, updated_at, updated_by, archived_at
    FROM credential_vault_entries WHERE archived_at IS NULL ORDER BY updated_at DESC`).all();
  return (result?.results || [])
    .filter(row => !filter.scopeType || row.scope_type === filter.scopeType)
    .filter(row => !filter.scopeId || row.scope_id === filter.scopeId)
    .map(metadataFromRow);
}

export async function createCredentialEntry(db, input, context = {}) {
  await ensureCredentialVaultTables(db);
  const normalized = normalizeCreateInput(input);
  const encrypted = await encryptCredential(normalized.secretPayload, {
    masterKey: context.masterKey,
    entryId: normalized.id,
    purpose: normalized.scopeType,
    keyVersion: 1
  });
  const now = new Date().toISOString();
  const actor = cleanString(context.actorName || context.actorId || "unknown", "actor", 160);
  await db.prepare(`INSERT INTO credential_vault_entries
    (id, scope_type, scope_id, category, name, schema_version, ciphertext, iv, algorithm,
      key_version, version, created_at, created_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    normalized.id, normalized.scopeType, normalized.scopeId, normalized.category,
    normalized.name, normalized.schemaVersion, encrypted.ciphertext, encrypted.iv,
    encrypted.algorithm, encrypted.keyVersion, 1, now, actor, now, actor
  ).run();
  await audit(db, normalized.id, "create", Object.keys(normalized.secretPayload), context);
  return metadataFromRow({
    id: normalized.id, scope_type: normalized.scopeType, scope_id: normalized.scopeId,
    category: normalized.category, name: normalized.name, schema_version: normalized.schemaVersion,
    ciphertext: encrypted.ciphertext, key_version: encrypted.keyVersion, version: 1,
    created_at: now, created_by: actor, updated_at: now, updated_by: actor
  });
}

export async function replaceCredentialEntry(db, id, input = {}, context = {}) {
  const current = await entryRow(db, id);
  if (!current || current.archived_at) throw storageError("凭证条目不存在。", "CREDENTIAL_ENTRY_NOT_FOUND", 404);
  const expectedVersion = Number(input.expectedVersion);
  if (expectedVersion !== Number(current.version)) throw storageError("凭证版本已更新，请刷新后重试。", "CREDENTIAL_VERSION_CONFLICT", 409);
  const payload = input.secretPayload ? normalizeSecretPayload(input.secretPayload) : null;
  const encrypted = payload ? await encryptCredential(payload, {
    masterKey: context.masterKey,
    entryId: id,
    purpose: current.scope_type,
    keyVersion: 1
  }) : {
    ciphertext: current.ciphertext,
    iv: current.iv,
    algorithm: current.algorithm,
    keyVersion: Number(current.key_version)
  };
  const name = cleanString(input.name ?? current.name, "name", 160);
  const schemaVersion = Number.isInteger(Number(input.schemaVersion)) ? Number(input.schemaVersion) : Number(current.schema_version);
  const nextVersion = Number(current.version) + 1;
  const now = new Date().toISOString();
  const actor = cleanString(context.actorName || context.actorId || "unknown", "actor", 160);
  const result = await db.prepare(`UPDATE credential_vault_entries SET name = ?, schema_version = ?,
    ciphertext = ?, iv = ?, algorithm = ?, key_version = ?, version = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND version = ? AND archived_at IS NULL`).bind(
    name, schemaVersion, encrypted.ciphertext, encrypted.iv, encrypted.algorithm,
    encrypted.keyVersion, nextVersion, now, actor, id, expectedVersion
  ).run();
  if (Number(result?.meta?.changes || 0) !== 1) throw storageError("凭证版本已更新，请刷新后重试。", "CREDENTIAL_VERSION_CONFLICT", 409);
  await audit(db, id, "replace", payload ? Object.keys(payload) : ["metadata"], context);
  return metadataFromRow({ ...current, name, schema_version: schemaVersion, ciphertext: encrypted.ciphertext, key_version: encrypted.keyVersion, version: nextVersion, updated_at: now, updated_by: actor });
}

export async function archiveCredentialEntry(db, id, input = {}, context = {}) {
  const current = await entryRow(db, id);
  if (!current || current.archived_at) throw storageError("凭证条目不存在。", "CREDENTIAL_ENTRY_NOT_FOUND", 404);
  const expectedVersion = Number(input.expectedVersion);
  const nextVersion = Number(current.version) + 1;
  const now = new Date().toISOString();
  const actor = cleanString(context.actorName || context.actorId || "unknown", "actor", 160);
  const result = await db.prepare(`UPDATE credential_vault_entries SET archived_at = ?, archived_by = ?,
    version = ? WHERE id = ? AND version = ? AND archived_at IS NULL`)
    .bind(now, actor, nextVersion, id, expectedVersion)
    .run();
  if (Number(result?.meta?.changes || 0) !== 1) throw storageError("凭证版本已更新，请刷新后重试。", "CREDENTIAL_VERSION_CONFLICT", 409);
  await audit(db, id, "archive", ["status"], context);
  return { ...metadataFromRow(current), version: nextVersion, archivedAt: now };
}

export async function destroyCredentialEntry(db, id, input = {}, context = {}) {
  const current = await entryRow(db, id);
  if (!current || current.archived_at) throw storageError("凭证条目不存在。", "CREDENTIAL_ENTRY_NOT_FOUND", 404);
  const expectedVersion = Number(input.expectedVersion);
  if (expectedVersion !== Number(current.version)) throw storageError("凭证版本已更新，请刷新后重试。", "CREDENTIAL_VERSION_CONFLICT", 409);
  const nextVersion = Number(current.version) + 1;
  const now = new Date().toISOString();
  const actor = cleanString(context.actorName || context.actorId || "unknown", "actor", 160);
  const result = await db.prepare(`UPDATE credential_vault_entries SET ciphertext = ?, iv = ?,
    archived_at = ?, archived_by = ?, version = ?, updated_at = ?, updated_by = ?
    WHERE id = ? AND version = ? AND archived_at IS NULL`)
    .bind("", "", now, actor, nextVersion, now, actor, id, expectedVersion)
    .run();
  if (Number(result?.meta?.changes || 0) !== 1) throw storageError("凭证版本已更新，请刷新后重试。", "CREDENTIAL_VERSION_CONFLICT", 409);
  await audit(db, id, "destroy", ["secret", "status"], context);
  return metadataFromRow({
    ...current,
    ciphertext: "",
    iv: "",
    version: nextVersion,
    updated_at: now,
    updated_by: actor,
    archived_at: now,
    archived_by: actor
  });
}

export async function revealCredentialEntry(db, id, context = {}) {
  const current = await entryRow(db, id);
  if (!current || current.archived_at) throw storageError("凭证条目不存在。", "CREDENTIAL_ENTRY_NOT_FOUND", 404);
  const secretPayload = await decryptCredential({
    ciphertext: current.ciphertext,
    iv: current.iv,
    algorithm: current.algorithm,
    keyVersion: Number(current.key_version)
  }, {
    masterKey: context.masterKey,
    entryId: id,
    purpose: current.scope_type,
    keyVersion: Number(current.key_version)
  });
  await audit(db, id, "reveal", Object.keys(secretPayload), context);
  return { entry: metadataFromRow(current), secretPayload };
}

export async function assertCredentialRevealRateLimit(db, id, { limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
  await ensureCredentialVaultTables(db);
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM credential_vault_audit
    WHERE entry_id = ? AND action = ? AND result = 'success' AND created_at >= ?`)
    .bind(id, "reveal", since)
    .first();
  if (Number(row?.count || 0) >= limit) {
    throw storageError("明文查看过于频繁，请稍后再试。", "CREDENTIAL_RATE_LIMITED", 429);
  }
}
