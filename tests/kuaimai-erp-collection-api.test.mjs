import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/platform/v1/erp-collection/ingest.js";
import { createErpCollectionD1Mock } from "./helpers/erp-collection-d1-mock.mjs";

const hash = "a".repeat(64);
const sessions = {
  executive: { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" },
  data: { userId: "data-1", name: "数据同事", department: "数据中心" },
  product: { userId: "product-1", name: "产品同事", department: "产品部" }
};

const body = {
  batch: {
    platformId: "kuaimai",
    resourceType: "orders",
    sourceFileName: "订单.xlsx",
    contentHash: hash,
    rowCount: 1,
    collectedAt: "2026-07-22T08:00:00.000Z"
  },
  records: [{
    sourceKey: "order-1001",
    occurredAt: "2026-07-01T10:00:00+08:00",
    contentHash: "b".repeat(64),
    payload: { 系统订单号: "order-1001", 创建时间: "2026-07-01 10:00:00" }
  }],
  issues: []
};

async function call({ session, db, payload = body, headers = {}, method = "POST" } = {}) {
  const request = new Request("https://flow.example.com/api/platform/v1/erp-collection/ingest", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(payload) : undefined
  });
  const response = await onRequest({ request, env: db ? { PRODUCT_FLOW_DB: db } : {}, data: session ? { session } : {} });
  return { response, body: await response.json() };
}

test("ERP collection ingest requires session, permission, D1 and idempotency", async () => {
  const db = createErpCollectionD1Mock();
  assert.equal((await call({ db, headers: { "idempotency-key": "batch-1" } })).response.status, 401);
  assert.equal((await call({ session: sessions.product, db, headers: { "idempotency-key": "batch-1" } })).response.status, 403);
  assert.equal((await call({ session: sessions.data, headers: { "idempotency-key": "batch-1" } })).body.error.code, "ERP_COLLECTION_STORAGE_UNAVAILABLE");
  assert.equal((await call({ session: sessions.data, db })).body.error.code, "ERP_COLLECTION_IDEMPOTENCY_KEY_REQUIRED");
});

test("ERP collection ingest creates a batch and writes source records", async () => {
  const db = createErpCollectionD1Mock();
  const result = await call({ session: sessions.data, db, headers: { "idempotency-key": "batch-1" } });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.data.counts.inserted, 1);
  assert.equal(result.body.data.counts.updated, 0);
  assert.equal(result.body.data.counts.unchanged, 0);
  assert.equal(db.tables.erp_collection_batches.size, 1);
  assert.equal(db.tables.erp_source_records.size, 1);
  assert.equal(JSON.parse([...db.tables.erp_source_records.values()][0].payload).系统订单号, "order-1001");
});

test("ERP collection ingest is idempotent and updates a changed source record", async () => {
  const db = createErpCollectionD1Mock();
  await call({ session: sessions.executive, db, headers: { "idempotency-key": "batch-1" } });
  const repeated = await call({ session: sessions.executive, db, headers: { "idempotency-key": "batch-1-repeat" } });
  assert.equal(repeated.body.data.counts.unchanged, 1);
  assert.equal(db.tables.erp_source_records.size, 1);

  const changed = structuredClone(body);
  changed.batch.contentHash = "c".repeat(64);
  changed.records[0].contentHash = "d".repeat(64);
  changed.records[0].payload.订单状态 = "已完成";
  const updated = await call({ session: sessions.executive, db, payload: changed, headers: { "idempotency-key": "batch-2" } });
  assert.equal(updated.body.data.counts.updated, 1);
  assert.equal(db.tables.erp_collection_batches.size, 2);
  assert.equal(db.tables.erp_source_records.size, 1);
});

test("ERP collection ingest returns stable validation and method errors", async () => {
  const db = createErpCollectionD1Mock();
  const invalid = await call({ session: sessions.data, db, payload: { ...body, records: [] }, headers: { "idempotency-key": "bad" } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, "ERP_COLLECTION_RECORDS_REQUIRED");
  assert.equal((await call({ session: sessions.data, db, method: "GET" })).response.status, 405);
});
