import { normalizeCatalogPayload } from "../../../../../../src/domain/productCatalog.js";
import { kuaimaiConfigFromEnv, pullKuaimaiProductCatalog } from "../../../../kuaimai/_shared/kuaimai.js";
import { productCatalogDatabase, upsertProductCatalog } from "../_shared/storage.js";
import { catalogError, errorResponse, jsonResponse, optionsResponse, requireCatalogEditor, requireCatalogSession } from "../_shared/http.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  try {
    const session = requireCatalogSession(data);
    requireCatalogEditor(session);
    const db = productCatalogDatabase(env);
    if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，快麦商品同步暂不可用。", 501, "PRODUCT_CATALOG_STORAGE_UNAVAILABLE");
    const config = kuaimaiConfigFromEnv(env);
    if (!config.ready) return errorResponse("缺少快麦商品同步配置。", 400, "KUAIMAI_CONFIG_MISSING");
    const startedAt = new Date().toISOString();
    const pulled = await pullKuaimaiProductCatalog(config, { pageSize: 200, maxPages: 8 });
    if (!pulled.complete) {
      return errorResponse(`快麦商品超过单次安全分页范围，已读取 ${pulled.items.length} 条，未写入目录。`, 409, "KUAIMAI_PRODUCT_SYNC_INCOMPLETE", true);
    }
    const catalog = normalizeCatalogPayload({ source: "kuaimai", items: pulled.items, syncedAt: new Date().toISOString() });
    const saved = await upsertProductCatalog(db, { ...catalog, startedAt }, {
      actor: session.name || session.userId || "unknown",
      mode: "kuaimai_api",
      pages: pulled.pagesFetched
    });
    return jsonResponse({ synced: true, providerTotal: pulled.total, pagesFetched: pulled.pagesFetched, ...saved });
  } catch (error) {
    const response = catalogError(error, "快麦商品同步失败。");
    if (response.status === 500) return errorResponse(error?.message || "快麦商品同步失败。", 502, error?.kuaimaiCode ? "KUAIMAI_PRODUCT_SYNC_FAILED" : "PRODUCT_CATALOG_UNEXPECTED", true);
    return response;
  }
}
