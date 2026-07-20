import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { normalizeDataCenterState } from "../../src/domain/dataCenter.js";
import { canAccessCompanyPlatform } from "../../src/domain/permissions.js";
import { dataCenterDatabase, readDataCenterState, writeDataCenterState } from "./data-center/_shared/storage.js";

const VIEW_DEPARTMENTS = new Set(["总经办", "运营部", "财务部", "产品部", "供应链部", "供应链", "供应链团队", "采购部"]);
const EDIT_DEPARTMENTS = new Set(["总经办", "运营部"]);

function department(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

function isExecutive(session = {}) {
  return session.role === "executive" || department(session).split("/").map(value => value.trim()).includes("总经办");
}

function errorResponse(message, status, code, retryable = false) {
  const requestId = globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({ synced: false, message, error: { code, message, requestId, retryable } }, status);
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  const session = data.session;
  if (!session) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
  if (!isExecutive(session) && !VIEW_DEPARTMENTS.has(department(session))) return errorResponse("当前部门无权访问数据中心。", 403, "PERMISSION_VIEW_DENIED");
  if (request.method === "POST" && (session.role === "readonly" || (!isExecutive(session) && !EDIT_DEPARTMENTS.has(department(session))))) {
    return errorResponse("仅总经办和运营部可维护数据中心元数据。", 403, "PERMISSION_WRITE_DENIED");
  }
  const db = dataCenterDatabase(env);
  if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，数据中心元数据暂不可用。", 501, "DATA_STORAGE_UNAVAILABLE");

  try {
    const stored = await readDataCenterState(db);
    if (request.method === "GET") return jsonResponse({ synced: Boolean(stored.updatedAt), ...stored });
    const body = await request.json().catch(() => null);
    if (!body?.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      return errorResponse("缺少有效的数据中心元数据。", 400, "DATA_STATE_INVALID");
    }
    const normalized = normalizeDataCenterState(body.state);
    const governed = canAccessCompanyPlatform(session) ? normalized : {
      ...normalized,
      aiProviders: stored.state.aiProviders,
      aiDataPolicies: stored.state.aiDataPolicies
    };
    const saved = await writeDataCenterState(db, governed, String(session.name || session.userId || "unknown").slice(0, 120));
    return jsonResponse({ synced: true, ...saved });
  } catch (error) {
    return errorResponse(error.message || "数据中心元数据同步失败。", error.status || 500, "INTERNAL_UNEXPECTED", true);
  }
}
