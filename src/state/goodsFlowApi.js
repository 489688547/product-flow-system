const BASE_URL = "/api/platform/v1/goods-flow";

function clientError(payload, status, fallbackMessage) {
  const details = payload?.error || {};
  const error = new Error(details.message || fallbackMessage);
  error.status = status;
  error.code = details.code || "GOODS_FLOW_REQUEST_FAILED";
  error.requestId = details.requestId || "";
  error.retryable = Boolean(details.retryable);
  error.details = details.details;
  return error;
}

function networkError(error, fallbackMessage) {
  const wrapped = new Error(`${fallbackMessage}，当前保留上次成功数据。`);
  wrapped.code = "GOODS_FLOW_NETWORK_FAILED";
  wrapped.retryable = true;
  wrapped.cause = error;
  return wrapped;
}

async function requestGoodsFlow(url, { fetchImpl = fetch, fallbackMessage = "货流数据加载失败", ...options } = {}) {
  let response;
  try {
    response = await fetchImpl(url, {
      ...options,
      headers: { accept: "application/json", ...(options.headers || {}) }
    });
  } catch (error) {
    throw networkError(error, fallbackMessage);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw clientError(payload, response.status, fallbackMessage);
  return payload;
}

function writeOptions(method, body, idempotencyKey) {
  return {
    method,
    headers: {
      "content-type": "application/json",
      "idempotency-key": idempotencyKey || globalThis.crypto?.randomUUID?.() || `goods-flow-${Date.now()}`
    },
    body: JSON.stringify(body)
  };
}

export function fetchGoodsFlowDashboard({ fetchImpl = fetch, url = `${BASE_URL}/dashboard` } = {}) {
  return requestGoodsFlow(url, { fetchImpl, fallbackMessage: "货流驾驶舱加载失败" });
}

export function fetchGoodsFlowInventory({ fetchImpl = fetch, through, url = `${BASE_URL}/inventory` } = {}) {
  const target = through ? `${url}?through=${encodeURIComponent(through)}` : url;
  return requestGoodsFlow(target, { fetchImpl, fallbackMessage: "库存货流加载失败" });
}

export function fetchGoodsFlowTerms({ fetchImpl = fetch, url = `${BASE_URL}/receivable-terms` } = {}) {
  return requestGoodsFlow(url, { fetchImpl, fallbackMessage: "平台账期加载失败" });
}

export function fetchGoodsFlowStocktakes({ fetchImpl = fetch, url = `${BASE_URL}/stocktakes` } = {}) {
  return requestGoodsFlow(url, { fetchImpl, fallbackMessage: "月度盘点加载失败" });
}

export function saveGoodsFlowTerm({ fetchImpl = fetch, term, idempotencyKey, url = `${BASE_URL}/receivable-terms` }) {
  return requestGoodsFlow(url, {
    fetchImpl,
    ...writeOptions("PUT", term, idempotencyKey),
    fallbackMessage: "平台账期保存失败"
  });
}

export function createGoodsFlowStocktake({ fetchImpl = fetch, stocktake, idempotencyKey, url = `${BASE_URL}/stocktakes` }) {
  return requestGoodsFlow(url, {
    fetchImpl,
    ...writeOptions("POST", stocktake, idempotencyKey),
    fallbackMessage: "盘点结果保存失败"
  });
}

export function transitionGoodsFlowStocktake({ fetchImpl = fetch, id, action, expectedVersion, idempotencyKey, url = `${BASE_URL}/stocktakes/${encodeURIComponent(id)}/transitions` }) {
  return requestGoodsFlow(url, {
    fetchImpl,
    ...writeOptions("POST", { action, expectedVersion }, idempotencyKey),
    fallbackMessage: "盘点状态更新失败"
  });
}

export function recalculateGoodsFlowCcc({ fetchImpl = fetch, month, input = {}, idempotencyKey, url = `${BASE_URL}/ccc/${encodeURIComponent(month)}/recalculate` }) {
  return requestGoodsFlow(url, {
    fetchImpl,
    ...writeOptions("POST", input, idempotencyKey),
    fallbackMessage: "CCC 重新计算失败"
  });
}

export function freezeGoodsFlowCcc({ fetchImpl = fetch, month, expectedVersion, idempotencyKey, url = `${BASE_URL}/ccc/${encodeURIComponent(month)}/freeze` }) {
  return requestGoodsFlow(url, {
    fetchImpl,
    ...writeOptions("POST", { expectedVersion }, idempotencyKey),
    fallbackMessage: "CCC 冻结失败"
  });
}

export function importGoodsFlowFacts({ fetchImpl = fetch, input, idempotencyKey, url = `${BASE_URL}/imports` }) {
  return requestGoodsFlow(url, {
    fetchImpl,
    ...writeOptions("POST", input, idempotencyKey),
    fallbackMessage: "货流数据导入失败"
  });
}
