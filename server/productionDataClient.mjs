function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function clientError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function readResponse(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.synced === false && response.status >= 400) {
    throw clientError(payload.message || fallback || `生产数据请求失败（HTTP ${response.status}）。`, response.status, payload.error?.code || "PRODUCTION_DATA_REQUEST_FAILED");
  }
  return payload;
}

export function createProductionDataClient({ apiUrl = "", accessToken = "", fetchImpl = fetch } = {}) {
  const baseUrl = normalizeBaseUrl(apiUrl);
  const token = String(accessToken || "").trim();
  let unlockToken = "";
  let unlockState = { expiresAt: "", reason: "" };
  let baseUpdatedAt = "";
  const configured = Boolean(baseUrl && token);

  function authorizationHeaders(extra = {}) {
    return { authorization: `Bearer ${token}`, ...extra };
  }

  function currentStatus() {
    const active = Boolean(unlockToken && Date.parse(unlockState.expiresAt) > Date.now());
    if (!active) {
      unlockToken = "";
      unlockState = { expiresAt: "", reason: "" };
    }
    return { configured, unlocked: active, expiresAt: unlockState.expiresAt, reason: unlockState.reason };
  }

  async function request(path, options = {}) {
    if (!configured) throw clientError("本地尚未配置生产数据个人令牌。", 501, "PRODUCTION_DATA_NOT_CONFIGURED");
    return fetchImpl(`${baseUrl}${path}`, options);
  }

  return {
    configured,
    status: currentStatus,
    async readState() {
      const response = await request("/api/platform/v1/production-data/state", { headers: authorizationHeaders() });
      const payload = await readResponse(response, "生产公司状态读取失败。");
      baseUpdatedAt = payload.updatedAt || "";
      return payload;
    },
    async writeState(input = {}) {
      if (!currentStatus().unlocked) throw clientError("生产写入尚未解锁。", 423, "PRODUCTION_WRITE_LOCKED");
      const response = await request("/api/platform/v1/production-data/state", {
        method: "POST",
        headers: authorizationHeaders({ "content-type": "application/json", "x-pfs-production-unlock": unlockToken }),
        body: JSON.stringify({ ...input, baseUpdatedAt })
      });
      const payload = await readResponse(response, "生产公司状态写入失败。");
      baseUpdatedAt = payload.updatedAt || baseUpdatedAt;
      return payload;
    },
    async rollback(auditId, confirmation) {
      if (!currentStatus().unlocked) throw clientError("生产写入尚未解锁。", 423, "PRODUCTION_WRITE_LOCKED");
      const response = await request("/api/platform/v1/production-data/state", {
        method: "POST",
        headers: authorizationHeaders({ "content-type": "application/json", "x-pfs-production-unlock": unlockToken }),
        body: JSON.stringify({ action: "rollback", auditId, confirmation })
      });
      const payload = await readResponse(response, "生产数据回滚失败。");
      baseUpdatedAt = payload.updatedAt || baseUpdatedAt;
      return payload;
    },
    async unlock(input) {
      const response = await request("/api/platform/v1/production-write-session", {
        method: "POST",
        headers: authorizationHeaders({ "content-type": "application/json" }),
        body: JSON.stringify(input || {})
      });
      const payload = await readResponse(response, "生产写入解锁失败。");
      unlockToken = payload.unlockToken || "";
      unlockState = { expiresAt: payload.expiresAt || "", reason: payload.reason || "" };
      return { allowed: Boolean(payload.allowed), ...currentStatus() };
    },
    async lock() {
      if (configured) {
        const response = await request("/api/platform/v1/production-write-session", {
          method: "DELETE",
          headers: authorizationHeaders()
        });
        await readResponse(response, "生产写入锁定失败。");
      }
      unlockToken = "";
      unlockState = { expiresAt: "", reason: "" };
      return currentStatus();
    },
    async readiness() {
      const response = await request("/api/platform/v1/environment-readiness", { headers: authorizationHeaders() });
      return readResponse(response, "生产环境状态读取失败。");
    }
  };
}
