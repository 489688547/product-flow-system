import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/platform/v1/erp-collection/ingest.js";
import { readBatchRecords } from "../functions/api/platform/v1/erp-collection/_shared/storage.js";
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

async function call({ session, db, businessDb, dataEnvironment, payload = body, headers = {}, method = "POST" } = {}) {
  const request = new Request("https://flow.example.com/api/platform/v1/erp-collection/ingest", {
    method,
    headers: { "content-type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(payload) : undefined
  });
  const response = await onRequest({
    request,
    env: db ? { PRODUCT_FLOW_DB: db, ...(businessDb ? { DEMO_FLOW_DB: businessDb } : {}) } : {},
    data: session ? {
      session,
      ...(businessDb ? { businessDb } : {}),
      ...(dataEnvironment ? { dataEnvironment } : {})
    } : {}
  });
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
  assert.deepEqual(JSON.parse([...db.tables.erp_source_records.values()][0].payload), { sourceOrderId: "order-1001" });
});

test("completed inventory uses the Shanghai collection day and returns projection quality", async () => {
  const db = createErpCollectionD1Mock();
  const inventory = {
    batch: {
      platformId: "kuaimai",
      resourceType: "inventory_snapshot",
      sourceFileName: "库存状态导出.xlsx",
      contentHash: "c".repeat(64),
      rowCount: 1,
      status: "completed",
      collectedAt: "2026-07-25T21:12:00.000Z"
    },
    records: [{
      sourceKey: "杭州仓::S-1",
      modifiedAt: "2026-06-01T09:00:00+08:00",
      warehouseId: "杭州仓",
      contentHash: "d".repeat(64),
      payload: {
        sourceSkuId: "S-1",
        quantity: "8",
        warehouseName: "杭州仓"
      }
    }],
    issues: []
  };

  const result = await call({
    session: sessions.data,
    db,
    payload: inventory,
    headers: { "idempotency-key": "inventory-2026-07-26" }
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.data.projection.inventoryDaily, 1);
  assert.equal(result.body.data.projection.inventoryQuality.snapshotDate, "2026-07-26");
  assert.equal(result.body.data.projection.inventoryQuality.complete, true);
  assert.equal(result.body.data.projection.inventoryQuality.sourceUpdatedAt, "2026-06-01T09:00:00+08:00");
});

test("ERP collection keeps raw control records in production and persists the selected display target", async () => {
  const controlDb = createErpCollectionD1Mock();
  const displayDb = createErpCollectionD1Mock();
  const result = await call({
    session: sessions.executive,
    db: controlDb,
    businessDb: displayDb,
    dataEnvironment: { id: "display", version: 7 },
    headers: { "idempotency-key": "batch-display" }
  });

  assert.equal(result.response.status, 201);
  assert.equal(result.body.data.targetEnvironment, "display");
  assert.equal(result.body.data.targetEnvironmentVersion, 7);
  assert.equal(controlDb.tables.erp_source_records.size, 1);
  assert.equal(displayDb.tables.erp_source_records.size, 0);
  const batch = [...controlDb.tables.erp_collection_batches.values()][0];
  assert.equal(batch.target_environment, "display");
  assert.equal(batch.target_environment_version, 7);
});

test("ERP collection rejects client-selected database targets", async () => {
  const db = createErpCollectionD1Mock();
  const result = await call({
    session: sessions.executive,
    db,
    payload: { ...body, targetEnvironment: "display" },
    headers: { "idempotency-key": "bad-target" }
  });
  assert.equal(result.response.status, 400);
  assert.equal(result.body.error.code, "COLLECTION_TARGET_CLIENT_FORBIDDEN");
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

test("ERP collection updates a normalized payload when the source file hash is unchanged", async () => {
  const db = createErpCollectionD1Mock();
  const inventory = {
    batch: {
      platformId: "kuaimai",
      resourceType: "inventory_snapshot",
      sourceFileName: "库存状态导出.xlsx",
      contentHash: "e".repeat(64),
      rowCount: 1,
      status: "completed",
      collectedAt: "2026-07-26T05:00:00.000Z"
    },
    records: [{
      sourceKey: "杭州仓::SKU-1",
      warehouseId: "杭州仓",
      contentHash: "f".repeat(64),
      payload: {
        skuCode: "SKU-1",
        warehouseName: "杭州仓",
        purchasePrice: "6.50"
      }
    }],
    issues: []
  };
  await call({
    session: sessions.executive,
    db,
    payload: inventory,
    headers: { "idempotency-key": "inventory-old-index" }
  });

  const repaired = structuredClone(inventory);
  repaired.records[0].payload.quantity = "18";
  repaired.records[0].payload.sellableQuantity = "16";
  const result = await call({
    session: sessions.executive,
    db,
    payload: repaired,
    headers: { "idempotency-key": "inventory-repaired-index" }
  });

  assert.equal(result.body.data.counts.updated, 1);
  assert.equal(result.body.data.counts.unchanged, 0);
  assert.deepEqual(JSON.parse([...db.tables.erp_source_records.values()][0].payload), {
    purchasePrice: "6.50",
    quantity: "18",
    sellableQuantity: "16",
    skuCode: "SKU-1",
    warehouseName: "杭州仓"
  });
});

test("ERP collection ingest returns stable validation and method errors", async () => {
  const db = createErpCollectionD1Mock();
  const invalid = await call({ session: sessions.data, db, payload: { ...body, records: [] }, headers: { "idempotency-key": "bad" } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.body.error.code, "ERP_COLLECTION_RECORDS_REQUIRED");
  assert.equal((await call({ session: sessions.data, db, method: "GET" })).response.status, 405);
});

test("completed batch projection reads source records in bounded keyset pages", async () => {
  const sourceRows = Array.from({ length: 501 }, (_, index) => ({
    source_key: `source-${String(index).padStart(4, "0")}`,
    occurred_at: "2026-07-23T10:00:00+08:00",
    modified_at: null,
    shop_id: null,
    warehouse_id: null,
    content_hash: hash,
    payload: JSON.stringify({ sourceOrderId: `order-${index}` })
  }));
  let calls = 0;
  const db = {
    prepare(sql) {
      assert.match(sql, /source_key > \?/i);
      assert.match(sql, /limit \?/i);
      return {
        bind(batchId, afterKey, limit) {
          assert.equal(batchId, "batch-large");
          return {
            async all() {
              calls += 1;
              return {
                results: sourceRows.filter(row => row.source_key > afterKey).slice(0, limit)
              };
            }
          };
        }
      };
    }
  };

  const records = await readBatchRecords(db, "batch-large");
  assert.equal(records.length, 501);
  assert.equal(calls, 2);
});
