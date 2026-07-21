export class DataConnectionHttpError extends Error {
  constructor(status, code, message, details = undefined, retryable = false) {
    super(message);
    this.name = "DataConnectionHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export function jsonResponse(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...headers
    }
  });
}

export function revealResponse(body) {
  return jsonResponse(body, 200, {
    "cache-control": "no-store, private",
    pragma: "no-cache",
    "x-content-type-options": "nosniff"
  });
}

export function errorResponse(error) {
  const known = Boolean(error?.code && error?.status);
  const status = known ? Number(error.status) : 500;
  const code = known ? String(error.code) : "DATA_CONNECTION_UNEXPECTED";
  const message = known ? String(error.message) : "数据连接处理失败，请稍后重试。";
  return jsonResponse({
    synced: false,
    message,
    error: {
      code,
      message,
      retryable: known ? Boolean(error.retryable) : true,
      ...(known && error.details ? { details: error.details } : {})
    }
  }, status);
}

export async function readJson(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DataConnectionHttpError(400, "DATA_CONNECTION_BODY_INVALID", "请检查提交内容。");
  }
  return body;
}

export function requireD1(env = {}) {
  if (env.PRODUCT_FLOW_DB) return env.PRODUCT_FLOW_DB;
  throw new DataConnectionHttpError(501, "DATA_CONNECTION_STORAGE_UNAVAILABLE", "数据连接数据库尚未配置。", undefined, true);
}

export function methodNotAllowed(methods) {
  return jsonResponse({ synced: false, message: "Method not allowed", error: { code: "DATA_CONNECTION_METHOD_NOT_ALLOWED", message: "Method not allowed", retryable: false } }, 405, { allow: methods });
}
