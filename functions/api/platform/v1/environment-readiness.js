import { jsonResponse, optionsResponse } from "../../dingtalk/_shared/dingtalk.js";
import { inspectEnvironmentReadiness } from "../_shared/environmentReadiness.js";
import { authorizeProductionAccess } from "../_shared/productionDataAccess.js";

function errorResponse(message, status, code) {
  const requestId = globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({
    ready: false,
    message,
    error: { code, message, requestId, retryable: false }
  }, status);
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, "METHOD_NOT_ALLOWED");
  try {
    if (!data.session) {
      const db = env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB || null;
      const bearer = request.headers.get("authorization") || "";
      if (!db || !/^Bearer\s+/i.test(bearer)) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
      await authorizeProductionAccess(request, db, { capability: "read" });
    }
    return jsonResponse(await inspectEnvironmentReadiness({ env, requestUrl: request.url }));
  } catch (error) {
    return errorResponse(error?.message || "环境状态检查失败。", error?.status || 500, error?.code || "ENVIRONMENT_READINESS_FAILED");
  }
}
