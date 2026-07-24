const COMMERCE_FACT_RESOURCES = new Set(["store_daily", "product_daily", "live_daily", "video_daily"]);

export function commerceFactsApiUrl({ providerId = "douyin-ecommerce", storeId, resourceType, from, to }) {
  const params = new URLSearchParams({ providerId, storeId, resourceType, from, to });
  return `/api/platform/v1/commerce-facts?${params.toString()}`;
}

// 读取单店铺、单资源、指定日范围的抖店经营事实；权限不足或未采集时由调用方优雅降级。
export async function loadCommerceFacts(
  { providerId = "douyin-ecommerce", storeId, resourceType, from, to },
  fetchImpl = fetch
) {
  if (!COMMERCE_FACT_RESOURCES.has(String(resourceType))) {
    const error = new Error("经营事实资源未登记。");
    error.code = "COMMERCE_FACT_RESOURCE_INVALID";
    throw error;
  }
  const response = await fetchImpl(commerceFactsApiUrl({ providerId, storeId, resourceType, from, to }), {
    credentials: "include",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "店铺经营数据读取失败。");
    error.status = response.status;
    error.code = payload?.error?.code || "COMMERCE_FACTS_REQUEST_FAILED";
    error.retryable = Boolean(payload?.error?.retryable);
    throw error;
  }
  const data = payload?.data || {};
  return {
    facts: Array.isArray(data.facts) ? data.facts : [],
    quality: data.quality || null
  };
}
