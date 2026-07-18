import { jsonResponse, optionsResponse } from "../../dingtalk/_shared/dingtalk.js";
import { inspectEnvironmentReadiness } from "../_shared/environmentReadiness.js";

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
  if (!data.session) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
  try {
    return jsonResponse(await inspectEnvironmentReadiness({ env, requestUrl: request.url }));
  } catch (error) {
    return errorResponse(error?.message || "环境状态检查失败。", 500, "ENVIRONMENT_READINESS_FAILED");
  }
}
