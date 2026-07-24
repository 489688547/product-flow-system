export function webCollectionStatusApiUrl(limit = 100) {
  return `/api/platform/v1/web-collection/jobs?limit=${Math.max(1, Math.min(100, Number(limit) || 100))}`;
}

export async function loadWebCollectionStatus(fetchImpl = fetch) {
  const response = await fetchImpl(webCollectionStatusApiUrl(), {
    credentials: "include",
    headers: { accept: "application/json" }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Chrome 采集状态读取失败。");
    error.status = response.status;
    error.code = payload?.error?.code || "WEB_COLLECTION_STATUS_FAILED";
    error.retryable = Boolean(payload?.error?.retryable);
    throw error;
  }
  const data = payload?.data || {};
  return {
    runners: Array.isArray(data.runners) ? data.runners : [],
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    runs: Array.isArray(data.runs) ? data.runs : [],
    cursors: Array.isArray(data.cursors) ? data.cursors : [],
    notifications: Array.isArray(data.notifications) ? data.notifications : []
  };
}

const REGISTERED_TRIGGER_RESOURCES = Object.freeze({
  kuaimai: new Set(["orders", "order_items", "sales_items"]),
  "douyin-ecommerce": new Set(["store_daily", "product_daily", "live_daily", "video_daily"])
});

export async function triggerWebCollection(input, fetchImpl = fetch) {
  const providerId = String(input?.providerId || "");
  const resourceType = String(input?.resourceType || "");
  const businessDate = String(input?.businessDate || "");
  const storeId = String(input?.storeId || "");
  if (
    !REGISTERED_TRIGGER_RESOURCES[providerId]?.has(resourceType)
    || !/^\d{4}-\d{2}-\d{2}$/.test(businessDate)
    || (providerId === "douyin-ecommerce" && !/^[-_a-zA-Z0-9]{1,128}$/.test(storeId))
  ) {
    const error = new Error("Chrome 采集任务范围无效。");
    error.code = "WEB_COLLECTION_TRIGGER_INVALID";
    throw error;
  }
  const safeResourceType = ["orders", "order_items", "sales_items"].includes(resourceType) ? resourceType : "order_items";
  const response = await fetchImpl("/api/platform/v1/web-collection/jobs", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      action: "trigger",
      providerId,
      ...(storeId ? { storeId } : {}),
      resourceType: providerId === "kuaimai" ? safeResourceType : resourceType,
      businessDate,
      force: Boolean(input.force)
    })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "Chrome 采集任务触发失败。");
    error.status = response.status;
    error.code = payload?.error?.code || "WEB_COLLECTION_TRIGGER_FAILED";
    error.retryable = Boolean(payload?.error?.retryable);
    throw error;
  }
  return payload?.data || {};
}

export function triggerKuaimaiSalesCollection(
  { date, resourceType = "order_items", force = false },
  fetchImpl = fetch
) {
  return triggerWebCollection({
    providerId: "kuaimai",
    resourceType: ["orders", "order_items", "sales_items"].includes(resourceType)
      ? resourceType
      : "order_items",
    businessDate: date,
    force
  }, fetchImpl);
}
