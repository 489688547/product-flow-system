import { createEmptyBrandContentState, normalizeBrandContentState, reduceBrandContentState } from "../../src/domain/brandContent.js";
import { canAccessCompanyPlatform } from "../../src/domain/permissions.js";
import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { ensureBrandContentTable, readBrandContentState } from "./brand-content/_shared/storage.js";

const ACTION_TYPES = new Set([
  "create_content",
  "transition_content",
  "upsert_asset",
  "upsert_publication",
  "confirm_decision",
  "update_settings"
]);

const LEAD_ACTIONS = new Set(["create_content", "confirm_decision", "update_settings"]);

function brandDatabase(env = {}) {
  return env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

function errorResponse(message, status, code, extra = {}, retryable = false) {
  const id = requestId();
  return jsonResponse({
    synced: false,
    message,
    ...extra,
    error: { code, message, requestId: id, retryable }
  }, status);
}

function inputError(message, code = "BRAND_CONTENT_ACTION_INVALID") {
  const error = new Error(message);
  error.status = 400;
  error.code = code;
  return error;
}

function sessionDepartments(session = {}) {
  return [...new Set([session.department, ...(session.departments || []), ...(session.departmentNames || [])]
    .flatMap(value => String(value || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(value => value.trim())
    .filter(Boolean))];
}

function isBrandWriter(session = {}) {
  if (canAccessCompanyPlatform(session)) return true;
  const departments = sessionDepartments(session);
  const title = String(session.title || "");
  return departments.some(department => ["品牌", "品牌部", "运营", "运营部"].includes(department))
    || /品牌|编导|剪辑|运营/.test(title);
}

function isBrandLead(session = {}) {
  if (canAccessCompanyPlatform(session)) return true;
  return /品牌负责人|品牌总监|运营总监/.test(String(session.title || ""));
}

function contentForAction(state, action) {
  if (action.type === "transition_content") return state.contents.find(content => content.id === action.id) || null;
  if (action.type === "upsert_asset") {
    const contentId = action.record?.contentId || state.assetVersions.find(asset => asset.id === action.record?.id)?.contentId;
    return state.contents.find(content => content.id === contentId) || null;
  }
  if (action.type === "upsert_publication") {
    const contentId = action.record?.contentId || state.publications.find(publication => publication.id === action.record?.id)?.contentId;
    return state.contents.find(content => content.id === contentId) || null;
  }
  return null;
}

function isAssigned(session, content, roles) {
  const userId = String(session.userId || "");
  const name = String(session.name || "");
  return roles.some(role => String(content?.[`${role}Id`] || "") === userId || String(content?.[`${role}Name`] || "") === name);
}

function canApplyAction(session, action, state) {
  if (!isBrandWriter(session)) return { allowed: false, code: "BRAND_CONTENT_WRITE_DENIED", message: "当前账号不在品牌内容协同的可写范围。" };
  if (LEAD_ACTIONS.has(action.type) && !isBrandLead(session)) {
    return { allowed: false, code: "BRAND_CONTENT_ACTION_DENIED", message: "该操作需要品牌内容负责人或总经办权限。" };
  }
  if (action.type === "upsert_asset" && !isBrandLead(session) && !/剪辑/.test(String(session.title || ""))) {
    return { allowed: false, code: "BRAND_CONTENT_ACTION_DENIED", message: "只有剪辑或品牌内容负责人可以登记素材版本。" };
  }
  if (action.type === "upsert_publication" && !isBrandLead(session) && !/运营/.test(String(session.title || ""))) {
    return { allowed: false, code: "BRAND_CONTENT_ACTION_DENIED", message: "只有运营或品牌内容负责人可以维护发布记录。" };
  }
  if (!isBrandLead(session)) {
    const content = contentForAction(state, action);
    const roles = action.type === "upsert_asset" ? ["editor"] : action.type === "upsert_publication" ? ["operator"] : ["director", "editor", "operator"];
    if (["transition_content", "upsert_asset", "upsert_publication"].includes(action.type) && !isAssigned(session, content, roles)) {
      return { allowed: false, code: "BRAND_CONTENT_SCOPE_DENIED", message: "只能修改自己负责的品牌内容记录。" };
    }
  }
  return { allowed: true };
}

async function writeStoredState(db, state, version, updatedBy) {
  await ensureBrandContentTable(db);
  const updatedAt = new Date().toISOString();
  const payload = JSON.stringify({ ...state, version });
  await db.prepare(`INSERT INTO brand_content_state (id, version, payload, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      version = excluded.version,
      payload = excluded.payload,
      updated_at = excluded.updated_at,
      updated_by = excluded.updated_by`)
    .bind("company", version, payload, updatedAt, updatedBy)
    .run();
  return { state: { ...state, version }, version, updatedAt, updatedBy };
}

function normalizeVersion(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw inputError("version 必须是大于等于 0 的整数。", "BRAND_CONTENT_VERSION_INVALID");
  return number;
}

function normalizeAction(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw inputError("缺少有效的品牌内容动作。");
  const type = String(value.type || "");
  if (!ACTION_TYPES.has(type)) throw inputError(`未知品牌内容动作：${type || "空"}。`);
  return { ...value, type };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  const session = data.session;
  if (!session) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
  if (request.method === "POST" && session.role === "readonly") {
    return errorResponse("只读账号不能修改品牌内容数据。", 403, "BRAND_CONTENT_WRITE_DENIED");
  }
  const db = brandDatabase(env);
  if (!db) {
    return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，品牌内容共享数据暂不可用。", 501, "BRAND_CONTENT_STORAGE_UNAVAILABLE", {}, true);
  }

  try {
    const stored = await readBrandContentState(db);
    if (request.method === "GET") {
      return jsonResponse(stored ? { synced: true, ...stored } : { synced: false, state: null, version: 0, updatedAt: "", updatedBy: "" });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) throw inputError("请求体必须是 JSON 对象。");
    const expectedVersion = normalizeVersion(body.version);
    const action = normalizeAction(body.action);
    const currentState = stored?.state || createEmptyBrandContentState();
    const permission = canApplyAction(session, action, currentState);
    if (!permission.allowed) return errorResponse(permission.message, 403, permission.code);

    const currentVersion = stored?.version || 0;
    if (expectedVersion !== currentVersion) {
      return errorResponse("品牌内容数据已被其他同事更新，请刷新后重试。", 409, "BRAND_CONTENT_VERSION_CONFLICT", { version: currentVersion }, true);
    }
    const actor = String(session.name || session.userId || "unknown").slice(0, 120);
    const nextState = reduceBrandContentState(currentState, { ...action, actor, now: new Date().toISOString() });
    const saved = await writeStoredState(db, nextState, currentVersion + 1, actor);
    return jsonResponse({ synced: true, ...saved });
  } catch (error) {
    const status = error.status || 500;
    return errorResponse(
      error.message?.trim() || "品牌内容数据同步失败。",
      status,
      error.code || (status === 400 ? "BRAND_CONTENT_ACTION_INVALID" : "INTERNAL_UNEXPECTED"),
      {},
      status >= 500
    );
  }
}
