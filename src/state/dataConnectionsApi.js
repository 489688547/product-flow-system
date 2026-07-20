const DATA_CONNECTIONS_API = "/api/platform/v1/data-connections";

async function requestJson(path = "", options = {}) {
  const response = await fetch(`${DATA_CONNECTIONS_API}${path}`, { credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `数据连接请求失败（HTTP ${response.status}）。`);
    error.code = payload.error?.code || "DATA_CONNECTION_REQUEST_FAILED";
    error.details = payload.error?.details;
    error.retryable = Boolean(payload.error?.retryable);
    throw error;
  }
  return payload;
}

export function loadDataConnections() {
  return requestJson();
}

export async function saveDataConnection({ id = "", loginEmail, password, expectedVersion = 0 }) {
  const body = { loginEmail, password, expectedVersion, ...(id ? { id } : {}) };
  const payload = await requestJson("", {
    method: id ? "PUT" : "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return payload.connection;
}

export async function revealDataConnectionPassword(id) {
  return requestJson(`/${encodeURIComponent(id)}/reveal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}"
  });
}
