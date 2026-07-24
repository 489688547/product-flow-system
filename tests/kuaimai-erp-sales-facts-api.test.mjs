import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/platform/v1/erp-collection/sales-facts.js";
import { createErpCollectionD1Mock } from "./helpers/erp-collection-d1-mock.mjs";

const hash = "a".repeat(64);
const validBody = {
  batch: {
    platformId: "kuaimai",
    resourceType: "sales_items",
    sourceFileName: "销售主题分析.xlsx",
    contentHash: hash,
    rowCount: 9200,
    rangeStart: "2026-07-23T00:00:09+08:00",
    rangeEnd: "2026-07-23T23:59:39+08:00",
    status: "completed",
    collectedAt: "2026-07-24T06:50:00.000Z"
  },
  facts: [{
    code: "6978705011208",
    date: "2026-07-23",
    platform: "抖店(放心购)",
    qty: 3,
    sales: 59.7,
    netSales: 59.7,
    grossProfit: 35.7,
    refund: 0,
    cost: 24
  }],
  issues: []
};

test("projected sales endpoint writes standard facts without copying raw detail rows to D1", async () => {
  const db = createErpCollectionD1Mock();
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/erp-collection/sales-facts", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "sales-facts-20260723" },
      body: JSON.stringify(validBody)
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" } }
  });
  const payload = await response.json();

  assert.equal(response.status, 201);
  assert.equal(payload.data.status, "completed");
  assert.equal(payload.data.projection.sourceRecords, 9200);
  assert.equal(payload.data.projection.salesRows, 1);
  assert.equal(db.tables.erp_source_records.size, 0);
  assert.equal([...db.tables.erp_collection_batches.values()][0].row_count, 9200);
});

test("projected sales endpoint enforces session, role, idempotency and completed-batch validation", async () => {
  const db = createErpCollectionD1Mock();
  const call = async ({ session, body = validBody, idempotencyKey = "sales-facts-check" } = {}) => {
    const response = await onRequest({
      request: new Request("https://flow.example.com/api/platform/v1/erp-collection/sales-facts", {
        method: "POST",
        headers: { "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) },
        body: JSON.stringify(body)
      }),
      env: { PRODUCT_FLOW_DB: db },
      data: session ? { session } : {}
    });
    return { response, payload: await response.json() };
  };

  assert.equal((await call()).response.status, 401);
  assert.equal((await call({ session: { userId: "product-1", department: "产品部" } })).response.status, 403);
  assert.equal((await call({
    session: { userId: "exec-1", role: "executive", department: "总经办" },
    idempotencyKey: ""
  })).payload.error.code, "ERP_COLLECTION_IDEMPOTENCY_KEY_REQUIRED");
  const partial = await call({
    session: { userId: "exec-1", role: "executive", department: "总经办" },
    body: { ...validBody, batch: { ...validBody.batch, status: "partial" } }
  });
  assert.equal(partial.response.status, 400);
  assert.equal(partial.payload.error.code, "ERP_COLLECTION_BATCH_PARTIAL");
});

function createSalesDbMock() {
  const bound = [];
  return {
    bound,
    prepare(sql) {
      const entry = { sql, bindings: [] };
      const statement = {
        bind(...values) {
          entry.bindings = values;
          bound.push(entry);
          return statement;
        },
        async run() { return { success: true }; },
        async first() { return null; },
        async all() { return { results: [] }; }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
}

function salesStatements(db, pattern) {
  return db.bound.filter(entry => pattern.test(entry.sql));
}

test("chunked sales facts rewrite dates once on the first pack and insert-only afterwards", async () => {
  const controlDb = createErpCollectionD1Mock();
  const businessDb = createSalesDbMock();
  const session = { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" };
  const post = body => onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/erp-collection/sales-facts", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `batch:projected-sales:${body.chunk.index}` },
      body: JSON.stringify(body)
    }),
    env: { PRODUCT_FLOW_DB: controlDb },
    data: { session, businessDb }
  });

  const firstBody = {
    ...validBody,
    facts: [{ ...validBody.facts[0], date: "2026-07-23" }],
    chunk: { index: 1, total: 2 },
    replaceDates: ["2026-07-23", "2026-07-24"]
  };
  const first = await post(firstBody);
  const firstPayload = await first.json();
  assert.equal(first.status, 201);
  assert.equal(firstPayload.data.status, "pending");
  // 首包按完整日期列表删除（含次日），再插入本包事实。
  assert.deepEqual(
    salesStatements(businessDb, /DELETE FROM product_sales_daily WHERE date = \?/).map(entry => entry.bindings[0]),
    ["2026-07-23", "2026-07-24"]
  );
  assert.equal(salesStatements(businessDb, /INSERT INTO product_sales_daily/).length, 1);
  assert.equal([...controlDb.tables.erp_collection_batches.values()][0].status, "pending");

  const second = await post({
    ...validBody,
    facts: [{ ...validBody.facts[0], date: "2026-07-24" }],
    chunk: { index: 2, total: 2 }
  });
  const secondPayload = await second.json();
  assert.equal(second.status, 200);
  assert.equal(secondPayload.data.status, "completed");
  // 后续包只做幂等插入，不再删除，避免把首包已写的数据删掉。
  assert.equal(salesStatements(businessDb, /DELETE FROM product_sales_daily WHERE date = \?/).length, 2);
  assert.equal(salesStatements(businessDb, /INSERT INTO product_sales_daily/).length, 2);
  assert.equal([...controlDb.tables.erp_collection_batches.values()][0].status, "completed");
});

test("chunked sales facts reject a multi-pack first pack without rewrite dates", async () => {
  const db = createErpCollectionD1Mock();
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/erp-collection/sales-facts", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "batch:projected-sales:1" },
      body: JSON.stringify({ ...validBody, chunk: { index: 1, total: 2 } })
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" } }
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.error.code, "ERP_COLLECTION_SALES_FACTS_DATES_REQUIRED");
});
