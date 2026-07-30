import { nodeRequest } from "../kuaimai-erp-collector/http.mjs";
import { verifyCollectorExecutionBundle } from "../../src/domain/collectorTemplates.js";

const EXPERIMENTAL_ORIGINS = Object.freeze({
  kuaimai: Object.freeze(["https://erp.superboss.cc"]),
  "douyin-ecommerce": Object.freeze(["https://compass.jinritemai.com"]),
  qianchuan: Object.freeze(["https://qianchuan.jinritemai.com"])
});

async function sha256(value) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value))
  );
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:8132").trim().replace(/\/+$/, "");
}

export function createWebCollectionApi({ baseUrl, token, fetchImpl = nodeRequest }) {
  const endpoint = `${normalizeBaseUrl(baseUrl)}/api/platform/v1/web-collection/jobs`;
  const runsEndpoint = `${normalizeBaseUrl(baseUrl)}/api/platform/v1/web-collection/runs`;
  const runnerToken = String(token || "").trim();
  if (!/^wdc_[a-f0-9]{48}$/i.test(runnerToken)) throw new Error("网页采集 runner token 格式无效。");
  const verificationKey = sha256(runnerToken);

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

  async function runRequest(path = "", { method = "GET", body, idempotencyKey } = {}) {
    const response = await fetchImpl(`${runsEndpoint}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${runnerToken}`,
        ...(body ? { "content-type": "application/json" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `实验采集控制面请求失败（HTTP ${response.status}）。`);
      error.code = payload?.error?.code || "COLLECTOR_RUN_API_FAILED";
      error.status = response.status;
      error.retryable = Boolean(payload?.error?.retryable);
      throw error;
    }
    return payload.data || payload;
  }

  async function assignedExperimentalRuns() {
    const assigned = await runRequest();
    const runs = Array.isArray(assigned?.runs) ? assigned.runs : [];
    return {
      ...assigned,
      runs: await Promise.all(runs.map(async item => {
        const bundle = item?.executionBundle;
        const allowedOrigins = EXPERIMENTAL_ORIGINS[bundle?.template?.providerId];
        if (!allowedOrigins) {
          const error = new Error("实验采集执行包 Provider 未登记。");
          error.code = "COLLECTOR_TEMPLATE_PROVIDER_NOT_REGISTERED";
          throw error;
        }
        return {
          ...item,
          executionBundle: await verifyCollectorExecutionBundle(bundle, {
            runnerId: bundle.runnerId,
            verificationKey: await verificationKey,
            allowedOrigins
          })
        };
      }))
    };
  }

  return Object.freeze({
    heartbeat: input => action({ action: "heartbeat", ...input }),
    assignedStores: () => action({ action: "assigned_stores" }),
    registerStore: input => action({ action: "register_store", ...input }),
    ensurePlan: jobs => action({ action: "ensure_plan", jobs }),
    ensureRegisteredPlan: () => action({ action: "ensure_registered_plan" }),
    claim: (leaseSeconds = 300, input = {}) => action({
      action: "claim",
      leaseSeconds,
      ...(input.storeId ? { storeId: input.storeId } : {})
    }),
    transition: input => action({ action: "transition", ...input }),
    complete: input => action({ action: "complete", ...input }),
    recordNotification: input => action({ action: "record_notification", ...input }),
    assignedExperimentalRuns,
    experimentalRunAction: (runId, input, idempotencyKey) => runRequest(
      `/${encodeURIComponent(runId)}/actions`,
      { method: "POST", body: input, idempotencyKey }
    )
  });
}
