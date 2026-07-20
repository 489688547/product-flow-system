export class DataConnectionAgentApi {
  constructor(baseUrl, token, fetchImpl = fetch) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.token = String(token || "");
    this.fetch = fetchImpl;
  }

  async request(path, options = {}, token = this.token) {
    const response = await this.fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: { authorization: `Bearer ${token}`, ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || `采集服务请求失败（HTTP ${response.status}）。`);
    return payload;
  }

  async tasks() {
    return (await this.request("/api/platform/v1/browser-agent/tasks")).tasks || [];
  }

  async credential(taskId, grant) {
    return this.request(`/api/platform/v1/browser-agent/tasks/${encodeURIComponent(taskId)}/credential`, { method: "POST" }, grant);
  }

  async result(taskId, payload) {
    return this.request(`/api/platform/v1/browser-agent/tasks/${encodeURIComponent(taskId)}/result`, { method: "POST", body: JSON.stringify(payload) });
  }
}
