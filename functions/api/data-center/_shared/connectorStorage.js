import {
  INTERNAL_VAULT_TYPES,
  connectorDefinition,
  normalizeConnectorInstance,
  splitConnectorPayload
} from "../../../../src/domain/dataCenterConnectors.js";

const VAULT_TYPE_IDS = new Set(INTERNAL_VAULT_TYPES.map(item => item.id));
const VAULT_FIELDS = new Set([
  "id", "itemType", "name", "companySubject", "location", "address", "protocol",
  "resourcePath", "owner", "purpose", "reviewDate", "credentialEntryId", "status", "version"
]);

function connectorError(message, code = "DATA_CONNECTOR_INVALID", status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function cleanString(value, label, maxLength = 500) {
  if (value == null) return "";
  if (typeof value !== "string") throw connectorError(`${label} 必须是字符串。`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw connectorError(`${label} 不能超过 ${maxLength} 个字符。`);
  return cleaned;
}

export function connectorDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

export async function ensureConnectorTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_connector_instances (
    id TEXT PRIMARY KEY, connector_id TEXT NOT NULL, name TEXT NOT NULL,
    company_subject TEXT, account_type TEXT, capture_method TEXT NOT NULL,
    console_url TEXT, datasets TEXT NOT NULL, owner TEXT, runner_id TEXT,
    credential_entry_id TEXT, schedule TEXT NOT NULL, time_basis TEXT NOT NULL,
    timezone TEXT NOT NULL, status TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
    version INTEGER NOT NULL DEFAULT 1, last_validated_at TEXT, last_success_at TEXT,
    last_data_date TEXT, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, archived_at TEXT, archived_by TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS internal_vault_items (
    id TEXT PRIMARY KEY, item_type TEXT NOT NULL, name TEXT NOT NULL,
    company_subject TEXT, location TEXT, address TEXT, protocol TEXT, resource_path TEXT,
    owner TEXT, purpose TEXT, review_date TEXT, credential_entry_id TEXT, status TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, created_by TEXT NOT NULL,
    updated_at TEXT NOT NULL, updated_by TEXT NOT NULL, archived_at TEXT, archived_by TEXT
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS data_audit_logs (
    entity_type TEXT NOT NULL,
    id TEXT NOT NULL,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT,
    PRIMARY KEY (entity_type, id)
  )`).run();
}

async function writeConnectorAudit(db, action, changedFields, actor) {
  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify({ action, changedFields: [...new Set(changedFields)].sort() });
  await db.prepare(`INSERT INTO data_audit_logs
    (entity_type, id, payload, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)`)
    .bind("connector_audit", crypto.randomUUID(), payload, updatedAt, actor)
    .run();
}

function connectorFromRow(row) {
  if (!row) return null;
  let datasets = [];
  try {
    datasets = JSON.parse(row.datasets || "[]");
  } catch {
    datasets = [];
  }
  return {
    id: row.id,
    connectorId: row.connector_id,
    name: row.name,
    companySubject: row.company_subject || "",
    accountType: row.account_type || "",
    captureMethod: row.capture_method,
    consoleUrl: row.console_url || "",
    datasets: Array.isArray(datasets) ? datasets : [],
    owner: row.owner || "",
    runnerId: row.runner_id || "",
    credentialEntryId: row.credential_entry_id || "",
    schedule: row.schedule,
    timeBasis: row.time_basis,
    timezone: row.timezone,
    status: row.status,
    enabled: Boolean(row.enabled),
    version: Number(row.version || 1),
    lastValidatedAt: row.last_validated_at || "",
    lastSuccessAt: row.last_success_at || "",
    lastDataDate: row.last_data_date || "",
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  };
}

function vaultItemFromRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    itemType: row.item_type,
    name: row.name,
    companySubject: row.company_subject || "",
    location: row.location || "",
    address: row.address || "",
    protocol: row.protocol || "",
    resourcePath: row.resource_path || "",
    owner: row.owner || "",
    purpose: row.purpose || "",
    reviewDate: row.review_date || "",
    credentialEntryId: row.credential_entry_id || "",
    status: row.status,
    version: Number(row.version || 1),
    createdAt: row.created_at,
    createdBy: row.created_by,
    updatedAt: row.updated_at,
    updatedBy: row.updated_by
  };
}

export async function listConnectorRecords(db, { includeVaultItems = false } = {}) {
  await ensureConnectorTables(db);
  const connectorResult = await db.prepare(`SELECT * FROM data_connector_instances
    WHERE archived_at IS NULL ORDER BY updated_at DESC`).all();
  const connectors = (connectorResult?.results || []).map(connectorFromRow);
  if (!includeVaultItems) return { connectors, vaultItems: [] };
  const vaultResult = await db.prepare(`SELECT * FROM internal_vault_items
    WHERE archived_at IS NULL ORDER BY updated_at DESC`).all();
  return { connectors, vaultItems: (vaultResult?.results || []).map(vaultItemFromRow) };
}

async function connectorRow(db, id) {
  await ensureConnectorTables(db);
  return db.prepare("SELECT * FROM data_connector_instances WHERE id = ?").bind(id).first();
}

async function vaultItemRow(db, id) {
  await ensureConnectorTables(db);
  return db.prepare("SELECT * FROM internal_vault_items WHERE id = ?").bind(id).first();
}

export async function upsertConnectorRecord(db, input = {}, context = {}) {
  await ensureConnectorTables(db);
  const incomingId = cleanString(input.id, "id", 120);
  const existingRow = incomingId ? await connectorRow(db, incomingId) : null;
  if (incomingId && (!existingRow || existingRow.archived_at)) throw connectorError("连接实例不存在。", "DATA_CONNECTOR_NOT_FOUND", 404);
  const existing = connectorFromRow(existingRow);
  const expectedVersion = Number(context.expectedVersion);
  if ((!existing && expectedVersion !== 0) || (existing && expectedVersion !== existing.version)) {
    throw connectorError("连接实例版本已更新，请刷新后重试。", "DATA_CONNECTOR_VERSION_CONFLICT", 409);
  }
  const definition = connectorDefinition(input.connectorId);
  const split = splitConnectorPayload(definition, input);
  if (Object.keys(split.secretPayload).length) {
    throw connectorError("敏感字段必须通过加密凭证保险箱保存。", "DATA_CONNECTOR_INVALID", 400);
  }
  const normalized = normalizeConnectorInstance(input, { existing });
  const id = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const actor = cleanString(context.actor || "unknown", "actor", 160);
  const version = existing ? existing.version + 1 : 1;
  const result = await db.prepare(`INSERT INTO data_connector_instances (
    id, connector_id, name, company_subject, account_type, capture_method, console_url,
    datasets, owner, runner_id, credential_entry_id, schedule, time_basis, timezone,
    status, enabled, version, created_at, created_by, updated_at, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    connector_id = excluded.connector_id, name = excluded.name,
    company_subject = excluded.company_subject, account_type = excluded.account_type,
    capture_method = excluded.capture_method, console_url = excluded.console_url,
    datasets = excluded.datasets, owner = excluded.owner, runner_id = excluded.runner_id,
    credential_entry_id = excluded.credential_entry_id, schedule = excluded.schedule,
    time_basis = excluded.time_basis, timezone = excluded.timezone,
    status = data_connector_instances.status, enabled = excluded.enabled,
    version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  WHERE data_connector_instances.version = ? AND data_connector_instances.archived_at IS NULL`).bind(
    id, normalized.connectorId, normalized.name, normalized.companySubject || "",
    normalized.accountType || "", normalized.captureMethod, normalized.consoleUrl || "",
    JSON.stringify(normalized.datasets), normalized.owner || "", normalized.runnerId || "",
    normalized.credentialEntryId || "", normalized.schedule, normalized.timeBasis,
    normalized.timezone, normalized.status, normalized.enabled ? 1 : 0, version,
    existing?.createdAt || now, existing?.createdBy || actor, now, actor, expectedVersion
  ).run();
  if (existing && Number(result?.meta?.changes || 0) !== 1) {
    throw connectorError("连接实例版本已更新，请刷新后重试。", "DATA_CONNECTOR_VERSION_CONFLICT", 409);
  }
  await writeConnectorAudit(db, existing ? "update_connector" : "create_connector", Object.keys(input), actor);
  return {
    ...normalized,
    id,
    status: existing?.status || normalized.status,
    version,
    createdAt: existing?.createdAt || now,
    createdBy: existing?.createdBy || actor,
    updatedAt: now,
    updatedBy: actor
  };
}

function normalizeVaultItem(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw connectorError("内部保险箱条目必须是对象。");
  const unknown = Object.keys(input).filter(key => !VAULT_FIELDS.has(key));
  if (unknown.length) throw connectorError(`内部保险箱包含不支持的字段：${unknown.join("、")}。`);
  const itemType = cleanString(input.itemType, "itemType", 40);
  if (!VAULT_TYPE_IDS.has(itemType)) throw connectorError("内部保险箱类型不合法。");
  const name = cleanString(input.name, "name", 160);
  if (!name) throw connectorError("内部保险箱名称不能为空。");
  return {
    id: cleanString(input.id, "id", 120),
    itemType,
    name,
    companySubject: cleanString(input.companySubject, "companySubject", 160),
    location: cleanString(input.location, "location", 160),
    address: cleanString(input.address, "address", 500),
    protocol: cleanString(input.protocol, "protocol", 40),
    resourcePath: cleanString(input.resourcePath, "resourcePath", 500),
    owner: cleanString(input.owner, "owner", 160),
    purpose: cleanString(input.purpose, "purpose", 500),
    reviewDate: cleanString(input.reviewDate, "reviewDate", 10),
    credentialEntryId: cleanString(input.credentialEntryId, "credentialEntryId", 120),
    status: "pending_validation"
  };
}

export async function upsertVaultItemRecord(db, input = {}, context = {}) {
  await ensureConnectorTables(db);
  const normalized = normalizeVaultItem(input);
  const existingRow = normalized.id ? await vaultItemRow(db, normalized.id) : null;
  const existing = vaultItemFromRow(existingRow);
  const expectedVersion = Number(context.expectedVersion);
  if ((!existing && expectedVersion !== 0) || (existing && expectedVersion !== existing.version)) {
    throw connectorError("保险箱条目版本已更新，请刷新后重试。", "DATA_CONNECTOR_VERSION_CONFLICT", 409);
  }
  const id = existing?.id || crypto.randomUUID();
  const now = new Date().toISOString();
  const actor = cleanString(context.actor || "unknown", "actor", 160);
  const version = existing ? existing.version + 1 : 1;
  const result = await db.prepare(`INSERT INTO internal_vault_items (
    id, item_type, name, company_subject, location, address, protocol, resource_path,
    owner, purpose, review_date, credential_entry_id, status, version,
    created_at, created_by, updated_at, updated_by
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    item_type = excluded.item_type, name = excluded.name,
    company_subject = excluded.company_subject, location = excluded.location,
    address = excluded.address, protocol = excluded.protocol, resource_path = excluded.resource_path,
    owner = excluded.owner, purpose = excluded.purpose, review_date = excluded.review_date,
    credential_entry_id = excluded.credential_entry_id, status = internal_vault_items.status,
    version = excluded.version, updated_at = excluded.updated_at, updated_by = excluded.updated_by
  WHERE internal_vault_items.version = ? AND internal_vault_items.archived_at IS NULL`).bind(
    id, normalized.itemType, normalized.name, normalized.companySubject, normalized.location,
    normalized.address, normalized.protocol, normalized.resourcePath, normalized.owner,
    normalized.purpose, normalized.reviewDate, normalized.credentialEntryId,
    existing?.status || normalized.status, version, existing?.createdAt || now,
    existing?.createdBy || actor, now, actor, expectedVersion
  ).run();
  if (existing && Number(result?.meta?.changes || 0) !== 1) {
    throw connectorError("保险箱条目版本已更新，请刷新后重试。", "DATA_CONNECTOR_VERSION_CONFLICT", 409);
  }
  await writeConnectorAudit(db, existing ? "update_vault_item" : "create_vault_item", Object.keys(input), actor);
  return { ...normalized, id, status: existing?.status || normalized.status, version, createdAt: existing?.createdAt || now, createdBy: existing?.createdBy || actor, updatedAt: now, updatedBy: actor };
}

export async function archiveConnectorRecord(db, id, input = {}, context = {}) {
  const existingRow = await connectorRow(db, id);
  const existing = connectorFromRow(existingRow);
  if (!existing || existingRow.archived_at) throw connectorError("连接实例不存在。", "DATA_CONNECTOR_NOT_FOUND", 404);
  const expectedVersion = Number(input.expectedVersion);
  const nextVersion = existing.version + 1;
  const now = new Date().toISOString();
  const actor = cleanString(context.actor || "unknown", "actor", 160);
  const result = await db.prepare(`UPDATE data_connector_instances SET archived_at = ?, archived_by = ?,
    version = ? WHERE id = ? AND version = ? AND archived_at IS NULL`)
    .bind(now, actor, nextVersion, id, expectedVersion)
    .run();
  if (Number(result?.meta?.changes || 0) !== 1) throw connectorError("连接实例版本已更新，请刷新后重试。", "DATA_CONNECTOR_VERSION_CONFLICT", 409);
  await writeConnectorAudit(db, "archive_connector", ["status"], actor);
  return { ...existing, version: nextVersion, archivedAt: now };
}
