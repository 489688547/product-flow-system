export class SupplyWorkflowHttpError extends Error {
  constructor(status, code, message, retryable = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

export function workflowError(status, code, message, retryable = false) {
  return new SupplyWorkflowHttpError(status, code, message, retryable);
}

export function requestId() {
  return globalThis.crypto?.randomUUID?.() || `supply-workflow-${Date.now()}-${Math.random().toString(16).slice(2)}`;
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

export function errorResponse(error, id = requestId()) {
  const known = error instanceof SupplyWorkflowHttpError;
  const status = known ? Number(error.status) : 500;
  const code = known ? String(error.code) : "SUPPLY_WORKFLOW_INTERNAL_ERROR";
  return jsonResponse({
    synced: false,
    error: {
      code,
      message: known ? error.message : "供应链工作流暂不可用。",
      requestId: id,
      retryable: Boolean((known && error.retryable) || status >= 500)
    }
  }, status);
}

export function idempotencyKey(request) {
  const value = String(request.headers.get("idempotency-key") || "").trim();
  if (!/^[^\s]{8,160}$/.test(value)) {
    throw workflowError(400, "SUPPLY_WORKFLOW_IDEMPOTENCY_KEY_REQUIRED", "写入操作需要有效的 Idempotency-Key。");
  }
  return value;
}

export async function readJson(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("object required");
    return body;
  } catch {
    throw workflowError(400, "SUPPLY_WORKFLOW_INPUT_INVALID", "请求内容不是有效的 JSON 对象。");
  }
}
