import { reduceHrManagementState } from "../../src/domain/hrManagement.js";
import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { canApplyHrAction, canReadHr, filterHrStateForScope, readHrScope } from "./hr-management/_shared/permissions.js";
import { hrDatabase, readHrManagementState, writeHrManagementState } from "./hr-management/_shared/storage.js";

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

function errorResponse(message, status, code, retryable = false, extra = {}) {
  return jsonResponse({ synced: false, message, ...extra, error: { code, message, requestId: requestId(), retryable } }, status);
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  const session = data.session;
  if (!session) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
  const resource = new URL(request.url).searchParams.get("resource") || "bootstrap";
  if (resource !== "bootstrap") return errorResponse("当前阶段不提供该人事资源。", 404, "HR_RESOURCE_NOT_FOUND");
  const db = hrDatabase(env, data);
  if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，人事共享数据暂不可用。", 501, "HR_STORAGE_UNAVAILABLE", true);

  try {
    const state = await readHrManagementState(db);
    const scope = readHrScope(session, state);
    if (!canReadHr(scope)) return errorResponse("当前账号不在人事管理访问范围。", 403, "HR_READ_DENIED");
    if (request.method === "GET") {
      return jsonResponse({ synced: true, version: state.version, scope, state: filterHrStateForScope(state, scope), meta: { sourceMode: state.sourceMode, updatedAt: state.updatedAt } });
    }
    if (session.role === "readonly") return errorResponse("只读账号不能修改人事数据。", 403, "HR_WRITE_DENIED");
    const body = await request.json().catch(() => null);
    if (!body || !Number.isInteger(body.version) || !body.action || typeof body.action !== "object") {
      return errorResponse("缺少有效版本或人事动作。", 400, "HR_ACTION_INVALID");
    }
    if (body.version !== state.version) return errorResponse("人事数据已被其他同事更新，请刷新后重试。", 409, "HR_VERSION_CONFLICT", true, { version: state.version });
    const permission = canApplyHrAction(scope, body.action);
    if (!permission.allowed) return errorResponse(permission.message, 403, permission.code);
    const actor = String(session.name || session.userId || "unknown").slice(0, 120);
    const next = reduceHrManagementState(state, { ...body.action, actor, now: new Date().toISOString() });
    const saved = await writeHrManagementState(db, next, actor);
    return jsonResponse({ synced: true, version: saved.version, scope, state: filterHrStateForScope(saved.state, scope), meta: { sourceMode: "shared", updatedAt: saved.updatedAt } });
  } catch (error) {
    return errorResponse(error.message || "人事数据读取失败。", error.status || 500, error.code || "HR_STATE_CORRUPT", true);
  }
}
