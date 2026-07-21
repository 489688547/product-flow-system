const BASE = "/api/platform/v1/user-insights";

function paramsFor(scope = {}) {
  const params = new URLSearchParams();
  for (const key of ["viewType", "platform", "shopId", "productId", "skuId", "categoryId", "from", "to"]) {
    if (scope[key]) params.set(key, String(scope[key]));
  }
  return params;
}

async function payloadFor(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.synced === false) {
    const error = new Error(payload.message || fallback);
    error.status = response.status;
    error.code = payload.error?.code || "";
    error.retryable = Boolean(payload.error?.retryable);
    throw error;
  }
  return payload;
}

async function send(url, { method = "POST", body, fetchImpl = fetch } = {}) {
  const response = await fetchImpl(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  return payloadFor(response, "用户洞察保存失败。");
}

export function userInsightsApiUrl(scope = {}) {
  const params = paramsFor(scope);
  return `${BASE}${params.size ? `?${params}` : ""}`;
}

export const categoryMappingsApiUrl = () => `${BASE}/category-mappings`;
export const rulesApiUrl = () => `${BASE}/rules`;
export const competitorsApiUrl = () => `${BASE}/competitors`;

export async function loadUserInsights(scope, fetchImpl = fetch) {
  const response = await fetchImpl(userInsightsApiUrl(scope));
  return payloadFor(response, "用户洞察加载失败。");
}

export function saveCategoryMapping({ mapping, action = "upsert", expectedVersion }, fetchImpl = fetch) {
  return send(categoryMappingsApiUrl(), { body: { mapping, action, expectedVersion }, fetchImpl });
}

export function saveInsightRule({ rule, action = "upsert", sourceRuleId, target, expectedVersion }, fetchImpl = fetch) {
  return send(rulesApiUrl(), { body: { rule, action, sourceRuleId, target, expectedVersion }, fetchImpl });
}

export function saveCompetitor({ competitor, id, status, reason, expectedVersion }, fetchImpl = fetch) {
  const method = id ? "PATCH" : "POST";
  const body = id ? { id, status, reason, expectedVersion } : { competitor };
  return send(competitorsApiUrl(), { method, body, fetchImpl });
}

export function requestInsightRetry(scope, fetchImpl = fetch) {
  return send(BASE, { body: { action: "retry", scope }, fetchImpl });
}
