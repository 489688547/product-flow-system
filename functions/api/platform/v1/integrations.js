import integrationRegistry from "../../../../docs/platform/integration-registry.json" with { type: "json" };
import { canManagePermissions } from "../../../../src/domain/permissions.js";
import { jsonResponse, optionsResponse } from "../../dingtalk/_shared/dingtalk.js";

const PROFILE_FIELDS = [
  "consoleUrl",
  "accountSubject",
  "resourceNames",
  "environments",
  "owner",
  "permissionGuide",
  "runbook",
  "verifiedAt"
];
const ALLOWED_FIELDS = new Set(["platformId", ...PROFILE_FIELDS]);
const ENVIRONMENT_FIELDS = new Set(["name", "url", "notes"]);
const PLATFORM_IDS = new Set(integrationRegistry.platforms.map(platform => platform.id));
const SENSITIVE_VALUE = /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bBearer\s+[A-Za-z0-9._~-]{12,}|\bsk-[A-Za-z0-9]{12,}|[?&](?:access_?token|token|secret|password|private_?key)=)/i;

function integrationDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

function inputError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function cleanString(value, field, maxLength = 500) {
  if (value == null) return "";
  if (typeof value !== "string") throw inputError(`${field} 必须是字符串。`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) throw inputError(`${field} 不能超过 ${maxLength} 个字符。`);
  return cleaned;
}

function cleanHttpsUrl(value, field) {
  const cleaned = cleanString(value, field, 1000);
  if (!cleaned) return "";
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "https:") throw new Error("protocol");
  } catch {
    throw inputError(`${field} 必须是 HTTPS URL。`);
  }
  return cleaned;
}

function cleanVerifiedAt(value) {
  const cleaned = cleanString(value, "verifiedAt", 10);
  if (!cleaned) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned) || Number.isNaN(Date.parse(`${cleaned}T00:00:00Z`))) {
    throw inputError("verifiedAt 必须是 YYYY-MM-DD。");
  }
  return cleaned;
}

function normalizeStringList(value, field) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw inputError(`${field} 必须是数组。`);
  if (value.length > 30) throw inputError(`${field} 最多包含 30 项。`);
  return [...new Set(value.map((item, index) => cleanString(item, `${field}[${index}]`, 160)).filter(Boolean))];
}

function normalizeEnvironments(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw inputError("environments 必须是数组。");
  if (value.length > 12) throw inputError("environments 最多包含 12 项。");
  return value.map((environment, index) => {
    if (!environment || typeof environment !== "object" || Array.isArray(environment)) {
      throw inputError(`environments[${index}] 必须是对象。`);
    }
    const unknown = Object.keys(environment).filter(key => !ENVIRONMENT_FIELDS.has(key));
    if (unknown.length) throw inputError(`environments[${index}] 包含不允许的字段：${unknown.join("、")}。`);
    const name = cleanString(environment.name, `environments[${index}].name`, 80);
    if (!name) throw inputError(`environments[${index}].name 不能为空。`);
    return {
      name,
      url: cleanHttpsUrl(environment.url, `environments[${index}].url`),
      notes: cleanString(environment.notes, `environments[${index}].notes`, 300)
    };
  });
}

export function normalizeIntegrationProfile(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw inputError("缺少有效的平台资料。");
  const unknown = Object.keys(input).filter(key => !ALLOWED_FIELDS.has(key));
  if (unknown.length) throw inputError(`平台资料包含不允许的字段：${unknown.join("、")}。`);
  const platformId = cleanString(input.platformId, "platformId", 80).toLowerCase();
  if (!PLATFORM_IDS.has(platformId)) throw inputError(`未知平台 ID：${platformId || "空"}。`);

  const profile = {
    platformId,
    consoleUrl: cleanHttpsUrl(input.consoleUrl, "consoleUrl"),
    accountSubject: cleanString(input.accountSubject, "accountSubject", 160),
    resourceNames: normalizeStringList(input.resourceNames, "resourceNames"),
    environments: normalizeEnvironments(input.environments),
    owner: cleanString(input.owner, "owner", 120),
    permissionGuide: cleanString(input.permissionGuide, "permissionGuide", 1000),
    runbook: cleanString(input.runbook, "runbook", 1000),
    verifiedAt: cleanVerifiedAt(input.verifiedAt)
  };
  if (SENSITIVE_VALUE.test(JSON.stringify(profile))) throw inputError("平台资料疑似包含凭据或敏感参数，请改存到密钥管理系统。");
  return profile;
}

async function ensureTables(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS integration_private_profiles (
    platform_id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`).run();
  await db.prepare(`CREATE TABLE IF NOT EXISTS integration_profile_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    platform_id TEXT NOT NULL,
    action TEXT NOT NULL,
    changed_fields TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    updated_by TEXT NOT NULL
  )`).run();
}

function parseStoredProfile(row) {
  try {
    const payload = JSON.parse(row.payload);
    return {
      platformId: row.platform_id,
      ...payload,
      updatedAt: row.updated_at,
      updatedBy: row.updated_by
    };
  } catch {
    return null;
  }
}

async function readProfiles(db) {
  await ensureTables(db);
  const result = await db.prepare(`SELECT platform_id, payload, updated_at, updated_by
    FROM integration_private_profiles ORDER BY platform_id`).all();
  return (result?.results || []).map(parseStoredProfile).filter(Boolean);
}

async function writeProfile(db, profile, updatedBy) {
  await ensureTables(db);
  const existingRow = await db.prepare(`SELECT platform_id, payload, updated_at, updated_by
    FROM integration_private_profiles WHERE platform_id = ?`).bind(profile.platformId).first();
  const existing = existingRow ? parseStoredProfile(existingRow) : null;
  const payload = Object.fromEntries(PROFILE_FIELDS.map(field => [field, profile[field]]));
  const changedFields = PROFILE_FIELDS
    .filter(field => existing
      ? JSON.stringify(existing[field] ?? null) !== JSON.stringify(payload[field])
      : (Array.isArray(payload[field]) ? payload[field].length > 0 : Boolean(payload[field])))
    .sort();
  const updatedAt = new Date().toISOString();

  await db.prepare(`INSERT INTO integration_private_profiles (platform_id, payload, updated_at, updated_by)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(platform_id) DO UPDATE SET
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`)
    .bind(profile.platformId, JSON.stringify(payload), updatedAt, updatedBy)
    .run();
  await db.prepare(`INSERT INTO integration_profile_audit
    (platform_id, action, changed_fields, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)`)
    .bind(profile.platformId, existing ? "update" : "create", JSON.stringify(changedFields), updatedAt, updatedBy)
    .run();

  return { ...profile, updatedAt, updatedBy };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "PUT"].includes(request.method)) return jsonResponse({ synced: false, message: "Method not allowed" }, 405);
  if (!data.session) return jsonResponse({ synced: false, message: "请先使用钉钉登录。" }, 401);
  if (request.method === "PUT" && (!canManagePermissions(data.session) || data.session.role === "readonly")) {
    return jsonResponse({ synced: false, message: "仅总经办平台管理员可维护内部平台资料。" }, 403);
  }

  const db = integrationDatabase(env);
  if (!db) {
    return jsonResponse({
      synced: false,
      message: "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，内部平台资料暂不可用。"
    }, 501);
  }

  try {
    if (request.method === "GET") {
      const profiles = await readProfiles(db);
      return jsonResponse({ synced: true, profiles });
    }
    const body = await request.json().catch(() => null);
    const profile = normalizeIntegrationProfile(body);
    const updatedBy = cleanString(data.session.name || data.session.userId || "unknown", "updatedBy", 120);
    const saved = await writeProfile(db, profile, updatedBy);
    return jsonResponse({ synced: true, profile: saved });
  } catch (error) {
    return jsonResponse({ synced: false, message: error.message || "内部平台资料同步失败。" }, error.status || 500);
  }
}
