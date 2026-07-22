import {
  platformConfiguredEnvVars,
  platformConnectionDefinition,
  platformEnvironmentValues,
  platformRequiredFields
} from "../../../../src/domain/platformConnections.js";
import {
  decryptPlatformCredentials,
  encryptPlatformCredentials,
  platformCredentialCryptoInternals
} from "./credentialCrypto.js";

function platformError(message, code, status, retryable = false) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  error.retryable = retryable;
  return error;
}

function cleanString(value, label, maxLength = 4096) {
  if (value == null) return "";
  if (typeof value !== "string") throw platformError(`${label} 必须是文本。`, "PLATFORM_CONNECTION_INVALID", 400);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw platformError(`${label} 内容过长。`, "PLATFORM_CONNECTION_INVALID", 400);
  return cleaned;
}

function parseConfiguredFields(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean).sort() : [];
  } catch {
    return [];
  }
}

function metadataFromRow(row) {
  if (!row) return null;
  return {
    platformId: row.platform_id,
    configuredFields: parseConfiguredFields(row.configured_fields),
    version: Number(row.version || 0),
    enabled: Boolean(row.enabled),
    verifiedAt: row.verified_at || "",
    verifiedBy: row.verified_by || "",
    updatedAt: row.updated_at || "",
    updatedBy: row.updated_by || "",
    source: Boolean(row.enabled) ? "vault" : "disabled"
  };
}

function normalizeFields(platformId, fields = {}) {
  const definition = platformConnectionDefinition(platformId);
  if (!definition?.available) throw platformError("该平台尚未开放连接配置。", "PLATFORM_CONNECTION_INVALID", 400);
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw platformError("平台连接字段格式不正确。", "PLATFORM_CONNECTION_INVALID", 400);
  }
  const allowed = new Map(definition.fields.map(field => [field.key, field]));
  const unknown = Object.keys(fields).filter(key => !allowed.has(key));
  if (unknown.length) throw platformError(`平台连接包含不支持的字段：${unknown.join("、")}。`, "PLATFORM_CONNECTION_INVALID", 400);
  return Object.fromEntries(Object.entries(fields).flatMap(([key, value]) => {
    const cleaned = cleanString(value, allowed.get(key).label, allowed.get(key).maxLength);
    return cleaned ? [[key, cleaned]] : [];
  }));
}

function assertRequired(platformId, values) {
  const missing = platformRequiredFields(platformId).filter(key => !String(values[key] || "").trim());
  if (missing.length) throw platformError("请补全该平台的必要连接信息。", "PLATFORM_CONNECTION_INVALID", 400);
}

function actorName(context = {}) {
  return cleanString(context.actorName || context.actorId || "unknown", "操作者", 160);
}

export function platformCredentialDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensurePlatformCredentialTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS platform_credentials (
    platform_id TEXT PRIMARY KEY,
    ciphertext TEXT NOT NULL,
    iv TEXT NOT NULL,
    algorithm TEXT NOT NULL,
    key_version INTEGER NOT NULL,
    configured_fields TEXT NOT NULL,
    version INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    verified_at TEXT NOT NULL,
    verified_by TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS platform_credential_audit (
    id TEXT PRIMARY KEY,
    platform_id TEXT NOT NULL,
    action TEXT NOT NULL,
    changed_fields TEXT NOT NULL,
    result TEXT NOT NULL,
    request_id TEXT NOT NULL,
    actor_id TEXT NOT NULL,
    actor_name TEXT NOT NULL,
    purpose TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL
  )`).run();
}

async function currentRow(db, platformId) {
  await ensurePlatformCredentialTables(db);
  return db.prepare(`SELECT platform_id, ciphertext, iv, algorithm, key_version,
    configured_fields, version, enabled, verified_at, verified_by, updated_at, updated_by
    FROM platform_credentials WHERE platform_id = ?`).bind(platformId).first();
}

async function writeAudit(db, input, context, result = "success") {
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO platform_credential_audit
    (id, platform_id, action, changed_fields, result, request_id, actor_id, actor_name, purpose, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
    crypto.randomUUID(), input.platformId, input.action,
    JSON.stringify([...new Set(input.changedFields || [])].sort()), result,
    cleanString(context.requestId || "", "requestId", 120),
    cleanString(context.actorId || "unknown", "actorId", 160),
    actorName(context), cleanString(context.purpose || "", "用途", 200), now
  ).run();
}

function conditionalAuditStatement(db, input, context, { exists, expectedVersion }) {
  const now = new Date().toISOString();
  const conditionSql = exists
    ? "EXISTS (SELECT 1 FROM platform_credentials WHERE platform_id = ? AND version = ?)"
    : "NOT EXISTS (SELECT 1 FROM platform_credentials WHERE platform_id = ?)";
  const conditionValues = exists ? [input.platformId, Number(expectedVersion)] : [input.platformId];
  return db.prepare(`INSERT INTO platform_credential_audit
    (id, platform_id, action, changed_fields, result, request_id, actor_id, actor_name, purpose, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${conditionSql}`).bind(
    crypto.randomUUID(), input.platformId, input.action,
    JSON.stringify([...new Set(input.changedFields || [])].sort()), "success",
    cleanString(context.requestId || "", "requestId", 120),
    cleanString(context.actorId || "unknown", "actorId", 160),
    actorName(context), cleanString(context.purpose || "", "用途", 200), now, ...conditionValues
  );
}

export async function listPlatformCredentialMetadata(db) {
  await ensurePlatformCredentialTables(db);
  const result = await db.prepare(`SELECT platform_id, configured_fields, version, enabled,
    verified_at, verified_by, updated_at, updated_by FROM platform_credentials ORDER BY platform_id`).all();
  return (result?.results || []).map(metadataFromRow).filter(Boolean);
}

export async function readPlatformCredentials(env = {}, platformId) {
  const environmentValues = platformEnvironmentValues(env, platformId);
  const db = platformCredentialDatabase(env);
  const masterKey = String(env.PLATFORM_CREDENTIAL_MASTER_KEY || "").trim();
  if (!db || !platformCredentialCryptoInternals.validMasterKey(masterKey)) {
    return { values: environmentValues, source: Object.keys(environmentValues).length ? "environment" : "none", version: 0 };
  }
  let row;
  try {
    row = await currentRow(db, platformId);
  } catch {
    return { values: environmentValues, source: Object.keys(environmentValues).length ? "environment" : "none", version: 0 };
  }
  if (!row || !Boolean(row.enabled)) {
    return { values: environmentValues, source: Object.keys(environmentValues).length ? "environment" : "none", version: Number(row?.version || 0) };
  }
  try {
    const values = await decryptPlatformCredentials(row, { masterKey, platformId, keyVersion: Number(row.key_version) });
    return { values, source: "vault", version: Number(row.version || 0) };
  } catch (error) {
    if (Object.keys(environmentValues).length) return { values: environmentValues, source: "environment", version: Number(row.version || 0) };
    throw error;
  }
}

export async function platformCredentialIsUsable(env = {}, platformId) {
  try {
    return (await readPlatformCredentials(env, platformId)).source === "vault";
  } catch {
    return false;
  }
}

export async function platformEnv(env = {}, platformId) {
  const resolved = await readPlatformCredentials(env, platformId);
  if (resolved.source !== "vault") return env;
  const definition = platformConnectionDefinition(platformId);
  const overrides = Object.fromEntries(definition.fields.flatMap(field => {
    const value = resolved.values[field.key];
    return value ? [[field.envVar, value]] : [];
  }));
  return { ...env, ...overrides };
}

export async function configuredCredentialEnvVars(env = {}) {
  const db = platformCredentialDatabase(env);
  if (!db || !platformCredentialCryptoInternals.validMasterKey(env.PLATFORM_CREDENTIAL_MASTER_KEY)) return new Set();
  try {
    const rows = await listPlatformCredentialMetadata(db);
    const configured = new Set();
    for (const row of rows.filter(item => item.enabled)) {
      if (!await platformCredentialIsUsable(env, row.platformId)) continue;
      for (const name of platformConfiguredEnvVars(row.platformId, row.configuredFields)) configured.add(name);
    }
    return configured;
  } catch {
    return new Set();
  }
}

export async function assertPlatformCredentialRevealRateLimit(db, platformId, { limit = 5, windowMs = 15 * 60 * 1000 } = {}) {
  await ensurePlatformCredentialTables(db);
  const since = new Date(Date.now() - windowMs).toISOString();
  const row = await db.prepare(`SELECT COUNT(*) AS count FROM platform_credential_audit
    WHERE platform_id = ? AND action = ? AND result = 'success' AND created_at >= ?`)
    .bind(cleanString(platformId, "平台", 80), "reveal", since)
    .first();
  if (Number(row?.count || 0) >= limit) {
    throw platformError("凭据查看过于频繁，请稍后再试。", "PLATFORM_CREDENTIAL_REVEAL_RATE_LIMITED", 429);
  }
}

export async function revealPlatformCredentials(db, platformIdInput, context = {}) {
  const platformId = cleanString(platformIdInput, "平台", 80);
  const purpose = cleanString(context.purpose, "查看用途", 200);
  if (!purpose) throw platformError("请填写本次查看用途。", "PLATFORM_CREDENTIAL_REVEAL_INVALID", 400);
  const row = await currentRow(db, platformId);
  if (!row || !Boolean(row.enabled)) {
    throw platformError("当前没有可查看的保险箱凭据。", "PLATFORM_CREDENTIAL_REVEAL_UNAVAILABLE", 404);
  }
  const masterKey = cleanString(context.masterKey, "加密主密钥", 500);
  if (!platformCredentialCryptoInternals.validMasterKey(masterKey)) {
    throw platformError("平台连接的解密能力暂不可用。", "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE", 503);
  }
  const fields = await decryptPlatformCredentials(row, {
    masterKey,
    platformId,
    keyVersion: Number(row.key_version)
  });
  await writeAudit(db, { platformId, action: "reveal", changedFields: [] }, { ...context, purpose });
  return { platformId, fields };
}

export async function savePlatformCredentials(db, input = {}, context = {}) {
  const platformId = cleanString(input.platformId, "平台", 80);
  const changed = normalizeFields(platformId, input.fields);
  if (!Object.keys(changed).length) throw platformError("请至少填写一项需要更新的连接信息。", "PLATFORM_CONNECTION_INVALID", 400);
  const row = await currentRow(db, platformId);
  const expectedVersion = Number(input.expectedVersion || 0);
  if (expectedVersion !== Number(row?.version || 0)) {
    throw platformError("连接已被其他人更新，请刷新后重试。", "PLATFORM_CONNECTION_VERSION_CONFLICT", 409);
  }
  const masterKey = cleanString(context.masterKey, "加密主密钥", 500);
  if (!platformCredentialCryptoInternals.validMasterKey(masterKey)) {
    throw platformError("平台连接的加密能力暂不可用。", "PLATFORM_CREDENTIAL_KEY_UNAVAILABLE", 503);
  }
  const currentValues = row
    ? await decryptPlatformCredentials(row, { masterKey, platformId, keyVersion: Number(row.key_version) })
    : normalizeFields(platformId, context.fallbackValues || {});
  const values = { ...currentValues, ...changed };
  assertRequired(platformId, values);
  try {
    if (typeof context.validate !== "function") throw platformError("平台连接验证器不可用。", "PLATFORM_CONNECTION_VALIDATION_FAILED", 503, true);
    await context.validate(values);
  } catch (error) {
    await writeAudit(db, { platformId, action: "validate", changedFields: Object.keys(changed) }, context, error?.code || "failed");
    throw error;
  }
  const encrypted = await encryptPlatformCredentials(values, { masterKey, platformId, keyVersion: 1 });
  const now = new Date().toISOString();
  const verifiedBy = actorName(context);
  const version = expectedVersion + 1;
  const configuredFields = Object.keys(values).filter(key => values[key]).sort();
  const credentialStatement = db.prepare(`INSERT INTO platform_credentials
    (platform_id, ciphertext, iv, algorithm, key_version, configured_fields, version,
      enabled, verified_at, verified_by, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(platform_id) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      iv = excluded.iv,
      algorithm = excluded.algorithm,
      key_version = excluded.key_version,
      configured_fields = excluded.configured_fields,
      version = excluded.version,
      enabled = excluded.enabled,
      verified_at = excluded.verified_at,
      verified_by = excluded.verified_by,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by
    WHERE platform_credentials.version = excluded.version - 1`).bind(
    platformId, encrypted.ciphertext, encrypted.iv, encrypted.algorithm, encrypted.keyVersion,
    JSON.stringify(configuredFields), version, 1, now, verifiedBy, now, verifiedBy
  );
  const auditStatement = conditionalAuditStatement(db, {
    platformId,
    action: row ? "replace" : "create",
    changedFields: Object.keys(changed)
  }, context, { exists: Boolean(row), expectedVersion });
  const [auditResult, credentialResult] = await db.batch([auditStatement, credentialStatement]);
  if (Number(auditResult?.meta?.changes ?? 0) !== 1 || Number(credentialResult?.meta?.changes ?? 0) !== 1) {
    throw platformError("连接已被其他人更新，请刷新后重试。", "PLATFORM_CONNECTION_VERSION_CONFLICT", 409);
  }
  return metadataFromRow({
    platform_id: platformId,
    configured_fields: JSON.stringify(configuredFields),
    version,
    enabled: 1,
    verified_at: now,
    verified_by: verifiedBy,
    updated_at: now,
    updated_by: verifiedBy
  });
}

export async function disablePlatformCredentials(db, input = {}, context = {}) {
  const platformId = cleanString(input.platformId, "平台", 80);
  const row = await currentRow(db, platformId);
  if (!row) throw platformError("该平台还没有可停用的连接。", "PLATFORM_CONNECTION_NOT_FOUND", 404);
  const expectedVersion = Number(input.expectedVersion || 0);
  if (expectedVersion !== Number(row.version || 0)) {
    throw platformError("连接已被其他人更新，请刷新后重试。", "PLATFORM_CONNECTION_VERSION_CONFLICT", 409);
  }
  const now = new Date().toISOString();
  const updatedBy = actorName(context);
  const version = expectedVersion + 1;
  const auditStatement = conditionalAuditStatement(db, {
    platformId,
    action: "disable",
    changedFields: ["enabled"]
  }, context, { exists: true, expectedVersion });
  const updateStatement = db.prepare(`UPDATE platform_credentials SET enabled = ?, version = ?, updated_at = ?, updated_by = ?
    WHERE platform_id = ? AND version = ?`).bind(0, version, now, updatedBy, platformId, expectedVersion);
  const [auditResult, updateResult] = await db.batch([auditStatement, updateStatement]);
  if (Number(auditResult?.meta?.changes ?? 0) !== 1 || Number(updateResult?.meta?.changes ?? 0) !== 1) {
    throw platformError("连接已被其他人更新，请刷新后重试。", "PLATFORM_CONNECTION_VERSION_CONFLICT", 409);
  }
  return metadataFromRow({ ...row, version, enabled: 0, updated_at: now, updated_by: updatedBy });
}
