async function requestJson(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || `环境状态请求失败（HTTP ${response.status}）。`);
    error.code = payload.error?.code || "ENVIRONMENT_REQUEST_FAILED";
    throw error;
  }
  return payload;
}

export function loadEnvironmentReadiness() {
  return requestJson("/api/platform/v1/environment-readiness");
}

export function unlockProductionWrite({ reason, confirmation }) {
  return requestJson("/api/platform/v1/production-write-session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ reason, confirmation })
  });
}

export function lockProductionWrite() {
  return requestJson("/api/platform/v1/production-write-session", { method: "DELETE" });
}

export function rollbackProductionData({ auditId, confirmation }) {
  return requestJson("/api/platform/v1/production-data/rollback", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ auditId, confirmation })
  });
}
