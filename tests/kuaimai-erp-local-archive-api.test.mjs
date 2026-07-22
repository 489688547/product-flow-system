import assert from "node:assert/strict";
import test from "node:test";
import { onRequest as onArchives } from "../functions/api/platform/v1/erp-collection/archives.js";
import { onRequest as onIngest } from "../functions/api/platform/v1/erp-collection/ingest.js";
import { onRequest as onRunners } from "../functions/api/platform/v1/erp-collection/runners.js";
import { createErpCollectionD1Mock } from "./helpers/erp-collection-d1-mock.mjs";

const session = { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" };
const fileHash = "a".repeat(64);

async function jsonCall(handler, url, { method = "GET", db, session: actor, headers = {}, body } = {}) {
  const request = new Request(url, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const response = await handler({ request, env: db ? { PRODUCT_FLOW_DB: db } : {}, data: actor ? { session: actor } : {} });
  return { response, body: await response.json() };
}

test("executive registers a one-time fixed-scope collector token stored as a hash", async () => {
  const db = createErpCollectionD1Mock();
  const result = await jsonCall(onRunners, "https://flow.example.com/api/platform/v1/erp-collection/runners", {
    method: "POST",
    db,
    session,
    body: { name: "公司 Mac 快麦采集器" }
  });
  assert.equal(result.response.status, 201);
  assert.match(result.body.data.token, /^kec_[a-f0-9]{48}$/);
  assert.equal(result.body.data.scope, "kuaimai_erp_ingest");
  const stored = [...db.tables.erp_collector_tokens.values()][0];
  assert.equal(stored.scope, "kuaimai_erp_ingest");
  assert.equal(stored.token_hash.length, 64);
  assert.equal(JSON.stringify(stored).includes(result.body.data.token), false);
});

test("collector token can ingest an archive and archives endpoint omits absolute paths", async () => {
  const db = createErpCollectionD1Mock();
  const registered = await jsonCall(onRunners, "https://flow.example.com/api/platform/v1/erp-collection/runners", {
    method: "POST", db, session, body: { name: "公司 Mac" }
  });
  const token = registered.body.data.token;
  const payload = {
    archive: {
      platformId: "kuaimai",
      resourceType: "orders",
      contentHash: fileHash,
      fileName: "交易订单.xlsx",
      sizeBytes: 1024,
      relativePath: "原始归档/orders/2026-07/aaa__交易订单.xlsx",
      storageType: "local_desktop",
      runnerId: registered.body.data.id,
      status: "archived",
      absolutePath: "/Users/secret/Desktop/交易订单.xlsx"
    },
    batch: {
      platformId: "kuaimai",
      resourceType: "orders",
      sourceFileName: "交易订单.xlsx",
      contentHash: fileHash,
      rowCount: 1,
      collectedAt: "2026-07-22T08:00:00.000Z"
    },
    records: [{
      sourceKey: "order-1",
      occurredAt: "2026-07-01T10:00:00+08:00",
      contentHash: "b".repeat(64),
      payload: { 系统订单号: "order-1", 创建时间: "2026-07-01 10:00:00", 收件人: "不应上传" }
    }],
    issues: []
  };
  const rejected = await jsonCall(onIngest, "https://flow.example.com/api/platform/v1/erp-collection/ingest", {
    method: "POST", db, headers: { authorization: `Bearer ${token}`, "idempotency-key": "archive-1" }, body: payload
  });
  assert.equal(rejected.body.error.code, "ERP_COLLECTION_PERSONAL_DATA_FIELD");
  delete payload.records[0].payload.收件人;
  const ingested = await jsonCall(onIngest, "https://flow.example.com/api/platform/v1/erp-collection/ingest", {
    method: "POST", db, headers: { authorization: `Bearer ${token}`, "idempotency-key": "archive-1" }, body: payload
  });
  assert.equal(ingested.response.status, 201);
  assert.equal(db.tables.erp_file_archives.size, 1);
  assert.equal([...db.tables.erp_collection_batches.values()][0].archive_id, ingested.body.data.archiveId);
  assert.deepEqual(JSON.parse([...db.tables.erp_source_records.values()][0].payload), { sourceOrderId: "order-1" });

  const listed = await jsonCall(onArchives, "https://flow.example.com/api/platform/v1/erp-collection/archives", { db, session });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data.archives.length, 1);
  assert.equal(JSON.stringify(listed.body).includes("/Users/secret"), false);
});

test("invalid, revoked or wrong-scope collector tokens cannot ingest", async () => {
  const db = createErpCollectionD1Mock();
  const result = await jsonCall(onIngest, "https://flow.example.com/api/platform/v1/erp-collection/ingest", {
    method: "POST",
    db,
    headers: { authorization: "Bearer invalid", "idempotency-key": "bad" },
    body: { batch: {}, records: [], issues: [] }
  });
  assert.equal(result.response.status, 401);
  assert.equal(result.body.error.code, "ERP_COLLECTION_RUNNER_TOKEN_INVALID");
});

