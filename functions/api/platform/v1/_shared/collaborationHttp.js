export class CollaborationHttpError extends Error {
  constructor(status, code, message, details = undefined, retryable = false) {
    super(message);
    this.name = "CollaborationHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: { allow: "GET, POST, PATCH, OPTIONS" } });
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

export function errorResponse(error) {
  const known = error instanceof CollaborationHttpError;
  const status = known ? error.status : 500;
  const code = known ? error.code : "INTERNAL_UNEXPECTED";
  const message = known ? error.message : "协同数据处理失败，请稍后重试。";
  const retryable = known ? error.retryable : true;
  return jsonResponse({
    synced: false,
    message,
    error: {
      code,
      message,
      requestId: requestId(),
      retryable,
      ...(known && error.details ? { details: error.details } : {})
    }
  }, status);
}

export function methodNotAllowed() {
  return errorResponse(new CollaborationHttpError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed"));
}

export function requireSession(data = {}) {
  if (data.session) return data.session;
  throw new CollaborationHttpError(401, "AUTH_SESSION_REQUIRED", "请先使用钉钉登录。");
}

export function requireWritable(session = {}) {
  if (session.role === "readonly" || session.readonly) {
    throw new CollaborationHttpError(403, "PERMISSION_WRITE_DENIED", "当前身份不能执行此操作。");
  }
}

export async function readJson(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new CollaborationHttpError(400, "COLLABORATION_ITEM_INVALID", "请检查协同事项的必填信息。");
  }
  return body;
}
