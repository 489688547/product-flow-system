import { canManagePermissions } from "../../../src/domain/permissions.js";
import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import {
  archiveConnectorRecord,
  connectorDatabase,
  destroyConnectorRecord,
  listConnectorRecords,
  upsertConnectorRecord,
  upsertVaultItemRecord
} from "./_shared/connectorStorage.js";

const VIEW_DEPARTMENTS = new Set(["总经办", "运营部", "财务部", "产品部", "供应链部", "供应链", "供应链团队", "采购部"]);
const BODY_FIELDS = new Set(["expectedVersion", "instance", "vaultItem", "action", "id", "confirmation"]);

function department(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

function routeError(message, code, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function errorResponse(error) {
  const status = Number(error?.status || 500);
  const message = status >= 500 && !error?.code ? "连接器服务暂不可用。" : String(error?.message || "连接器操作失败。");
  const requestId = crypto.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({ synced: false, message, error: { code: error?.code || "INTERNAL_UNEXPECTED", message, requestId, retryable: status >= 500 } }, status);
}

function assertBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw routeError("缺少有效的连接配置。", "DATA_CONNECTOR_INVALID", 400);
  const unknown = Object.keys(body).filter(key => !BODY_FIELDS.has(key));
  if (unknown.length) throw routeError(`连接器请求包含不允许的字段：${unknown.join("、")}。`, "DATA_CONNECTOR_INVALID", 400);
}

function canEditConnectors(session) {
  return session?.role !== "readonly" && (canManagePermissions(session) || department(session) === "运营部");
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "PUT"].includes(request.method)) return errorResponse(routeError("Method not allowed", "VALIDATION_METHOD_NOT_ALLOWED", 405));
  try {
    const session = data.session;
    if (!session) throw routeError("请先使用钉钉登录。", "AUTH_SESSION_REQUIRED", 401);
    if (!VIEW_DEPARTMENTS.has(department(session)) && !canManagePermissions(session)) {
      throw routeError("当前部门无权访问数据中心连接器。", "PERMISSION_VIEW_DENIED", 403);
    }
    const db = connectorDatabase(env);
    if (!db) throw routeError("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，连接器暂不可用。", "DATA_STORAGE_UNAVAILABLE", 501);
    const admin = session.role !== "readonly" && canManagePermissions(session);
    if (request.method === "GET") {
      const records = await listConnectorRecords(db, { includeVaultItems: admin });
      return jsonResponse({ synced: true, ...records });
    }
    if (!canEditConnectors(session)) throw routeError("当前身份不能维护数据中心连接器。", "PERMISSION_WRITE_DENIED", 403);
    const body = await request.json().catch(() => null);
    assertBody(body);
    const context = {
      expectedVersion: body.expectedVersion,
      actor: String(session.name || session.userId || "unknown"),
      actorId: String(session.userId || "unknown"),
      requestId: request.headers.get("cf-ray") || crypto.randomUUID?.() || ""
    };
    if (body.action === "destroy") {
      if (!admin) throw routeError("仅总经办平台管理员可以销毁店铺凭证。", "PERMISSION_WRITE_DENIED", 403);
      if (body.confirmation !== "销毁店铺凭证") throw routeError("请输入完整确认文案：销毁店铺凭证。", "DATA_CONNECTOR_DESTROY_CONFIRMATION_REQUIRED", 400);
      if (!body.id) throw routeError("缺少连接实例 ID。", "DATA_CONNECTOR_INVALID", 400);
      const instance = await destroyConnectorRecord(db, String(body.id), body, context);
      return jsonResponse({ synced: true, instance });
    }
    if (body.action === "archive") {
      if (!admin) throw routeError("仅总经办平台管理员可以归档连接器。", "PERMISSION_WRITE_DENIED", 403);
      if (!body.id) throw routeError("缺少连接实例 ID。", "DATA_CONNECTOR_INVALID", 400);
      const instance = await archiveConnectorRecord(db, String(body.id), body, context);
      return jsonResponse({ synced: true, instance });
    }
    if (body.vaultItem) {
      if (!admin) throw routeError("仅总经办平台管理员可以维护内部系统保险箱。", "PERMISSION_WRITE_DENIED", 403);
      const vaultItem = await upsertVaultItemRecord(db, body.vaultItem, context);
      return jsonResponse({ synced: true, vaultItem });
    }
    if (!body.instance) throw routeError("缺少连接实例。", "DATA_CONNECTOR_INVALID", 400);
    const instance = await upsertConnectorRecord(db, body.instance, context);
    return jsonResponse({ synced: true, instance });
  } catch (error) {
    return errorResponse(error);
  }
}
