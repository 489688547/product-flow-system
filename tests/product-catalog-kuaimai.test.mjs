import test from "node:test";
import assert from "node:assert/strict";
import { pullKuaimaiProductCatalog } from "../functions/api/kuaimai/_shared/kuaimai.js";
import { onRequest } from "../functions/api/platform/v1/product-catalog/sync/kuaimai.js";

function item(index) {
  return {
    sysItemId: index,
    outerId: `ITEM-${index}`,
    title: `商品 ${index}`,
    items: [{ sysSkuId: index * 10, skuOuterId: `SKU-${index}`, barcode: `69${String(index).padStart(11, "0")}` }]
  };
}

function kuaimaiFetch(pages, calls) {
  return async (_url, options) => {
    const params = new URLSearchParams(options.body);
    calls.push(Object.fromEntries(params.entries()));
    const page = Number(params.get("pageNo"));
    const payload = pages[page];
    if (payload instanceof Error) return new Response(JSON.stringify({ success: false, code: "20103", msg: payload.message }), { status: 200 });
    return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
  };
}

const config = { appKey: "app", appSecret: "secret", accessToken: "token", ready: true };

test("pulls every Kuaimai product page up to the reported total", async () => {
  const calls = [];
  const result = await pullKuaimaiProductCatalog(config, { pageSize: 200, maxPages: 5 }, kuaimaiFetch({
    1: { success: true, total: 298, items: Array.from({ length: 200 }, (_, index) => item(index + 1)) },
    2: { success: true, total: 298, body: JSON.stringify({ items: Array.from({ length: 98 }, (_, index) => item(index + 201)) }) }
  }, calls));

  assert.equal(result.items.length, 298);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.total, 298);
  assert.equal(result.complete, true);
  assert.deepEqual(calls.map(call => call.method), ["item.list.query", "item.list.query"]);
  assert.deepEqual(calls.map(call => call.pageNo), ["1", "2"]);
  assert.ok(calls.every(call => call.pageSize === "200"));
});

test("provider failure and page guard never return a complete catalog", async () => {
  await assert.rejects(
    pullKuaimaiProductCatalog(config, { pageSize: 200, maxPages: 5 }, kuaimaiFetch({ 1: new Error("商品权限不足") }, [])),
    /商品权限不足/
  );

  const result = await pullKuaimaiProductCatalog(config, { pageSize: 1, maxPages: 1 }, kuaimaiFetch({
    1: { success: true, total: 2, items: [item(1)] }
  }, []));
  assert.equal(result.complete, false);
  assert.equal(result.nextPage, 2);
});

function createD1Mock() {
  const items = new Map();
  const skus = new Map();
  const meta = new Map();
  return {
    items,
    meta,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() {
          if (/insert into product_catalog_items/i.test(sql)) items.set(statement.values[0], { id: statement.values[0] });
          else if (/insert into product_catalog_skus/i.test(sql)) skus.set(statement.values[0], { id: statement.values[0] });
          else if (/insert into product_catalog_meta/i.test(sql)) meta.set(statement.values[0], statement.values[1]);
          return { success: true };
        },
        async all() { return { results: [] }; },
        async first() { return null; }
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
}

test("sync endpoint validates editor and only commits a complete pull", async () => {
  const db = createD1Mock();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = kuaimaiFetch({ 1: { success: true, total: 1, items: [item(1)] } }, []);
    const response = await onRequest({
      request: new Request("https://flow.example.com/api/platform/v1/product-catalog/sync/kuaimai", { method: "POST" }),
      env: { PRODUCT_FLOW_DB: db, KUAIMAI_APP_KEY: "app", KUAIMAI_APP_SECRET: "secret", KUAIMAI_ACCESS_TOKEN: "token" },
      data: { session: { name: "数据管理员", role: "executive", department: "总经办" } }
    });
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.counts.products, 1);
    assert.equal(db.items.size, 1);
    assert.ok(db.meta.get("lastSuccessfulSyncAt"));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sync endpoint leaves storage untouched when Kuaimai fails", async () => {
  const db = createD1Mock();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = kuaimaiFetch({ 1: new Error("应用没有商品读取权限") }, []);
    const response = await onRequest({
      request: new Request("https://flow.example.com/api/platform/v1/product-catalog/sync/kuaimai", { method: "POST" }),
      env: { PRODUCT_FLOW_DB: db, KUAIMAI_APP_KEY: "app", KUAIMAI_APP_SECRET: "secret", KUAIMAI_ACCESS_TOKEN: "token" },
      data: { session: { name: "数据管理员", role: "executive", department: "总经办" } }
    });
    assert.equal(response.status, 502);
    assert.equal(db.items.size, 0);
    assert.equal(db.meta.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
