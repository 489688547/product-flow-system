export class BacklogHttpError extends Error {
  constructor(status, code, message, details = undefined, retryable = false) {
    super(message);
    this.name = "BacklogHttpError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
  }
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "private, no-store"
    }
  });
}

export function optionsResponse() {
  return new Response(null, {
    status: 204,
    headers: { allow: "GET, POST, PATCH, OPTIONS" }
  });
}

export function methodNotAllowed() {
  return errorResponse(new BacklogHttpError(405, "VALIDATION_METHOD_NOT_ALLOWED", "Method not allowed"));
}

export function errorResponse(error, fallbackCode = "BACKLOG_QUERY_FAILED") {
  const known = error instanceof BacklogHttpError || String(error?.code || "").startsWith("BACKLOG_")
    || String(error?.code || "").startsWith("AI_");
  const status = known ? Number(error.status) || 500 : 500;
  const code = known ? error.code : fallbackCode;
  const fallbackMessage = fallbackCode === "BACKLOG_WRITE_FAILED"
    ? "研发待办保存失败，请稍后重试。"
    : "研发待办加载失败，请稍后重试。";
  const message = known ? error.message : fallbackMessage;
  return jsonResponse({
    synced: false,
    message,
    error: {
      code,
      message,
      requestId: requestId(),
      retryable: known ? Boolean(error.retryable) : true,
      ...(known && error.details ? { details: error.details } : {})
    }
  }, status);
}

export function requireSession(data = {}) {
  if (data.session) return data.session;
  throw new BacklogHttpError(401, "AUTH_SESSION_REQUIRED", "请先使用钉钉登录。");
}

export async function readJson(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new BacklogHttpError(400, "BACKLOG_INPUT_INVALID", "请检查研发待办输入。");
  }
  return body;
}

export function requireExpectedVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 1) {
    throw new BacklogHttpError(400, "BACKLOG_INPUT_INVALID", "缺少有效的事项版本。");
  }
  return version;
}
