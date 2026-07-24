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
    stores: Array.isArray(data.stores) ? data.stores : [],
    jobs: Array.isArray(data.jobs) ? data.jobs : [],
    runs: Array.isArray(data.runs) ? data.runs : [],
    cursors: Array.isArray(data.cursors) ? data.cursors : [],
    notifications: Array.isArray(data.notifications) ? data.notifications : []
  };
}

const REGISTERED_TRIGGER_RESOURCES = Object.freeze({
  kuaimai: new Set(["orders", "order_items", "sales_items", "products"]),
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
  const response = await fetchImpl("/api/platform/v1/web-collection/jobs", {
    method: "POST",
    credentials: "include",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      action: "trigger",
      providerId,
      ...(storeId ? { storeId } : {}),
      resourceType,
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

// 商品快照入口只提交 products；服务端展开普通商品、套件和组合装三任务。
export function triggerKuaimaiProductCollection({ date, force = false }, fetchImpl = fetch) {
  return triggerWebCollection({
    providerId: "kuaimai",
    resourceType: "products",
    businessDate: date,
    force
  }, fetchImpl);
}

function productCollectionFailure(jobs) {
  const waiting = jobs.find(job => job.status === "waiting_human");
  if (waiting) {
    const code = String(waiting.errorCode || "");
    if (/LOGIN_REQUIRED/i.test(code)) return { status: "waiting_human", label: "请先在 Chrome 登录快麦" };
    return { status: "waiting_human", label: "请在 Chrome 完成快麦验证" };
  }
  if (jobs.some(job => job.status === "schema_changed")) {
    return { status: "schema_changed", label: "快麦商品页面结构已变化" };
  }
  if (jobs.some(job => ["failed", "cancelled"].includes(job.status))) {
    return { status: "failed", label: "商品采集失败，请查看数据同步" };
  }
  return null;
}

export function kuaimaiProductCollectionProgress(status, jobIds) {
  const jobById = new Map((status?.jobs || []).map(job => [job.id, job]));
  const jobs = (jobIds || []).map(id => jobById.get(id)).filter(Boolean);
  const total = jobIds?.length || 0;
  const completed = jobs.filter(job => job.status === "success").length;
  const failure = productCollectionFailure(jobs);
  if (failure) return { ...failure, completed, total, jobs };
  if (total > 0 && completed === total) {
    return { status: "success", label: "商品数据已更新", completed, total, jobs };
  }
  const stages = new Set(jobs.flatMap(job => [job.status, job.stage]).filter(Boolean));
  const label = stages.has("ingesting")
    ? "正在写入商品数据"
    : stages.has("validating") || stages.has("downloading")
      ? "正在校验商品文件"
      : stages.has("exporting")
        ? "Chrome 正在导出商品数据"
        : "等待 Chrome 插件采集";
  return { status: "running", label, completed, total, jobs };
}
