import {
  ensureProductCatalogTables,
  productCatalogDatabase,
  productCatalogSalesMapping
} from "./_shared/storage.js";
import {
  catalogError,
  errorResponse,
  jsonResponse,
  optionsResponse,
  requireCatalogEditor,
  requireCatalogSession
} from "./_shared/http.js";

function mappingError(message, status, code) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  error.retryable = false;
  return error;
}

function cleanCode(value) {
  const code = String(value || "").trim();
  if (!code || code.length > 160 || /[\u0000-\u001f]/.test(code)) {
    throw mappingError("销售编码无效。", 400, "PRODUCT_CATALOG_SALES_MAPPING_CODE_INVALID");
  }
  return code;
}

function cleanProductId(value) {
  const productId = String(value || "").trim();
  if (!productId || productId.length > 200 || /[\u0000-\u001f]/.test(productId)) {
    throw mappingError("请选择要关联的商品。", 400, "PRODUCT_CATALOG_SALES_MAPPING_PRODUCT_INVALID");
  }
  return productId;
}

function expectedVersion(value) {
  const version = Number(value);
  if (!Number.isInteger(version) || version < 0) {
    throw mappingError("映射版本无效，请刷新后重试。", 400, "PRODUCT_CATALOG_SALES_MAPPING_VERSION_INVALID");
  }
  return version;
}

async function currentMapping(db, code) {
  return db.prepare(`SELECT code, product_id, active, version, created_at, created_by, updated_at, updated_by
    FROM product_catalog_sales_mappings WHERE code = ?`).bind(code).first();
}

async function writeMapping(db, { code, productId, active, version, actor, action, current }) {
  const now = new Date().toISOString();
  const createdAt = current?.created_at || now;
  const createdBy = current?.created_by || actor;
  const id = globalThis.crypto?.randomUUID?.() || `mapping-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await db.batch([
    db.prepare(`INSERT INTO product_catalog_sales_mappings
      (code, product_id, active, version, created_at, created_by, updated_at, updated_by)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(code) DO UPDATE SET
        product_id = excluded.product_id,
        active = excluded.active,
        version = excluded.version,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by`)
      .bind(code, productId, active ? 1 : 0, version, createdAt, createdBy, now, actor),
    db.prepare(`INSERT INTO product_catalog_sales_mapping_audit
      (id, code, product_id, action, version, actor, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, code, productId, action, version, actor, now)
  ]);
  return productCatalogSalesMapping({
    code,
    product_id: productId,
    active: active ? 1 : 0,
    version,
    created_at: createdAt,
    updated_at: now
  });
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["POST", "DELETE"].includes(request.method)) {
    return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  }
  try {
    const session = requireCatalogSession(data);
    requireCatalogEditor(session);
    const db = productCatalogDatabase(env, data);
    if (!db) {
      return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，销售编码关联暂不可用。", 501, "PRODUCT_CATALOG_STORAGE_UNAVAILABLE");
    }
    await ensureProductCatalogTables(db);
    const body = await request.json().catch(() => ({}));
    const code = cleanCode(body.code);
    const wantedVersion = expectedVersion(body.expectedVersion);
    const current = await currentMapping(db, code);
    const currentVersion = Number(current?.version) || 0;
    if (currentVersion !== wantedVersion) {
      throw mappingError("该销售编码已被其他人更新，请刷新后重试。", 409, "PRODUCT_CATALOG_SALES_MAPPING_VERSION_CONFLICT");
    }
    const actor = String(session.name || session.userId || "unknown").slice(0, 120);

    if (request.method === "POST") {
      const productId = cleanProductId(body.productId);
      const product = await db.prepare(`SELECT id FROM product_catalog_items
        WHERE id = ? AND active = 1 AND present_in_source = 1`).bind(productId).first();
      if (!product) {
        throw mappingError("目标商品不存在或已停用，请刷新商品目录后重试。", 404, "PRODUCT_CATALOG_SALES_MAPPING_PRODUCT_NOT_FOUND");
      }
      const mapping = await writeMapping(db, {
        code,
        productId,
        active: true,
        version: currentVersion + 1,
        actor,
        action: current ? "remapped" : "mapped",
        current
      });
      return jsonResponse({ synced: true, mapping });
    }

    if (!current || !Boolean(current.active)) {
      throw mappingError("该销售编码没有可撤销的关联。", 404, "PRODUCT_CATALOG_SALES_MAPPING_NOT_FOUND");
    }
    const mapping = await writeMapping(db, {
      code,
      productId: String(current.product_id || ""),
      active: false,
      version: currentVersion + 1,
      actor,
      action: "revoked",
      current
    });
    return jsonResponse({ synced: true, mapping });
  } catch (error) {
    return catalogError(error, "销售编码关联失败。");
  }
}
