import test from "node:test";
import assert from "node:assert/strict";
import { pullKuaimaiProductCatalog, pullKuaimaiProductDetails } from "../functions/api/kuaimai/_shared/kuaimai.js";
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

test("reads only bundle details in bounded cursor batches", async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const params = new URLSearchParams(options.body);
    calls.push(Object.fromEntries(params.entries()));
    const sysItemId = params.get("sysItemId");
    return new Response(JSON.stringify({
      success: true,
      item: {
        sysItemId: Number(sysItemId),
        outerId: sysItemId === "1" ? "2DGZZ" : "BYMSDHBD",
        suitSingleList: sysItemId === "1"
          ? [{ outerId: "1111", ratio: 2 }]
          : [{ outerId: "6978705011727", ratio: 1 }, { outerId: "6977173969059", ratio: 1 }]
      }
    }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const candidates = [
    { sysItemId: 1, outerId: "2DGZZ", type: "2" },
    { sysItemId: 9, outerId: "NORMAL", type: "0", typeTag: 0 },
    { sysItemId: 2, outerId: "BYMSDHBD", type: "0", typeTag: 3 }
  ];

  const first = await pullKuaimaiProductDetails(config, candidates, { cursor: 0, maxDetails: 1 }, fetchImpl);
  assert.equal(first.details.length, 1);
  assert.equal(first.details[0].suitSingleList[0].ratio, 2);
  assert.equal(first.totalCandidates, 2);
  assert.equal(first.nextCursor, 1);
  assert.equal(first.complete, false);
  assert.deepEqual(calls.map(call => call.method), ["item.single.get"]);
  assert.equal(calls[0].sysItemId, "1");

  const second = await pullKuaimaiProductDetails(config, candidates, { cursor: first.nextCursor, maxDetails: 30 }, fetchImpl);
  assert.equal(second.details.length, 1);
  assert.equal(second.details[0].suitSingleList.length, 2);
  assert.equal(second.nextCursor, null);
  assert.equal(second.complete, true);
});

test("keeps detail failures safe and resumable", async () => {
  const result = await pullKuaimaiProductDetails(config, [
    { sysItemId: 1, outerId: "BROKEN", type: "1" },
    { sysItemId: 2, outerId: "WORKS", type: "2" }
  ], { maxDetails: 30 }, async (_url, options) => {
    const params = new URLSearchParams(options.body);
    if (params.get("sysItemId") === "1") {
      return new Response(JSON.stringify({ success: false, code: "20103", msg: "商品权限不足" }), { status: 200 });
    }
    return new Response(JSON.stringify({ success: true, item: { sysItemId: 2, outerId: "WORKS", suitSingleList: [{ outerId: "1111", ratio: 2 }] } }), { status: 200 });
  });

  assert.equal(result.complete, true);
  assert.equal(result.details.length, 1);
  assert.deepEqual(result.failures, [{ sourceProductId: "1", merchantCode: "BROKEN", code: "20103", message: "快麦商品详情读取失败。" }]);
});

test("bundle detail reads use bounded concurrency", async () => {
  let active = 0;
  let maxActive = 0;
  const candidates = Array.from({ length: 12 }, (_, index) => ({
    sysItemId: index + 1,
    outerId: `BUNDLE-${index + 1}`,
    type: "2"
  }));
  const result = await pullKuaimaiProductDetails(config, candidates, { maxDetails: 30 }, async (_url, options) => {
    const params = new URLSearchParams(options.body);
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise(resolve => setTimeout(resolve, 2));
    active -= 1;
    const sysItemId = Number(params.get("sysItemId"));
    return new Response(JSON.stringify({ success: true, item: { sysItemId, outerId: `BUNDLE-${sysItemId}`, suitSingleList: [] } }), { status: 200 });
  });

  assert.equal(result.details.length, 12);
  assert.ok(maxActive > 1);
  assert.ok(maxActive <= 5);
});

test("bundle cursors keep the same identity order across provider and stored catalog shapes", async () => {
  const calls = [];
  const fetchImpl = async (_url, options) => {
    const params = new URLSearchParams(options.body);
    calls.push(params.get("sysItemId"));
    const sysItemId = Number(params.get("sysItemId"));
    return new Response(JSON.stringify({ success: true, item: { sysItemId, outerId: `BUNDLE-${sysItemId}`, suitSingleList: [] } }), { status: 200 });
  };
  const providerItems = [
    { sysItemId: 30, outerId: "BUNDLE-30", type: "2" },
    { sysItemId: 10, outerId: "BUNDLE-10", type: "2" },
    { sysItemId: 20, outerId: "BUNDLE-20", type: "2" }
  ];
  const storedItems = [
    { sourceProductId: "20", merchantCode: "BUNDLE-20", type: "2" },
    { sourceProductId: "30", merchantCode: "BUNDLE-30", type: "2" },
    { sourceProductId: "10", merchantCode: "BUNDLE-10", type: "2" }
  ];

  const first = await pullKuaimaiProductDetails(config, providerItems, { cursor: 0, maxDetails: 1 }, fetchImpl);
  const second = await pullKuaimaiProductDetails(config, storedItems, { cursor: first.nextCursor, maxDetails: 1 }, fetchImpl);

  assert.deepEqual(calls, ["10", "20"]);
  assert.equal(second.nextCursor, 2);
});

function createD1Mock() {
  const items = new Map();
  const skus = new Map();
  const components = new Map();
  const runs = new Map();
  const meta = new Map();
  let batchCalls = 0;
  return {
    items,
    components,
    meta,
    get batchCalls() { return batchCalls; },
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() {
          if (/insert into product_catalog_items/i.test(sql)) {
            const [id, source, sourceProductId, merchantCode, name, payload, active, present, syncedAt, updatedAt, updatedBy] = statement.values;
            items.set(id, { id, source, source_product_id: sourceProductId, merchant_code: merchantCode, name, payload, active, present_in_source: present, synced_at: syncedAt, updated_at: updatedAt, updated_by: updatedBy });
          } else if (/insert into product_catalog_skus/i.test(sql)) {
            const [id, itemId, source, sourceSkuId, merchantSkuCode, barcode, payload, active, syncedAt, updatedAt, updatedBy] = statement.values;
            skus.set(id, { id, item_id: itemId, source, source_sku_id: sourceSkuId, merchant_sku_code: merchantSkuCode, barcode, payload, active, synced_at: syncedAt, updated_at: updatedAt, updated_by: updatedBy });
          } else if (/insert into product_catalog_components/i.test(sql)) {
            const [id, parentItemId, source, componentCode, ratio, payload, syncedAt, updatedAt, updatedBy] = statement.values;
            components.set(id, { id, parent_item_id: parentItemId, source, component_code: componentCode, ratio, payload, synced_at: syncedAt, updated_at: updatedAt, updated_by: updatedBy });
          } else if (/delete from product_catalog_components where parent_item_id/i.test(sql)) {
            for (const [id, row] of components) if (row.parent_item_id === statement.values[0]) components.delete(id);
          } else if (/insert into product_catalog_sync_runs/i.test(sql)) {
            const [id, source, mode, status, payload, startedAt, completedAt, updatedBy] = statement.values;
            runs.set(id, { id, source, mode, status, payload, started_at: startedAt, completed_at: completedAt, updated_by: updatedBy });
          }
          else if (/insert into product_catalog_meta/i.test(sql)) meta.set(statement.values[0], statement.values[1]);
          return { success: true };
        },
        async all() {
          if (/from product_catalog_items/i.test(sql)) return { results: [...items.values()] };
          if (/from product_catalog_skus/i.test(sql)) return { results: [...skus.values()] };
          if (/from product_catalog_components/i.test(sql)) return { results: [...components.values()] };
          if (/from product_catalog_sync_runs/i.test(sql)) return { results: [...runs.values()] };
          return { results: [] };
        },
        async first() {
          if (/from product_catalog_meta/i.test(sql)) return meta.has(statement.values[0]) ? { value: meta.get(statement.values[0]) } : null;
          return null;
        }
      };
      return statement;
    },
    async batch(statements) { batchCalls += 1; return Promise.all(statements.map(statement => statement.run())); }
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

test("sync endpoint reads and persists bundle component ratios", async () => {
  const db = createD1Mock();
  const calls = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const params = new URLSearchParams(options.body);
      calls.push(Object.fromEntries(params.entries()));
      if (params.get("method") === "item.list.query") {
        return new Response(JSON.stringify({
          success: true,
          total: 1,
          items: [{ sysItemId: 2, outerId: "2DGZZ", title: "单个慕斯粽子*2", type: "2", items: [] }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({
        success: true,
        item: {
          sysItemId: 2,
          outerId: "2DGZZ",
          title: "单个慕斯粽子*2",
          type: "2",
          suitSingleList: [{ outerId: "1111", ratio: 2, purchasePrice: 2.5 }]
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    };
    const response = await onRequest({
      request: new Request("https://flow.example.com/api/platform/v1/product-catalog/sync/kuaimai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cursor: 0 })
      }),
      env: { PRODUCT_FLOW_DB: db, KUAIMAI_APP_KEY: "app", KUAIMAI_APP_SECRET: "secret", KUAIMAI_ACCESS_TOKEN: "token" },
      data: { session: { name: "数据管理员", role: "executive", department: "总经办" } }
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.complete, true);
    assert.equal(payload.nextCursor, null);
    assert.equal(payload.progress.totalCandidates, 1);
    assert.equal(payload.progress.components, 1);
    assert.equal(db.components.size, 1);
    assert.equal(JSON.parse([...db.components.values()][0].payload).inventoryUnitCode, "1111");
    assert.deepEqual(calls.map(call => call.method), ["item.list.query", "item.single.get"]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("continuation batches reuse the stored catalog instead of rewriting every product", async () => {
  const db = createD1Mock();
  const calls = [];
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (_url, options) => {
      const params = new URLSearchParams(options.body);
      calls.push(Object.fromEntries(params.entries()));
      if (params.get("method") === "item.list.query") {
        const uniqueItems = Array.from({ length: 31 }, (_, index) => ({
          sysItemId: index + 1,
          outerId: `BUNDLE-${index + 1}`,
          title: `组合商品 ${index + 1}`,
          type: "2",
          items: []
        }));
        return new Response(JSON.stringify({
          success: true,
          total: 32,
          items: [...uniqueItems, { ...uniqueItems[0], sysItemId: 999 }]
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      const sysItemId = Number(params.get("sysItemId"));
      return new Response(JSON.stringify({
        success: true,
        item: {
          sysItemId,
          outerId: `BUNDLE-${sysItemId}`,
          title: `组合商品 ${sysItemId}`,
          type: "2",
          suitSingleList: [{ outerId: `UNIT-${sysItemId}`, ratio: 1 }]
        }
      }), { status: 200, headers: { "content-type": "application/json" } });
    };

    const firstResponse = await onRequest({
      request: new Request("https://flow.example.com/api/platform/v1/product-catalog/sync/kuaimai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cursor: 0 })
      }),
      env: { PRODUCT_FLOW_DB: db, KUAIMAI_APP_KEY: "app", KUAIMAI_APP_SECRET: "secret", KUAIMAI_ACCESS_TOKEN: "token" },
      data: { session: { name: "数据管理员", role: "executive", department: "总经办" } }
    });
    const first = await firstResponse.json();
    assert.equal(first.complete, false);
    assert.equal(first.nextCursor, 30);
    assert.equal(first.progress.totalCandidates, 31);

    const secondResponse = await onRequest({
      request: new Request("https://flow.example.com/api/platform/v1/product-catalog/sync/kuaimai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cursor: first.nextCursor })
      }),
      env: { PRODUCT_FLOW_DB: db, KUAIMAI_APP_KEY: "app", KUAIMAI_APP_SECRET: "secret", KUAIMAI_ACCESS_TOKEN: "token" },
      data: { session: { name: "数据管理员", role: "executive", department: "总经办" } }
    });
    const second = await secondResponse.json();

    assert.equal(second.complete, true);
    assert.equal(second.progress.totalCandidates, 31);
    assert.equal(calls.filter(call => call.method === "item.list.query").length, 1);
    assert.equal(calls.filter(call => call.method === "item.single.get").length, 31);
    assert.ok(db.batchCalls <= 6, `expected batched component writes, received ${db.batchCalls} D1 batches`);
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
