import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/platform/v1/product-catalog.js";

const session = { name: "运营同事", role: "operator", department: "运营部" };

function createD1Mock() {
  const item = {
    id: "product-1",
    source: "kuaimai",
    source_product_id: "1001",
    merchant_code: "ITEM-1",
    name: "商品一",
    payload: JSON.stringify({ id: "product-1", source: "kuaimai", merchantCode: "ITEM-1", name: "商品一", active: true }),
    active: 1,
    present_in_source: 1
  };
  const sku = {
    id: "sku-1",
    item_id: "product-1",
    payload: JSON.stringify({ id: "sku-1", productId: "product-1", barcode: "6978705011208", merchantSkuCode: "SKU-1", purchasePrice: 9.5 })
  };
  const salesRows = [
    { code: "6978705011208", date: "2026-07-01", platform: "抖音", qty: 3, net_sales: 60 },
    { code: "6978705011208", date: "2026-07-02", platform: "天猫", qty: 2, net_sales: 50 },
    { code: "6978705011208", date: "2026-07-03", platform: "其它", qty: 8, net_sales: 160 },
    { code: "UNMATCHED", date: "2026-07-02", platform: "抖音", qty: 5, net_sales: 100 },
    { code: "6978705011208", date: "2026-06-30", platform: "抖音", qty: 10, net_sales: 200 }
  ];
  const calls = [];
  const mutations = [];
  return {
    calls,
    mutations,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() { mutations.push({ sql, values: statement.values }); return { success: true }; },
        async all() {
          calls.push({ sql, values: statement.values });
          if (/from product_catalog_items/i.test(sql)) return { results: [item] };
          if (/from product_catalog_skus/i.test(sql)) return { results: [sku] };
          if (/from product_catalog_sync_runs/i.test(sql)) return { results: [] };
          if (/select distinct platform[\s\S]*from product_sales_daily/i.test(sql)) {
            const [from, to] = statement.values;
            return { results: [...new Set(salesRows.filter(row => row.date >= from && row.date <= to && !["其它", "其他", "未知", "未知平台", ""].includes(row.platform)).map(row => row.platform))].sort().map(platform => ({ platform })) };
          }
          if (/sum\(qty\)[\s\S]*from product_sales_daily/i.test(sql)) {
            const [from, to, platform] = statement.values;
            const selected = salesRows.filter(row => row.date >= from && row.date <= to)
              .filter(row => platform ? row.platform === platform : !["其它", "其他", "未知", "未知平台", ""].includes(row.platform));
            const grouped = new Map();
            for (const row of selected) {
              const key = `${row.code}|${row.platform}`;
              const current = grouped.get(key) || { code: row.code, platform: row.platform, qty: 0, net_sales: 0, latest_date: row.date };
              current.qty += row.qty;
              current.net_sales += row.net_sales;
              if (row.date > current.latest_date) current.latest_date = row.date;
              grouped.set(key, current);
            }
            return { results: [...grouped.values()] };
          }
          return { results: [] };
        },
        async first() {
          calls.push({ sql, values: statement.values });
          if (/from product_catalog_meta/i.test(sql)) return { value: statement.values[0] === "lastSuccessfulSyncAt" ? "2026-07-19T09:00:00.000Z" : "" };
          if (/from product_sales_meta/i.test(sql)) return { payload: JSON.stringify({ imports: [{ importedAt: "2026-07-20T08:00:00.000Z" }] }) };
          return null;
        }
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
}

function request(query = "") {
  return new Request(`https://flow.example.com/api/platform/v1/product-catalog${query}`);
}

test("catalog API joins persisted sales by date while excluding the other-platform bucket", async () => {
  const db = createD1Mock();
  const response = await onRequest({ request: request("?from=2026-07-01&to=2026-07-03"), env: { PRODUCT_FLOW_DB: db }, data: { session } });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items[0].sales.quantity, 5);
  assert.equal(payload.items[0].sales.netSales, 110);
  assert.deepEqual(payload.meta.sales.availablePlatforms, ["天猫", "抖音"]);
  assert.equal(payload.meta.sales.totalQuantity, 5);
  assert.equal(payload.meta.sales.unmatchedRowCount, 1);
  assert.equal(payload.meta.sales.timeBasis, "create_time");
  assert.equal(payload.meta.sales.latestDataDate, "2026-07-02");
  assert.equal(payload.meta.sales.lastSuccessfulSyncAt, "2026-07-20T08:00:00.000Z");
  assert.equal(payload.items[0].skus[0].purchasePrice, undefined);
  assert.equal(db.mutations.some(call => /(?:create|alter) table[\s\S]*product_sales/i.test(call.sql)), false);
});

test("catalog API applies a parameterized platform filter", async () => {
  const db = createD1Mock();
  const response = await onRequest({ request: request("?from=2026-07-01&to=2026-07-03&platform=%E6%8A%96%E9%9F%B3"), env: { PRODUCT_FLOW_DB: db }, data: { session } });
  const payload = await response.json();

  assert.equal(payload.items[0].sales.quantity, 3);
  const salesCall = db.calls.find(call => /sum\(qty\)/i.test(call.sql));
  assert.deepEqual(salesCall.values, ["2026-07-01", "2026-07-03", "抖音"]);
  assert.match(salesCall.sql, /platform = \?/);
});

test("catalog API rejects partial, reversed and overlong date ranges", async () => {
  for (const query of [
    "?from=2026-07-01",
    "?from=2026-07-03&to=2026-07-01",
    "?from=2025-01-01&to=2026-07-20"
  ]) {
    const response = await onRequest({ request: request(query), env: { PRODUCT_FLOW_DB: createD1Mock() }, data: { session } });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "PRODUCT_CATALOG_SALES_RANGE_INVALID");
  }
});

test("catalog API remains compatible when an older client sends no sales range", async () => {
  const db = createD1Mock();
  const response = await onRequest({ request: request(), env: { PRODUCT_FLOW_DB: db }, data: { session } });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.items[0].sales, undefined);
  assert.equal(db.calls.some(call => /product_sales_daily/i.test(call.sql)), false);
});
