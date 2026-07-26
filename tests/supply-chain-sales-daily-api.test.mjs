import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/api/platform/v1/data-services/sales/daily.js";

const session = { userId: "supply-1", name: "供应链", department: "供应链部" };

function database() {
  const sales = [
    {
      code: "6970001", date: "2026-07-25", platform: "抖音", qty: 12, sales: 240,
      net_sales: 220, gross_profit: 120, refund: 20, cost: 100,
      pre_ship_refund: 5, post_ship_refund: 15
    },
    {
      code: "UNMATCHED", date: "2026-07-25", platform: "天猫", qty: 3, sales: 60,
      net_sales: 60, gross_profit: 30, refund: 0, cost: 30,
      pre_ship_refund: 0, post_ship_refund: 0
    },
    {
      code: "6970001", date: "2026-07-25", platform: "其它", qty: 8, sales: 160,
      net_sales: 160, gross_profit: 80, refund: 0, cost: 80,
      pre_ship_refund: 0, post_ship_refund: 0
    }
  ];
  return {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async all() {
          if (/from product_catalog_skus/i.test(sql)) {
            return {
              results: [{
                id: "sku-1", item_id: "product-1", barcode: "6970001",
                merchant_sku_code: "SKU-1", active: 1
              }]
            };
          }
          if (/from product_catalog_sales_mappings/i.test(sql)) return { results: [] };
          if (/from product_sales_daily/i.test(sql)) {
            const [from, to] = statement.values;
            return {
              results: sales.filter(row => (
                row.date >= from && row.date <= to && !["", "其它", "其他", "未知", "未知平台"].includes(row.platform)
              ))
            };
          }
          return { results: [] };
        },
        async first() {
          if (/from product_sales_meta/i.test(sql)) {
            return { payload: JSON.stringify({ imports: [{ importedAt: "2026-07-26T05:20:00.000Z" }] }) };
          }
          return null;
        }
      };
      return statement;
    }
  };
}

async function call(query, options = {}) {
  const response = await onRequest({
    request: new Request(`https://flow.example.com/api/platform/v1/data-services/sales/daily${query}`),
    env: { PRODUCT_FLOW_DB: options.db || database() },
    data: { session: options.session || session }
  });
  return { response, body: await response.json() };
}

test("sales daily returns create-time atomic demand facts and truthful missing coverage", async () => {
  const result = await call("?from=2026-07-25&to=2026-07-25");

  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body.contract, {
    timeBasis: "create_time",
    timezone: "Asia/Shanghai",
    excludeOther: true,
    grain: ["date", "inventoryUnitId", "platform"]
  });
  assert.equal(result.body.items.length, 2);
  assert.deepEqual(result.body.items[0], {
    date: "2026-07-25",
    productId: "product-1",
    inventoryUnitId: "sku-1",
    inventoryUnitCode: "6970001",
    platform: "抖音",
    grossQuantity: 12,
    returnQuantity: null,
    netQuantity: null,
    grossSales: 240,
    netSales: 220,
    salesCost: 100,
    refundAmount: 20,
    promotionIds: []
  });
  assert.equal(result.body.items[1].productId, null);
  assert.equal(result.body.items[1].inventoryUnitId, null);
  assert.equal(result.body.quality.status, "partial");
  assert.equal(result.body.quality.coverage, 0.5);
  assert.ok(result.body.quality.missing.includes("returnQuantity"));
  assert.ok(result.body.quality.missing.includes("promotionIds"));
  assert.ok(result.body.quality.missing.includes("productMapping"));
  assert.equal(result.body.quality.lastSuccessfulSyncAt, "2026-07-26T05:20:00.000Z");
});

test("sales daily filters by inventory unit and rejects invalid ranges", async () => {
  const filtered = await call("?from=2026-07-25&to=2026-07-25&inventoryUnitId=sku-1");
  assert.equal(filtered.body.items.length, 1);
  assert.equal(filtered.body.items[0].inventoryUnitId, "sku-1");

  const invalid = await call("?from=2026-07-26&to=2026-07-25");
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, "DATA_SERVICE_DATE_RANGE_INVALID");
});

test("sales daily requires a permitted company session", async () => {
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/data-services/sales/daily?from=2026-07-25&to=2026-07-25"),
    env: { PRODUCT_FLOW_DB: database() },
    data: {}
  });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, "AUTH_SESSION_REQUIRED");
});

test("sales daily hides unexpected storage details", async () => {
  const db = {
    prepare() {
      return {
        bind() { return this; },
        async all() {
          throw new Error("SQL failed with password=do-not-leak");
        }
      };
    }
  };
  const result = await call("?from=2026-07-25&to=2026-07-25", { db });
  assert.equal(result.response.status, 500);
  assert.equal(result.body.error.code, "DATA_SERVICE_QUERY_FAILED");
  assert.doesNotMatch(JSON.stringify(result.body), /SQL|do-not-leak|password=/i);
});
