import { normalizeLoginEmail } from "../../../../../src/domain/dataConnections.js";
import { canManageDataConnections, requireDataConnectionActor, requireDataConnectionManager } from "./_shared/access.js";
import { DataConnectionHttpError, errorResponse, jsonResponse, methodNotAllowed, readJson, requireD1 } from "./_shared/http.js";
import { createDataConnectionStore } from "./_shared/storage.js";

const SAVE_FIELDS = new Set(["id", "loginEmail", "password", "expectedVersion"]);

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
    if (context.request.method === "OPTIONS") return new Response(null, { status: 204, headers: { allow: "GET, POST, PUT, OPTIONS" } });
    const actor = requireDataConnectionActor(context.data);
    const store = storeFor(context, actor, dependencies);
    if (context.request.method === "GET") {
      return jsonResponse({ synced: true, canManage: canManageDataConnections(actor), connections: await store.list() });
    }
    if (!["POST", "PUT"].includes(context.request.method)) return methodNotAllowed("GET, POST, PUT, OPTIONS");
    requireDataConnectionManager(actor);
    const body = await readJson(context.request);
    const unknown = Object.keys(body).filter(key => !SAVE_FIELDS.has(key));
    if (unknown.length) throw new DataConnectionHttpError(400, "DATA_CONNECTION_FIELDS_INVALID", "抖音连接只接受登录邮箱和密码。", { fields: unknown });
    const loginEmail = normalizeLoginEmail(body.loginEmail);
    const password = String(body.password || "");
    if (!password && context.request.method === "POST") throw new DataConnectionHttpError(400, "DATA_CONNECTION_PASSWORD_REQUIRED", "请输入密码。");
    const connection = await store.save({ id: String(body.id || ""), loginEmail, password, expectedVersion: Number(body.expectedVersion || 0) });
    return jsonResponse({ synced: true, connection }, context.request.method === "POST" ? 201 : 200);
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
