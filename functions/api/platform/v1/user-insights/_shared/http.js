export class UserInsightHttpError extends Error {
  constructor(status, code, message, details = undefined, retryable = false) {
    super(message);
    this.name = "UserInsightHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export function optionsResponse(methods = "GET, POST, PATCH, OPTIONS") {
  return new Response(null, { status: 204, headers: { allow: methods } });
}

export function methodNotAllowed() {
  return errorResponse(new UserInsightHttpError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed"));
}

export function errorResponse(error) {
  const known = error instanceof UserInsightHttpError;
  const status = known ? error.status : 500;
  const code = known ? error.code : "USER_INSIGHTS_UNEXPECTED";
  const message = known ? error.message : "用户洞察处理失败，请稍后重试。";
  return jsonResponse({
    synced: false,
    message,
    error: {
      code,
      message,
      retryable: known ? error.retryable : true,
      ...(known && error.details ? { details: error.details } : {})
    }
  }, status);
}

export async function readJson(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new UserInsightHttpError(400, "VALIDATION_BODY_INVALID", "请检查提交内容。");
  }
  return body;
}

export function requireD1(env = {}, data = {}) {
  const db = requestBusinessDatabase({ env, data });
  if (db) return db;
  throw new UserInsightHttpError(501, "STORAGE_D1_UNAVAILABLE", "用户洞察数据库尚未配置。", undefined, true);
}
import { requestBusinessDatabase } from "../../../_shared/dataEnvironment.js";
