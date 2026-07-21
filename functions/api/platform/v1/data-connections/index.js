import {
  canManageDataConnections,
  requireDataConnectionActor,
  requireDataConnectionDestroyer,
  requireFreshSession
} from "./_shared/access.js";
import { DataConnectionHttpError, errorResponse, jsonResponse, methodNotAllowed, readJson, requireD1 } from "./_shared/http.js";
import { createDataConnectionStore } from "./_shared/storage.js";

const DESTROY_FIELDS = new Set(["id", "expectedVersion", "confirmation"]);

function requestId(request) {
  return request.headers.get("cf-ray") || globalThis.crypto?.randomUUID?.() || `req-${Date.now().toString(36)}`;
}

function storeFor(context, actor, dependencies) {
  if (dependencies.store) return dependencies.store;
  return createDataConnectionStore(requireD1(context.env), {
    masterKey: context.env.PLATFORM_CREDENTIAL_MASTER_KEY,
    actor,
    requestId: requestId(context.request)
  });
}

export async function handleDataConnectionsRequest(context, dependencies = {}) {
  try {
    if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "GET, DELETE, OPTIONS" } });
    const actor = requireDataConnectionActor(context.data);
    const store = storeFor(context, actor, dependencies);
    if (context.request.method === "GET") {
      return jsonResponse({ synced: true, canManage: canManageDataConnections(actor), connections: await store.list() });
    }
    if (["POST", "PUT"].includes(context.request.method)) {
      throw new DataConnectionHttpError(410, "DATA_CONNECTION_LOGIN_RETIRED", "店铺网页登录已停用，请使用平台原始文件导入。");
    }
    if (context.request.method !== "DELETE") return methodNotAllowed("GET, DELETE, OPTIONS");
    requireDataConnectionDestroyer(actor);
    requireFreshSession(actor);
    const body = await readJson(context.request);
    const unknown = Object.keys(body).filter(key => !DESTROY_FIELDS.has(key));
    if (unknown.length) throw new DataConnectionHttpError(400, "DATA_CONNECTION_FIELDS_INVALID", "销毁请求包含不支持的字段。", { fields: unknown });
    if (body.confirmation !== "销毁店铺凭证") throw new DataConnectionHttpError(400, "DATA_CONNECTION_DESTROY_CONFIRMATION_REQUIRED", "请输入完整确认文案：销毁店铺凭证。");
    const id = String(body.id || "").trim();
    if (!id) throw new DataConnectionHttpError(400, "DATA_CONNECTION_ID_REQUIRED", "缺少数据连接 ID。");
    const connection = await store.destroy({ id, expectedVersion: Number(body.expectedVersion || 0) });
    return jsonResponse({ synced: true, connection });
  } catch (error) {
    if (!error?.code && /邮箱/.test(error?.message || "")) {
      return errorResponse(new DataConnectionHttpError(400, "DATA_CONNECTION_EMAIL_INVALID", error.message));
    }
    return errorResponse(error);
  }
}

export function onRequest(context) {
  return handleDataConnectionsRequest(context);
}
