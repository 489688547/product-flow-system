export class GoodsFlowHttpError extends Error {
  constructor(status, code, message, retryable = false, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
    this.details = details;
  }
}

export function goodsFlowError(code, status, message, retryable = false, details = undefined) {
  return new GoodsFlowHttpError(status, code, message, retryable, details);
}

export function requestId() {
  return globalThis.crypto?.randomUUID?.() || `goods-flow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export function optionsResponse() {
  return new Response(null, { status: 204, headers: { allow: "GET, POST, PUT, OPTIONS" } });
}

export function methodNotAllowed() {
  throw goodsFlowError("VALIDATION_METHOD_NOT_ALLOWED", 405, "Method not allowed");
}

export async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("object required");
    return body;
  } catch {
    throw goodsFlowError("VALIDATION_INVALID_JSON", 400, "请求内容不是有效的 JSON 对象。");
  }
}

export function requireIdempotencyKey(request) {
  const value = String(request.headers.get("idempotency-key") || "").trim();
  if (!value) throw goodsFlowError("GOODS_FLOW_IDEMPOTENCY_KEY_REQUIRED", 400, "写入操作需要 Idempotency-Key。");
  return value.slice(0, 160);
}

export function successResponse(data, { status = 200, id = requestId(), updatedAt = new Date().toISOString(), ...meta } = {}) {
  return jsonResponse({ data, meta: { requestId: id, updatedAt, ...meta } }, status);
}

export function errorResponse(error, id = requestId()) {
  const status = Number(error?.status) || 500;
  const message = status >= 500 ? (error?.message || "货流服务暂不可用。") : (error?.message || "请求处理失败。");
  return jsonResponse({
    error: {
      code: error?.code || "GOODS_FLOW_INTERNAL_ERROR",
      message,
      requestId: id,
      retryable: Boolean(error?.retryable || status >= 500),
      ...(error?.details === undefined ? {} : { details: error.details })
    }
  }, status);
}
