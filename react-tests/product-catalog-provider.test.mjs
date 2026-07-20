import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  importProductCatalog,
  loadProductCatalog,
  productCatalogApiUrl,
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

test("catalog client loads, imports and synchronizes through one boundary", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ synced: true, items: [{ id: "p1" }], meta: { products: 1 } }), { status: 200 });
  };
  assert.equal((await loadProductCatalog(fetchImpl)).items.length, 1);
  await importProductCatalog({ source: "kuaimai-file", items: [{ merchantCode: "A1" }] }, fetchImpl);
  await syncKuaimaiProductCatalog(fetchImpl);
  assert.deepEqual(calls.map(call => call.url), [productCatalogApiUrl(), productCatalogImportUrl(), productCatalogSyncUrl()]);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[2].options.method, "POST");
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
});
