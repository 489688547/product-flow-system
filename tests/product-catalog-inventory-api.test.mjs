import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/api/platform/v1/product-catalog.js";

const session = { name: "运营同事", role: "operator", department: "运营部" };

function inventoryDb({ inventoryRows, paginated = false } = {}) {
  const calls = [];
  const item = {
    id: "catalog-item-1",
    source: "kuaimai",
    source_product_id: "1001",
    merchant_code: "ITEM-1",
    name: "商品一",
    payload: JSON.stringify({
      id: "catalog-item-1",
      source: "kuaimai",
      sourceProductId: "1001",
      merchantCode: "ITEM-1",
      name: "商品一",
      active: true,
      productKind: "single"
    }),
    active: 1,
    present_in_source: 1
  };
  const sku = {
    id: "catalog-sku-1",
    item_id: "catalog-item-1",
    payload: JSON.stringify({
      id: "catalog-sku-1",
      productId: "catalog-item-1",
      sourceSkuId: "2001",
      barcode: "6970000000001",
      merchantSkuCode: "SKU-1"
    })
  };
  const defaults = [
    {
      id: "inventory-1",
      snapshot_date: "2026-07-28",
      product_id: null,
      sku_id: "2001",
      sku_code: "SKU-1",
      warehouse_id: "warehouse-1",
      calibrated_quantity: 5,
      confidence: "partial",
      updated_at: "2026-07-28T05:10:00.000Z"
    },
    {
      id: "inventory-2",
      snapshot_date: "2026-07-28",
      product_id: null,
      sku_id: "2001",
      sku_code: "SKU-1",
      warehouse_id: "warehouse-2",
      calibrated_quantity: 7,
      confidence: "partial",
      updated_at: "2026-07-28T05:20:00.000Z"
    }
  ];
  const rows = inventoryRows === undefined ? defaults : inventoryRows;
  return {
    calls,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          return { success: true };
        },
        async first() {
          calls.push({ sql, values: statement.values });
          if (/from product_catalog_meta/i.test(sql)) {
            return { value: statement.values[0] === "lastSuccessfulSyncAt" ? "2026-07-28T05:30:00.000Z" : "" };
          }
          if (/max\(snapshot_date\)/i.test(sql)) {
            return { latest_date: rows.length ? "2026-07-28" : null };
          }
          if (/from product_sales_meta/i.test(sql)) return null;
          return null;
        },
        async all() {
          calls.push({ sql, values: statement.values });
          if (/from product_catalog_items/i.test(sql)) return { results: [item] };
          if (/from product_catalog_skus/i.test(sql)) return { results: [sku] };
          if (/from product_catalog_components/i.test(sql)) return { results: [] };
          if (/from product_catalog_sync_runs/i.test(sql)) return { results: [] };
          if (/from product_catalog_sales_mappings/i.test(sql)) return { results: [] };
          if (/from goods_flow_inventory_daily/i.test(sql)) {
            if (!paginated) return { results: rows };
            if (statement.values.length === 1) {
              return {
                results: Array.from({ length: 5001 }, (_, index) => ({
                  ...rows[0],
                  id: `inventory-page-1-${index}`,
                  warehouse_id: `warehouse-${String(index).padStart(4, "0")}`,
                  calibrated_quantity: 1
                }))
              };
            }
            return {
              results: [{
                ...rows[0],
                id: "inventory-page-2",
                warehouse_id: "warehouse-z",
                calibrated_quantity: 1
              }]
            };
          }
          if (/from product_sales_daily/i.test(sql)) return { results: [] };
          return { results: [] };
        }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}

function request(query = "") {
  return new Request(`https://flow.example.com/api/platform/v1/product-catalog${query}`);
}

test("catalog API returns current inventory in the same response as dated sales", async () => {
  const db = inventoryDb();
  const response = await onRequest({
    request: request("?from=2026-07-01&to=2026-07-28"),
    env: { PRODUCT_FLOW_DB: db },
    data: { session }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.deepEqual(payload.items[0].inventory, {
    quantity: 12,
    status: "available",
    snapshotDate: "2026-07-28",
    coverage: 1,
    confidence: "partial",
    matchedSkuCount: 1,
    requiredComponentCount: 0,
    matchedComponentCount: 0
  });
  assert.equal(payload.meta.inventory.status, "trusted");
  assert.equal(payload.meta.inventory.totalRows, 2);
  assert.equal(payload.meta.inventory.warehouseCount, 2);
  assert.equal(payload.meta.inventory.skuCount, 1);
});

test("legacy catalog reads skip sales but still receive the latest inventory snapshot", async () => {
  const db = inventoryDb();
  const response = await onRequest({
    request: request(),
    env: { PRODUCT_FLOW_DB: db },
    data: { session }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items[0].sales, undefined);
  assert.equal(payload.items[0].inventory.quantity, 12);
  assert.equal(db.calls.some(call => /product_sales_daily/i.test(call.sql)), false);
});

test("empty inventory stays unavailable without clearing catalog data", async () => {
  const response = await onRequest({
    request: request(),
    env: { PRODUCT_FLOW_DB: inventoryDb({ inventoryRows: [] }) },
    data: { session }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items.length, 1);
  assert.equal(payload.items[0].inventory.quantity, null);
  assert.equal(payload.items[0].inventory.status, "unavailable");
  assert.equal(payload.meta.inventory.status, "unavailable");
});

test("catalog inventory consumes every bounded current-snapshot page", async () => {
  const db = inventoryDb({ paginated: true });
  const response = await onRequest({
    request: request(),
    env: { PRODUCT_FLOW_DB: db },
    data: { session }
  });
  const payload = await response.json();
  const inventoryCalls = db.calls.filter(call => /select \* from goods_flow_inventory_daily/i.test(call.sql));

  assert.equal(response.status, 200);
  assert.equal(inventoryCalls.length, 2);
  assert.equal(payload.meta.inventory.totalRows, 5001);
  assert.equal(payload.items[0].inventory.quantity, 5001);
});
