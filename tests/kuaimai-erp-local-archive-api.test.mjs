import assert from "node:assert/strict";
import test from "node:test";
import { onRequest as onArchives } from "../functions/api/platform/v1/erp-collection/archives.js";
import { onRequest as onIngest } from "../functions/api/platform/v1/erp-collection/ingest.js";
import { onRequest as onRunners } from "../functions/api/platform/v1/erp-collection/runners.js";
import { hashSecret } from "../functions/api/platform/_shared/productionDataAccess.js";
import { createErpCollectionD1Mock } from "./helpers/erp-collection-d1-mock.mjs";

const session = { userId: "exec-1", name: "负责人", role: "executive", department: "总经办" };
const readonly = { userId: "readonly-1", name: "访客", role: "readonly", department: "访客" };
const fileHash = "a".repeat(64);

async function jsonCall(handler, url, {
  method = "GET",
  db,
  session: actor,
  headers = {},
  body,
  now
} = {}) {
  const request = new Request(url, {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const response = await handler({
    request,
    env: db ? { PRODUCT_FLOW_DB: db } : {},
    data: { ...(actor ? { session: actor } : {}), ...(now ? { now } : {}) }
  });
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

test("active executive production token can register a collector without a browser session", async () => {
  const db = createErpCollectionD1Mock();
  const personalToken = "personal-production-token";
  const tokenHash = await hashSecret(personalToken);
  db.tables.production_data_access_tokens.set(tokenHash, {
    token_hash: tokenHash,
    user_id: "exec-1",
    union_id: "union-1",
    name: "负责人",
    capabilities: JSON.stringify(["read", "write"]),
    expires_at: null,
    revoked_at: null
  });
  db.tables.product_flow_org_members.set("exec-1", {
    corp_id: "corp-1",
    user_id: "exec-1",
    union_id: "union-1",
    name: "负责人",
    department: "总经办",
    title: "负责人",
    role: "executive",
    active: 1
  });
  const result = await jsonCall(onRunners, "https://flow.example.com/api/platform/v1/erp-collection/runners", {
    method: "POST",
    db,
    headers: { authorization: `Bearer ${personalToken}` },
    body: { name: "公司 Mac 快麦采集器" }
  });
  assert.equal(result.response.status, 201);
  assert.equal(result.body.data.scope, "kuaimai_erp_ingest");
  assert.ok(db.tables.production_data_access_tokens.get(tokenHash).last_used_at);
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
      status: "partial",
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

  const repeatedManifestSync = await jsonCall(onArchives, "https://flow.example.com/api/platform/v1/erp-collection/archives", {
    method: "POST",
    db,
    headers: { authorization: `Bearer ${token}` },
    body: { archive: { ...payload.archive, status: "archived" } }
  });
  assert.equal(repeatedManifestSync.response.status, 200);
  assert.equal([...db.tables.erp_file_archives.values()][0].status, "processed");
  assert.equal([...db.tables.erp_file_archives.values()][0].batch_id, ingested.body.data.batchId);

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

test("collector can sync an archive manifest before row parsing is available", async () => {
  const db = createErpCollectionD1Mock();
  const registered = await jsonCall(onRunners, "https://flow.example.com/api/platform/v1/erp-collection/runners", {
    method: "POST", db, session, body: { name: "公司 Mac" }
  });
  const archive = {
    platformId: "kuaimai",
    resourceType: "order_items",
    contentHash: "c".repeat(64),
    fileName: "销售主题明细.xlsx",
    sizeBytes: 242885680,
    relativePath: "原始归档/order_items/2026-07/ccc__销售主题明细.xlsx",
    storageType: "local_desktop",
    status: "archived",
    archivedAt: "2026-07-22T10:00:00.000Z"
  };
  const result = await jsonCall(onArchives, "https://flow.example.com/api/platform/v1/erp-collection/archives", {
    method: "POST",
    db,
    headers: { authorization: `Bearer ${registered.body.data.token}` },
    body: { archive }
  });
  assert.equal(result.response.status, 201);
  assert.equal(db.tables.erp_file_archives.size, 1);
  assert.equal([...db.tables.erp_file_archives.values()][0].batch_id, null);
});

test("archive reads self-heal processing rows older than 24 hours without changing fresh work", async () => {
  const db = createErpCollectionD1Mock();
  db.tables.erp_file_archives.set("expired", {
    id: "expired",
    platform_id: "kuaimai",
    resource_type: "order_items",
    content_hash: "d".repeat(64),
    file_name: "已卡住.xlsx",
    size_bytes: 1024,
    relative_path: "原始归档/order_items/2026-07/expired.xlsx",
    storage_type: "local_desktop",
    runner_id: "runner-1",
    status: "processing",
    batch_id: "batch-expired",
    archived_at: "2026-07-26T00:00:00.000Z",
    processed_at: null,
    error_code: null,
    ingestion_decision: "pending",
    ingestion_reason_code: null,
    decision_at: null,
    decision_by: null,
    version: 1,
    created_at: "2026-07-26T00:00:00.000Z",
    updated_at: "2026-07-26T01:00:00.000Z"
  });
  db.tables.erp_file_archives.set("fresh", {
    ...db.tables.erp_file_archives.get("expired"),
    id: "fresh",
    content_hash: "e".repeat(64),
    file_name: "处理中.xlsx",
    batch_id: "batch-fresh",
    archived_at: "2026-07-27T12:00:00.000Z",
    updated_at: "2026-07-27T13:00:00.000Z"
  });

  const listed = await jsonCall(
    onArchives,
    "https://flow.example.com/api/platform/v1/erp-collection/archives",
    { db, session, now: new Date("2026-07-28T02:00:00.000Z") }
  );

  assert.equal(listed.response.status, 200);
  assert.equal(db.tables.erp_file_archives.get("expired").status, "failed");
  assert.equal(
    db.tables.erp_file_archives.get("expired").error_code,
    "ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT"
  );
  assert.equal(db.tables.erp_file_archives.get("expired").batch_id, "batch-expired");
  assert.equal(db.tables.erp_file_archives.get("fresh").status, "processing");
});

test("authorized users record and revoke explicit archive skip decisions with optimistic versions", async () => {
  const db = createErpCollectionD1Mock();
  db.tables.erp_file_archives.set("archive-1", {
    id: "archive-1",
    platform_id: "kuaimai",
    resource_type: "sales_items",
    content_hash: "f".repeat(64),
    file_name: "历史明细.xlsx",
    size_bytes: 2048,
    relative_path: "原始归档/sales_items/2026-07/history.xlsx",
    storage_type: "local_desktop",
    runner_id: "runner-1",
    status: "archived",
    batch_id: null,
    archived_at: "2026-07-22T00:00:00.000Z",
    processed_at: null,
    error_code: null,
    ingestion_decision: "pending",
    ingestion_reason_code: null,
    decision_at: null,
    decision_by: null,
    version: 1,
    created_at: "2026-07-22T00:00:00.000Z",
    updated_at: "2026-07-22T00:00:00.000Z"
  });

  const skipped = await jsonCall(
    onArchives,
    "https://flow.example.com/api/platform/v1/erp-collection/archives",
    {
      method: "PATCH",
      db,
      session,
      body: {
        archiveId: "archive-1",
        expectedVersion: 1,
        ingestionDecision: "skipped",
        ingestionReasonCode: "DETAIL_STORAGE_DEFERRED"
      }
    }
  );
  assert.equal(skipped.response.status, 200);
  assert.equal(skipped.body.data.archive.ingestionDecision, "skipped");
  assert.equal(skipped.body.data.archive.ingestionReasonCode, "DETAIL_STORAGE_DEFERRED");
  assert.equal(skipped.body.data.archive.decisionBy, "负责人");
  assert.equal(skipped.body.data.archive.version, 2);

  const stale = await jsonCall(
    onArchives,
    "https://flow.example.com/api/platform/v1/erp-collection/archives",
    {
      method: "PATCH",
      db,
      session,
      body: {
        archiveId: "archive-1",
        expectedVersion: 1,
        ingestionDecision: "pending"
      }
    }
  );
  assert.equal(stale.response.status, 409);
  assert.equal(stale.body.error.code, "ERP_COLLECTION_ARCHIVE_VERSION_CONFLICT");

  const restored = await jsonCall(
    onArchives,
    "https://flow.example.com/api/platform/v1/erp-collection/archives",
    {
      method: "PATCH",
      db,
      session,
      body: {
        archiveId: "archive-1",
        expectedVersion: 2,
        ingestionDecision: "pending"
      }
    }
  );
  assert.equal(restored.response.status, 200);
  assert.equal(restored.body.data.archive.ingestionDecision, "pending");
  assert.equal(restored.body.data.archive.ingestionReasonCode, null);
  assert.equal(restored.body.data.archive.version, 3);
});

test("archive decisions reject readonly users, unknown reasons and non-archived runtime states", async () => {
  const seed = () => {
    const db = createErpCollectionD1Mock();
    db.tables.erp_file_archives.set("archive-1", {
      id: "archive-1",
      platform_id: "kuaimai",
      resource_type: "order_items",
      content_hash: "9".repeat(64),
      file_name: "待处理.xlsx",
      size_bytes: 1,
      relative_path: "原始归档/order_items/2026-07/pending.xlsx",
      storage_type: "local_desktop",
      runner_id: null,
      status: "archived",
      batch_id: null,
      archived_at: "2026-07-22T00:00:00.000Z",
      processed_at: null,
      error_code: null,
      ingestion_decision: "pending",
      ingestion_reason_code: null,
      decision_at: null,
      decision_by: null,
      version: 1,
      created_at: "2026-07-22T00:00:00.000Z",
      updated_at: "2026-07-22T00:00:00.000Z"
    });
    return db;
  };
  const body = {
    archiveId: "archive-1",
    expectedVersion: 1,
    ingestionDecision: "skipped",
    ingestionReasonCode: "DETAIL_STORAGE_DEFERRED"
  };

  const denied = await jsonCall(onArchives, "https://flow.example.com/api/platform/v1/erp-collection/archives", {
    method: "PATCH", db: seed(), session: readonly, body
  });
  assert.equal(denied.response.status, 403);

  const invalid = await jsonCall(onArchives, "https://flow.example.com/api/platform/v1/erp-collection/archives", {
    method: "PATCH",
    db: seed(),
    session,
    body: { ...body, ingestionReasonCode: "FILE_LOOKS_OLD" }
  });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, "ERP_COLLECTION_ARCHIVE_REASON_INVALID");

  const processingDb = seed();
  processingDb.tables.erp_file_archives.get("archive-1").status = "processing";
  const wrongState = await jsonCall(onArchives, "https://flow.example.com/api/platform/v1/erp-collection/archives", {
    method: "PATCH", db: processingDb, session, body
  });
  assert.equal(wrongState.response.status, 409);
  assert.equal(wrongState.body.error.code, "ERP_COLLECTION_ARCHIVE_STATE_CONFLICT");
});

test("archive rows carry the batch business-date range so a gap can be traced to its file", async () => {
  // 生产实测：07-27 的 order_items 采集成功、归档成功，但入库超时，当日销售只剩中位数的 8%。
  // 页面要把「这一天为什么缺」指到具体文件，归档记录必须带出所属批次的业务日期。
  const db = createErpCollectionD1Mock();
  db.tables.erp_collection_batches.set("batch-0727", {
    id: "batch-0727",
    platform_id: "kuaimai",
    resource_type: "order_items",
    range_start: "2026-07-27",
    range_end: "2026-07-27",
    status: "failed",
    created_at: "2026-07-27T05:16:00.000Z",
    updated_at: "2026-07-27T05:46:00.000Z"
  });
  db.tables.erp_file_archives.set("arch-0727", {
    id: "arch-0727",
    platform_id: "kuaimai",
    resource_type: "order_items",
    content_hash: "4a082b866f".padEnd(64, "0"),
    file_name: "快麦ERP交易订单明细导出20260727051545.xlsx",
    size_bytes: 9_049_550,
    relative_path: "原始归档/order_items/2026-07/hash__快麦ERP交易订单明细导出20260727051545.xlsx",
    storage_type: "local_desktop",
    runner_id: "runner-1",
    status: "failed",
    batch_id: "batch-0727",
    archived_at: "2026-07-26T21:16:13.966Z",
    processed_at: null,
    error_code: "ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT",
    ingestion_decision: "pending",
    ingestion_reason_code: null,
    decision_at: null,
    decision_by: null,
    version: 1,
    created_at: "2026-07-26T21:16:13.966Z",
    updated_at: "2026-07-27T05:46:00.000Z"
  });

  const listed = await jsonCall(onArchives, "https://flow.example.com/api/platform/v1/erp-collection/archives", {
    db, session
  });
  assert.equal(listed.response.status, 200);
  const row = listed.body.data.archives.find(item => item.id === "arch-0727");
  assert.equal(row.businessDateStart, "2026-07-27");
  assert.equal(row.businessDateEnd, "2026-07-27");
  assert.equal(row.errorCode, "ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT");
  // 没有批次的历史文件不得凭空编出日期。
  assert.equal(listed.body.data.archives.every(item => item.batchId || !item.businessDateStart), true);
  assert.equal(JSON.stringify(listed.body).includes("/Users/"), false);
});
