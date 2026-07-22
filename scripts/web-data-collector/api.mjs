import { nodeRequest } from "../kuaimai-erp-collector/http.mjs";

function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:8132").trim().replace(/\/+$/, "");
}

export function createWebCollectionApi({ baseUrl, token, fetchImpl = nodeRequest }) {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/api/platform/v1/web-collection/jobs`;
  const runnerToken = String(token || "").trim();
  if (!/^wdc_[a-f0-9]{48}$/i.test(runnerToken)) throw new Error("网页采集 runner token 格式无效。");

  async function action(body) {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${runnerToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(body)
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `网页采集控制面请求失败（HTTP ${response.status}）。`);
      error.code = payload?.error?.code || "WEB_COLLECTION_API_FAILED";
      error.status = response.status;
      error.retryable = Boolean(payload?.error?.retryable);
      throw error;
    }
    return payload.data || payload;
  }

  return Object.freeze({
    heartbeat: input => action({ action: "heartbeat", ...input }),
    ensurePlan: jobs => action({ action: "ensure_plan", jobs }),
    claim: (leaseSeconds = 300) => action({ action: "claim", leaseSeconds }),
    transition: input => action({ action: "transition", ...input }),
    complete: input => action({ action: "complete", ...input }),
    recordNotification: input => action({ action: "record_notification", ...input })
  });
}
