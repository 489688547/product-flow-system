import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/platform/v1/product-catalog/sales-mappings.js";

const editor = { name: "运营同事", userId: "user-1", role: "operator", department: "运营部" };
const readonly = { name: "只读同事", userId: "user-2", role: "readonly", department: "运营部" };

function mappingDb() {
  const products = new Map([["product-1", { id: "product-1", active: 1, present_in_source: 1 }]]);
  const mappings = new Map();
  const audits = [];
  return {
    mappings,
    audits,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async first() {
          if (/from product_catalog_items/i.test(sql)) return products.get(statement.values[0]) || null;
          if (/from product_catalog_sales_mappings/i.test(sql)) return mappings.get(statement.values[0]) || null;
          return null;
        },
        async run() {
          if (/insert into product_catalog_sales_mappings/i.test(sql)) {
            const [code, productId, active, version, createdAt, createdBy, updatedAt, updatedBy] = statement.values;
            const previous = mappings.get(code);
            mappings.set(code, {
              code,
              product_id: productId,
              active,
              version,
              created_at: previous?.created_at || createdAt,
              created_by: previous?.created_by || createdBy,
              updated_at: updatedAt,
              updated_by: updatedBy
            });
          }
          if (/insert into product_catalog_sales_mapping_audit/i.test(sql)) {
            const [id, code, productId, action, version, actor, createdAt] = statement.values;
            audits.push({ id, code, product_id: productId, action, version, actor, created_at: createdAt });
          }
          return { success: true };
        }
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
}

function request(method, body) {
  return new Request("https://flow.example.com/api/platform/v1/product-catalog/sales-mappings", {
    method,
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });
}

test("catalog editor can create and revoke a sales-code mapping without changing SKU data", async () => {
  const db = mappingDb();
  const created = await onRequest({
    request: request("POST", { code: "UNMATCHED", productId: "product-1", expectedVersion: 0 }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: editor }
  });
  const createdPayload = await created.json();

  assert.equal(created.status, 200);
  assert.equal(createdPayload.mapping.code, "UNMATCHED");
  assert.equal(createdPayload.mapping.productId, "product-1");
  assert.equal(createdPayload.mapping.version, 1);
  assert.equal(db.audits[0].action, "mapped");

  const revoked = await onRequest({
    request: request("DELETE", { code: "UNMATCHED", expectedVersion: 1 }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: editor }
  });
  const revokedPayload = await revoked.json();
  assert.equal(revoked.status, 200);
  assert.equal(revokedPayload.mapping.active, false);
  assert.equal(revokedPayload.mapping.version, 2);
  assert.equal(db.audits[1].action, "revoked");
});

test("sales-code mapping rejects readonly users, missing products and stale versions", async () => {
  const forbidden = await onRequest({
    request: request("POST", { code: "UNMATCHED", productId: "product-1", expectedVersion: 0 }),
    env: { PRODUCT_FLOW_DB: mappingDb() },
    data: { session: readonly }
  });
  assert.equal(forbidden.status, 403);

  const missing = await onRequest({
    request: request("POST", { code: "UNMATCHED", productId: "missing", expectedVersion: 0 }),
    env: { PRODUCT_FLOW_DB: mappingDb() },
    data: { session: editor }
  });
  assert.equal(missing.status, 404);

  const db = mappingDb();
  await onRequest({
    request: request("POST", { code: "UNMATCHED", productId: "product-1", expectedVersion: 0 }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: editor }
  });
  const conflict = await onRequest({
    request: request("POST", { code: "UNMATCHED", productId: "product-1", expectedVersion: 0 }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: editor }
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "PRODUCT_CATALOG_SALES_MAPPING_VERSION_CONFLICT");
});
