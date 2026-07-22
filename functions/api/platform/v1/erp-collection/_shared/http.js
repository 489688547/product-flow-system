export function requestId() {
  return globalThis.crypto?.randomUUID?.() || `erp-collection-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export function successResponse(data, id, status = 200) {
  return jsonResponse({ data, meta: { requestId: id, updatedAt: new Date().toISOString(), version: 1 } }, status);
}

export function errorResponse(error, id) {
  const status = Number(error?.status) || 500;
  return jsonResponse({
    error: {
      code: error?.code || "ERP_COLLECTION_INTERNAL_ERROR",
      message: error?.message || "ERP 数据导入暂不可用。",
      requestId: id,
      retryable: Boolean(error?.retryable || status >= 500),
      ...(error?.details === undefined ? {} : { details: error.details })
    }
  }, status);
}

export function routeError(status, code, message, retryable = false) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.retryable = retryable;
  return error;
}
