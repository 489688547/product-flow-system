export function productCatalogApiUrl() {
  return "/api/platform/v1/product-catalog";
}

export function productCatalogQueryUrl(query = {}) {
  const from = String(query.from || "").trim();
  const to = String(query.to || "").trim();
  if (!from || !to) return productCatalogApiUrl();
  const params = new URLSearchParams({ from, to });
  const platform = String(query.platform || "").trim();
  if (platform) params.set("platform", platform);
  return `${productCatalogApiUrl()}?${params.toString()}`;
}

export function productCatalogImportUrl() {
  return "/api/platform/v1/product-catalog/import";
}

export function productCatalogSyncUrl() {
  return "/api/platform/v1/product-catalog/sync/kuaimai";
}

async function payloadFor(response, fallback, { allowUnsynced = false } = {}) {
  const payload = await response.json().catch(() => ({}));
  const invalidReadPayload = allowUnsynced && !Array.isArray(payload?.items);
  if (!response.ok || invalidReadPayload || (!allowUnsynced && payload?.synced === false)) {
    const error = new Error(payload?.message || fallback);
    error.status = response.status;
    error.code = payload?.error?.code || "PRODUCT_CATALOG_REQUEST_FAILED";
    error.retryable = Boolean(payload?.error?.retryable);
    error.requestId = payload?.error?.requestId || "";
    throw error;
  }
  return payload;
}

export async function loadProductCatalog(queryOrFetch = {}, fetchImpl = fetch) {
  const query = typeof queryOrFetch === "function" ? {} : queryOrFetch;
  const requester = typeof queryOrFetch === "function" ? queryOrFetch : fetchImpl;
  const response = await requester(productCatalogQueryUrl(query));
  return payloadFor(response, "商品主数据加载失败。", { allowUnsynced: true });
}

export async function importProductCatalog(input, fetchImpl = fetch) {
  const response = await fetchImpl(productCatalogImportUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return payloadFor(response, "商品主数据导入失败。");
}

export async function syncKuaimaiProductCatalog(fetchImpl = fetch) {
  const response = await fetchImpl(productCatalogSyncUrl(), { method: "POST" });
  return payloadFor(response, "快麦商品同步失败。");
}
