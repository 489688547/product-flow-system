import { productCatalogDatabase, readProductCatalog } from "./product-catalog/_shared/storage.js";
import { catalogError, errorResponse, filterCatalogCosts, jsonResponse, optionsResponse, requireCatalogSession } from "./product-catalog/_shared/http.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  try {
    const session = requireCatalogSession(data);
    const db = productCatalogDatabase(env);
    if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，商品主数据暂不可用。", 501, "PRODUCT_CATALOG_STORAGE_UNAVAILABLE");
    const catalog = await readProductCatalog(db);
    return jsonResponse({ synced: Boolean(catalog.meta.lastSuccessfulSyncAt), ...catalog, items: filterCatalogCosts(catalog.items, session) });
  } catch (error) {
    return catalogError(error);
  }
}
