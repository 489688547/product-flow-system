const STABLE_CODES = new Set([
  "AUTH_SESSION_REQUIRED",
  "PERMISSION_VIEW_DENIED",
  "PERMISSION_WRITE_DENIED",
  "DATA_STANDARD_INVALID",
  "DATA_STANDARD_FIELD_UNKNOWN",
  "DATA_STANDARD_CYCLE",
  "DATA_STANDARD_UNIT_MISMATCH",
  "DATA_STANDARD_VERSION_CONFLICT",
  "DATA_STANDARD_EFFECTIVE_DATE_CONFLICT",
  "DATA_STANDARD_DEPENDENCY_ARCHIVED",
  "DATA_STANDARD_QUERY_RANGE_INVALID",
  "DATA_STANDARD_CALCULATION_FAILED",
  "DATA_STANDARD_STORAGE_UNAVAILABLE",
  "INTERNAL_UNEXPECTED"
]);

export class DataStandardsHttpError extends Error {
  constructor(status, code, message, details = undefined, retryable = false) {
    super(message);
    this.name = "DataStandardsHttpError";
    this.status = status;
    this.code = STABLE_CODES.has(code) ? code : "INTERNAL_UNEXPECTED";
    this.details = details;
    this.retryable = retryable;
  }
}

function createRequestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

export function jsonResponse(body, status = 200, requestId = createRequestId()) {
  return new Response(JSON.stringify({ ...body, requestId, retryable: false }), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function optionsResponse(methods) {
  return new Response(null, {
    status: 204,
    headers: { allow: methods.join(", "), "cache-control": "no-store" }
  });
}

function normalizeError(error) {
  if (error instanceof DataStandardsHttpError) return error;
  if (error?.code === "DATA_STANDARD_METRIC_CODE_CONFLICT") {
    return new DataStandardsHttpError(409, "DATA_STANDARD_VERSION_CONFLICT", "metricCode 已存在，请使用新的稳定代码。");
  }
  if (STABLE_CODES.has(error?.code)) {
    return new DataStandardsHttpError(
      Number(error.status || (error.code === "DATA_STANDARD_EFFECTIVE_DATE_CONFLICT" || error.code === "DATA_STANDARD_VERSION_CONFLICT" ? 409 : 400)),
      error.code,
      String(error.message || "数据口径请求不符合契约。"),
      error.details,
      Boolean(error.retryable)
    );
  }
  return new DataStandardsHttpError(500, "INTERNAL_UNEXPECTED", "数据口径处理失败，请稍后重试。", undefined, true);
}

export function errorResponse(error) {
  const normalized = normalizeError(error);
  const requestId = createRequestId();
  return new Response(JSON.stringify({
    synced: false,
    message: normalized.message,
    requestId,
    retryable: normalized.retryable,
    error: {
      code: normalized.code,
      message: normalized.message,
      requestId,
      retryable: normalized.retryable,
      ...(normalized.details ? { details: normalized.details } : {})
    }
  }), {
    status: normalized.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

export function methodNotAllowed() {
  return errorResponse(new DataStandardsHttpError(405, "DATA_STANDARD_INVALID", "Method not allowed"));
}

export function requireSession(data = {}) {
  if (data.session) return data.session;
  throw new DataStandardsHttpError(401, "AUTH_SESSION_REQUIRED", "请先使用钉钉登录。");
}

export async function readJson(request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new DataStandardsHttpError(400, "DATA_STANDARD_INVALID", "请检查数据口径请求体。");
  }
  return body;
}

export function requireDatabase(database) {
  if (database) return database;
  throw new DataStandardsHttpError(501, "DATA_STANDARD_STORAGE_UNAVAILABLE", "共享数据口径存储暂不可用。", undefined, true);
}
