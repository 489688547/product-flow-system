import { normalizeCatalogPayload } from "../../../../../src/domain/productCatalog.js";
import { productCatalogDatabase, upsertProductCatalog } from "./_shared/storage.js";
import { catalogError, errorResponse, jsonResponse, optionsResponse, requireCatalogEditor, requireCatalogSession } from "./_shared/http.js";

function validIdentity(item = {}) {
  return String(item.sourceProductId || item.sysItemId || item.merchantCode || item.outerId || "").trim();
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  try {
    const session = requireCatalogSession(data);
    requireCatalogEditor(session);
    const db = productCatalogDatabase(env);
    if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，商品导入暂不可用。", 501, "PRODUCT_CATALOG_STORAGE_UNAVAILABLE");
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.items) || !body.items.length || body.items.some(item => !validIdentity(item))) {
      return errorResponse("导入内容缺少有效商品，或商品缺少系统 ID / 主商家编码。", 400, "PRODUCT_CATALOG_IMPORT_INVALID");
    }
    const source = String(body.source || "erp-file").trim().slice(0, 40);
    const normalized = normalizeCatalogPayload({ source, items: body.items });
    if (!normalized.items.length) return errorResponse("没有可导入的商品记录。", 400, "PRODUCT_CATALOG_IMPORT_EMPTY");
    const saved = await upsertProductCatalog(db, normalized, {
      actor: session.name || session.userId || "unknown",
      mode: "file",
      fileName: body.fileName,
      errors: body.errors
    });
    return jsonResponse({ synced: true, ...saved });
  } catch (error) {
    return catalogError(error, "商品主数据导入失败。");
  }
}
