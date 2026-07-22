import { normalizeCatalogPayload } from "../../../../../../src/domain/productCatalog.js";
import { pullKuaimaiProductCatalog, pullKuaimaiProductDetails, resolveKuaimaiConfig } from "../../../../kuaimai/_shared/kuaimai.js";
import { productCatalogDatabase, replaceProductCatalogComponents, upsertProductCatalog } from "../_shared/storage.js";
import { catalogError, errorResponse, jsonResponse, optionsResponse, requireCatalogEditor, requireCatalogSession } from "../_shared/http.js";

async function syncCursor(request) {
  const body = await request.json().catch(() => ({}));
  const cursor = Number(body?.cursor);
  return Number.isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : 0;
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  try {
    const session = requireCatalogSession(data);
    requireCatalogEditor(session);
    const db = productCatalogDatabase(env);
    if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，快麦商品同步暂不可用。", 501, "PRODUCT_CATALOG_STORAGE_UNAVAILABLE");
    const config = await resolveKuaimaiConfig(env);
    if (!config.ready) return errorResponse("缺少快麦商品同步配置。", 400, "KUAIMAI_CONFIG_MISSING");
    const cursor = await syncCursor(request);
    const actor = session.name || session.userId || "unknown";
    const startedAt = new Date().toISOString();
    const pulled = await pullKuaimaiProductCatalog(config, { pageSize: 200, maxPages: 8 });
    if (!pulled.complete) {
      return errorResponse(`快麦商品超过单次安全分页范围，已读取 ${pulled.items.length} 条，未写入目录。`, 409, "KUAIMAI_PRODUCT_SYNC_INCOMPLETE", true);
    }
    const catalog = normalizeCatalogPayload({ source: "kuaimai", items: pulled.items, syncedAt: new Date().toISOString() });
    const saved = await upsertProductCatalog(db, { ...catalog, startedAt }, {
      actor,
      mode: "kuaimai_api",
      pages: pulled.pagesFetched
    });
    const details = await pullKuaimaiProductDetails(config, pulled.items, { cursor, maxDetails: 30 });
    const detailCatalog = normalizeCatalogPayload({ source: "kuaimai", items: details.details, syncedAt: catalog.syncedAt });
    const componentSaved = await replaceProductCatalogComponents(db, detailCatalog.items, {
      actor,
      syncedAt: catalog.syncedAt,
      replaceEmpty: true
    });
    const processed = details.cursor + details.details.length + details.failures.length;
    return jsonResponse({
      synced: true,
      complete: details.complete,
      nextCursor: details.nextCursor,
      status: details.failures.length ? "partial" : details.complete ? "success" : "running",
      providerTotal: pulled.total,
      pagesFetched: pulled.pagesFetched,
      ...saved,
      progress: {
        cursor: details.cursor,
        processed,
        totalCandidates: details.totalCandidates,
        details: details.details.length,
        components: componentSaved.components,
        failed: details.failures.length
      },
      failures: details.failures
    });
  } catch (error) {
    const response = catalogError(error, "快麦商品同步失败。");
    if (response.status === 500) return errorResponse(error?.message || "快麦商品同步失败。", 502, error?.kuaimaiCode ? "KUAIMAI_PRODUCT_SYNC_FAILED" : "PRODUCT_CATALOG_UNEXPECTED", true);
    return response;
  }
}
