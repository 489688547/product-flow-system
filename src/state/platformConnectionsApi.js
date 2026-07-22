const PLATFORM_CONNECTIONS_API = "/api/platform/v1/platform-connections";

async function requestJson(options = {}, path = "") {
  const response = await fetch(`${PLATFORM_CONNECTIONS_API}${path}`, { credentials: "include", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `平台连接请求失败（HTTP ${response.status}）。`);
    error.code = payload.error?.code || "PLATFORM_CONNECTION_REQUEST_FAILED";
    error.requestId = payload.error?.requestId || "";
    error.retryable = Boolean(payload.error?.retryable);
    throw error;
  }
  return payload;
}

export async function loadPlatformConnections() {
  return requestJson();
}

export async function savePlatformConnection({ platformId, expectedVersion, fields }) {
  const payload = await requestJson({
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platformId, expectedVersion, fields })
  });
  return payload.connection;
}

export async function disablePlatformConnection({ platformId, expectedVersion }) {
  const payload = await requestJson({
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ platformId, expectedVersion })
  });
  return payload.connection;
}

export async function revealPlatformConnection({ platformId, purpose, confirmation, signal }) {
  return requestJson({
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ purpose, confirmation }),
    signal
  }, `/${encodeURIComponent(platformId)}/reveal`);
}
