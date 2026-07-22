import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  importProductCatalog,
  loadProductCatalog,
  productCatalogApiUrl,
  productCatalogQueryUrl,
  productCatalogImportUrl,
  productCatalogSyncUrl,
  syncKuaimaiProductCatalog
} from "../src/state/productCatalogApi.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("product catalog client uses stable platform v1 routes", () => {
  assert.equal(productCatalogApiUrl(), "/api/platform/v1/product-catalog");
  assert.equal(productCatalogImportUrl(), "/api/platform/v1/product-catalog/import");
  assert.equal(productCatalogSyncUrl(), "/api/platform/v1/product-catalog/sync/kuaimai");
});

test("product catalog client encodes the persisted sales range and platform", async () => {
  assert.equal(productCatalogQueryUrl({ from: "2026-07-01", to: "2026-07-20", platform: "抖音" }), "/api/platform/v1/product-catalog?from=2026-07-01&to=2026-07-20&platform=%E6%8A%96%E9%9F%B3");
  assert.equal(productCatalogQueryUrl(), productCatalogApiUrl());
  const calls = [];
  await loadProductCatalog({ from: "2026-07-01", to: "2026-07-20", platform: "天猫" }, async url => {
    calls.push(url);
    return new Response(JSON.stringify({ synced: true, items: [], meta: {} }), { status: 200 });
  });
  assert.equal(calls[0], "/api/platform/v1/product-catalog?from=2026-07-01&to=2026-07-20&platform=%E5%A4%A9%E7%8C%AB");
});

test("catalog client loads, imports and synchronizes through one boundary", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (url !== productCatalogSyncUrl()) {
      return new Response(JSON.stringify({ synced: true, items: [{ id: "p1" }], meta: { products: 1 } }), { status: 200 });
    }
    const cursor = JSON.parse(options.body).cursor;
    return new Response(JSON.stringify(cursor === 0
      ? { synced: true, complete: false, nextCursor: 30, progress: { processed: 30, totalCandidates: 31, components: 30 } }
      : { synced: true, complete: true, nextCursor: null, progress: { processed: 31, totalCandidates: 31, components: 2 } }), { status: 200 });
  };
  const progress = [];
  assert.equal((await loadProductCatalog(fetchImpl)).items.length, 1);
  await importProductCatalog({ source: "kuaimai-file", items: [{ merchantCode: "A1" }] }, fetchImpl);
  const synced = await syncKuaimaiProductCatalog(fetchImpl, update => progress.push(update));
  assert.deepEqual(calls.map(call => call.url), [productCatalogApiUrl(), productCatalogImportUrl(), productCatalogSyncUrl(), productCatalogSyncUrl()]);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[2].options.method, "POST");
  assert.deepEqual(calls.slice(2).map(call => JSON.parse(call.options.body).cursor), [0, 30]);
  assert.deepEqual(progress.map(update => update.processed), [30, 31]);
  assert.equal(synced.progress.components, 32);
});

test("catalog client treats an unsynced successful read as an empty catalog", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({
    synced: false,
    items: [],
    runs: [],
    meta: { products: 0, lastSuccessfulSyncAt: "" }
  }), { status: 200 });
  const payload = await loadProductCatalog(fetchImpl);
  assert.equal(payload.synced, false);
  assert.deepEqual(payload.items, []);
});

test("catalog client rejects an invalid successful read payload", async () => {
  await assert.rejects(
    () => loadProductCatalog(async () => new Response(JSON.stringify({}), { status: 200 })),
    /商品主数据加载失败/
  );
});

test("catalog client preserves server error code and retryability", async () => {
  const fetchImpl = async () => new Response(JSON.stringify({ message: "快麦权限不足", error: { code: "KUAIMAI_PRODUCT_SYNC_FAILED", retryable: true } }), { status: 502 });
  await assert.rejects(async () => {
    try {
      await syncKuaimaiProductCatalog(fetchImpl);
    } catch (error) {
      assert.equal(error.code, "KUAIMAI_PRODUCT_SYNC_FAILED");
      assert.equal(error.retryable, true);
      throw error;
    }
  }, /快麦权限不足/);
});

test("authenticated app mounts one shared catalog provider above every business provider", () => {
  const main = read("src/main.jsx");
  const provider = read("src/state/ProductCatalogProvider.jsx");
  assert.match(main, /<ProductCatalogProvider>[\s\S]*<ProductFlowProvider>[\s\S]*<DataCenterProvider[\s\S]*<SupplyChainProvider/);
  assert.match(provider, /export function useProductCatalog/);
  assert.match(provider, /items,[\s\S]*meta,[\s\S]*refresh,[\s\S]*importRows,[\s\S]*syncKuaimai/);
  assert.match(provider, /salesQuery,[\s\S]*setSalesQuery,[\s\S]*salesLoading/);
  assert.match(provider, /requestSequence/);
});
