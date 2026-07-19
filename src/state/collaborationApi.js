const BASE_URL = "/api/platform/v1/collaboration-items";

export class CollaborationApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "CollaborationApiError";
    this.status = options.status || 0;
    this.code = options.code || "INTERNAL_UNEXPECTED";
    this.details = options.details;
    this.retryable = Boolean(options.retryable);
  }
}

async function payloadFor(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.synced === false) {
    throw new CollaborationApiError(payload.message || fallbackMessage, {
      status: response.status,
      code: payload.error?.code,
      details: payload.error?.details,
      retryable: payload.error?.retryable
    });
  }
  return payload;
}

function queryString(query = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "" || value === false) continue;
    if (Array.isArray(value)) value.filter(Boolean).forEach(entry => params.append(key, String(entry)));
    else params.set(key, String(value));
  }
  const value = params.toString();
  return value ? `?${value}` : "";
}

function jsonOptions(method, body, signal) {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {})
  };
}

export async function listCollaborationItems(query = {}, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}${queryString(query)}`, signal ? { signal } : undefined);
  return payloadFor(response, "协同事项加载失败。");
}

export async function getCollaborationItem(id, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(id)}`, signal ? { signal } : undefined);
  return payloadFor(response, "协同事项加载失败。");
}

export async function createCollaborationItem(input, fetchImpl = fetch, signal) {
  const response = await fetchImpl(BASE_URL, jsonOptions("POST", input, signal));
  return payloadFor(response, "协同事项创建失败。");
}

export async function updateCollaborationItem(id, input, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(id)}`, jsonOptions("PATCH", input, signal));
  return payloadFor(response, "协同事项保存失败。");
}

export async function transitionCollaborationItem(id, input, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(id)}/transitions`, jsonOptions("POST", input, signal));
  return payloadFor(response, "协同状态更新失败。");
}

export async function listCollaborationActivities(id, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(id)}/activities`, signal ? { signal } : undefined);
  return payloadFor(response, "协同活动记录加载失败。");
}

export async function syncCollaborationDingTodo(id, input, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(id)}/dingtalk`, jsonOptions("POST", input, signal));
  return payloadFor(response, "钉钉待办同步失败。");
}
