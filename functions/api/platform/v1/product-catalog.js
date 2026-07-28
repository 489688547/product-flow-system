import { productCatalogDatabase, readProductCatalog } from "./product-catalog/_shared/storage.js";
import { catalogError, errorResponse, filterCatalogCosts, jsonResponse, optionsResponse, requireCatalogSession } from "./product-catalog/_shared/http.js";
import { readCatalogInventory } from "./product-catalog/_shared/inventory.js";
import { catalogSalesQuery, readCatalogSales } from "./product-catalog/_shared/sales.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  try {
    const session = requireCatalogSession(data);
    const db = productCatalogDatabase(env, data);
    if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，商品主数据暂不可用。", 501, "PRODUCT_CATALOG_STORAGE_UNAVAILABLE");
    const catalog = await readProductCatalog(db);
    const query = catalogSalesQuery(new URL(request.url));
    if (!query) {
      const inventory = await readCatalogInventory(db, catalog.items);
      return jsonResponse({
        synced: Boolean(catalog.meta.lastSuccessfulSyncAt),
        ...catalog,
        items: filterCatalogCosts(inventory.items, session),
        meta: { ...catalog.meta, inventory: inventory.meta }
      });
    }
    const [sales, inventory] = await Promise.all([
      readCatalogSales(db, catalog.items, query),
      readCatalogInventory(db, catalog.items)
    ]);
    const inventoryByItemId = new Map(inventory.items.map(item => [item.id, item.inventory]));
    return jsonResponse({
      synced: Boolean(catalog.meta.lastSuccessfulSyncAt),
      ...catalog,
      items: filterCatalogCosts(sales.items.map(item => ({
        ...item,
        inventory: inventoryByItemId.get(item.id)
      })), session),
      meta: { ...catalog.meta, sales: sales.meta, inventory: inventory.meta }
    });
  } catch (error) {
    return catalogError(error);
  }
}
