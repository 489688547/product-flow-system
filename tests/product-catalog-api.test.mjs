import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as onCatalogRequest } from "../functions/api/platform/v1/product-catalog.js";
import { onRequest as onImportRequest } from "../functions/api/platform/v1/product-catalog/import.js";

function createD1Mock() {
  const items = new Map();
  const skus = new Map();
  const components = new Map();
  const runs = new Map();
  const meta = new Map();
  return {
    items,
    skus,
    components,
    runs,
    meta,
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
          } else if (/insert into product_catalog_meta/i.test(sql)) {
            meta.set(statement.values[0], statement.values[1]);
          } else if (/update product_catalog_items set present_in_source = 0/i.test(sql)) {
            const [source, syncedAt] = statement.values;
            for (const [id, row] of items) if (row.source === source && row.synced_at !== syncedAt) items.set(id, { ...row, present_in_source: 0 });
          }
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
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
}

const admin = { name: "数据管理员", role: "executive", department: "总经办" };
const productUser = { name: "产品同事", role: "product", department: "产品部" };
const finance = { name: "财务同事", role: "finance", department: "财务部" };

function request(url, method = "GET", body) {
  return new Request(`https://flow.example.com${url}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

const importPayload = {
  source: "kuaimai-file",
  fileName: "商品档案V2.xlsx",
  items: [{
    sourceProductId: "1001",
    merchantCode: "FCMZ",
    name: "发财毛毡",
    brand: "提野星",
    skus: [{ sourceSkuId: "2001", merchantSkuCode: "FCMZ-01", barcode: "6978705011208", purchasePrice: 9.5, salePrice: 19.9 }]
  }]
};

const bundlePayload = {
  source: "kuaimai",
  items: [{
    sourceProductId: "2001",
    merchantCode: "2DGZZ",
    name: "单个慕斯粽子*2",
    type: "2",
    components: [{ outerId: "1111", inventoryUnitCode: "1111", ratio: 2, purchasePrice: 2.5 }]
  }]
};

test("catalog API requires login and D1", async () => {
  const noSession = await onCatalogRequest({ request: request("/api/platform/v1/product-catalog"), env: { PRODUCT_FLOW_DB: createD1Mock() }, data: {} });
  assert.equal(noSession.status, 401);
  assert.equal((await noSession.json()).error.code, "AUTH_SESSION_REQUIRED");

  const noDb = await onCatalogRequest({ request: request("/api/platform/v1/product-catalog"), env: {}, data: { session: productUser } });
  assert.equal(noDb.status, 501);
});

test("only data administrators can import and readonly is always blocked", async () => {
  const db = createD1Mock();
  const forbidden = await onImportRequest({ request: request("/api/platform/v1/product-catalog/import", "POST", importPayload), env: { PRODUCT_FLOW_DB: db }, data: { session: productUser } });
  assert.equal(forbidden.status, 403);

  const readonly = await onImportRequest({ request: request("/api/platform/v1/product-catalog/import", "POST", importPayload), env: { PRODUCT_FLOW_DB: db }, data: { session: { ...admin, role: "readonly" } } });
  assert.equal(readonly.status, 403);
});

test("import is idempotent and employees read the same catalog", async () => {
  const db = createD1Mock();
  for (let index = 0; index < 2; index += 1) {
    const response = await onImportRequest({ request: request("/api/platform/v1/product-catalog/import", "POST", importPayload), env: { PRODUCT_FLOW_DB: db }, data: { session: admin } });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).counts.products, 1);
  }
  assert.equal(db.items.size, 1);
  assert.equal(db.skus.size, 1);

  const response = await onCatalogRequest({ request: request("/api/platform/v1/product-catalog"), env: { PRODUCT_FLOW_DB: db }, data: { session: productUser } });
  const payload = await response.json();
  assert.equal(payload.items[0].name, "发财毛毡");
  assert.equal(payload.items[0].skus[0].barcode, "6978705011208");
});

test("purchase cost is visible only to finance, supply and executives", async () => {
  const db = createD1Mock();
  await onImportRequest({ request: request("/api/platform/v1/product-catalog/import", "POST", importPayload), env: { PRODUCT_FLOW_DB: db }, data: { session: admin } });

  const productResponse = await onCatalogRequest({ request: request("/api/platform/v1/product-catalog"), env: { PRODUCT_FLOW_DB: db }, data: { session: productUser } });
  const productPayload = await productResponse.json();
  assert.equal(productPayload.items[0].skus[0].purchasePrice, undefined);

  const financeResponse = await onCatalogRequest({ request: request("/api/platform/v1/product-catalog"), env: { PRODUCT_FLOW_DB: db }, data: { session: finance } });
  assert.equal((await financeResponse.json()).items[0].skus[0].purchasePrice, 9.5);
});

test("component relationships replace by parent and redact component costs", async () => {
  const db = createD1Mock();
  await onImportRequest({ request: request("/api/platform/v1/product-catalog/import", "POST", bundlePayload), env: { PRODUCT_FLOW_DB: db }, data: { session: admin } });
  assert.equal(db.components.size, 1);

  const updated = structuredClone(bundlePayload);
  updated.items[0].components[0].ratio = 3;
  await onImportRequest({ request: request("/api/platform/v1/product-catalog/import", "POST", updated), env: { PRODUCT_FLOW_DB: db }, data: { session: admin } });
  assert.equal(db.components.size, 1);

  const productResponse = await onCatalogRequest({ request: request("/api/platform/v1/product-catalog"), env: { PRODUCT_FLOW_DB: db }, data: { session: productUser } });
  const productPayload = await productResponse.json();
  assert.equal(productPayload.items[0].components[0].ratio, 3);
  assert.equal(productPayload.items[0].components[0].purchasePrice, undefined);

  const financeResponse = await onCatalogRequest({ request: request("/api/platform/v1/product-catalog"), env: { PRODUCT_FLOW_DB: db }, data: { session: finance } });
  assert.equal((await financeResponse.json()).items[0].components[0].purchasePrice, 2.5);
});

test("invalid imports do not replace the last valid catalog", async () => {
  const db = createD1Mock();
  await onImportRequest({ request: request("/api/platform/v1/product-catalog/import", "POST", importPayload), env: { PRODUCT_FLOW_DB: db }, data: { session: admin } });
  const bad = await onImportRequest({ request: request("/api/platform/v1/product-catalog/import", "POST", { source: "kuaimai-file", items: [{ name: "无身份商品" }] }), env: { PRODUCT_FLOW_DB: db }, data: { session: admin } });
  assert.equal(bad.status, 400);
  assert.equal(db.items.size, 1);
  assert.equal([...db.items.values()][0].name, "发财毛毡");
});
