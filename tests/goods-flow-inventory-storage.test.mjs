import assert from "node:assert/strict";
import test from "node:test";

import * as goodsFlowStorage from "../functions/api/platform/v1/goods-flow/_shared/storage.js";
import { ingestErpCollection } from "../functions/api/platform/v1/erp-collection/_shared/storage.js";
import { createErpCollectionD1Mock } from "./helpers/erp-collection-d1-mock.mjs";

function inventoryRow(index, date = "2026-07-26") {
  return {
    id: `${date}:sku-${index}:warehouse-${index % 12}`,
    date,
    productId: index % 2 ? `product-${index}` : null,
    skuId: `sku-${index}`,
    skuCode: `code-${index}`,
    warehouseId: `warehouse-${index % 12}`,
    erpQuantity: index,
    calibratedQuantity: index,
    unitCost: 1,
    calibratedInventoryValue: index,
    stocktakeStatus: "unverified",
    sourceUpdatedAt: "2026-06-01T00:00:00.000Z",
    confidence: "complete"
  };
}

function createInventoryProjectionD1({ maxBatchSize = 50 } = {}) {
  const live = new Map();
  const stage = new Map();
  const batchSizes = [];

  function liveKey(row) {
    return `${row.snapshot_date}:${row.sku_id}:${row.warehouse_id}`;
  }

  function stagedKey(row) {
    return `${row.projection_id}:${liveKey(row)}`;
  }

  function statement(sql) {
    const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
    const state = {
      values: [],
      bind(...values) {
        state.values = values;
        return state;
      },
      apply() {
        if (
          normalized.startsWith("insert into goods_flow_inventory_daily")
          && !normalized.includes("select id, snapshot_date")
          && !normalized.startsWith("insert into goods_flow_inventory_daily_stage")
        ) {
          const [
            id, snapshot_date, product_id, sku_id, sku_code, warehouse_id,
            erp_quantity, counted_quantity, calibrated_quantity, unit_cost,
            calibrated_inventory_value, sellable_quantity, days_of_supply, age_bucket,
            inventory_cash_tied, stocktake_id, stocktake_status, source_updated_at,
            confidence, created_at, updated_at
          ] = state.values;
          const row = {
            id, snapshot_date, product_id, sku_id, sku_code, warehouse_id,
            erp_quantity, counted_quantity, calibrated_quantity, unit_cost,
            calibrated_inventory_value, sellable_quantity, days_of_supply, age_bucket,
            inventory_cash_tied, stocktake_id, stocktake_status, source_updated_at,
            confidence, created_at, updated_at
          };
          live.set(liveKey(row), row);
          return;
        }
        if (normalized.startsWith("insert into goods_flow_inventory_daily_stage")) {
          const [
            projection_id, id, snapshot_date, product_id, sku_id, sku_code, warehouse_id,
            erp_quantity, counted_quantity, calibrated_quantity, unit_cost,
            calibrated_inventory_value, sellable_quantity, days_of_supply, age_bucket,
            inventory_cash_tied, stocktake_id, stocktake_status, source_updated_at,
            confidence, created_at, updated_at
          ] = state.values;
          const row = {
            projection_id, id, snapshot_date, product_id, sku_id, sku_code, warehouse_id,
            erp_quantity, counted_quantity, calibrated_quantity, unit_cost,
            calibrated_inventory_value, sellable_quantity, days_of_supply, age_bucket,
            inventory_cash_tied, stocktake_id, stocktake_status, source_updated_at,
            confidence, created_at, updated_at
          };
          stage.set(stagedKey(row), row);
          return;
        }
        if (normalized.startsWith("delete from goods_flow_inventory_daily where snapshot_date = ?")) {
          const [snapshotDate] = state.values;
          for (const [key, row] of live) {
            if (row.snapshot_date === snapshotDate) live.delete(key);
          }
          return;
        }
        if (normalized.startsWith("insert into goods_flow_inventory_daily") && normalized.includes("select id, snapshot_date")) {
          const [projectionId] = state.values;
          for (const row of stage.values()) {
            if (row.projection_id !== projectionId) continue;
            const { projection_id: ignored, ...projected } = row;
            live.set(liveKey(projected), projected);
          }
          return;
        }
        if (normalized.startsWith("delete from goods_flow_inventory_daily_stage where projection_id = ?")) {
          const [projectionId] = state.values;
          for (const [key, row] of stage) {
            if (row.projection_id === projectionId) stage.delete(key);
          }
          return;
        }
        throw new Error(`Unexpected SQL: ${normalized}`);
      }
    };
    return state;
  }

  return {
    live,
    stage,
    batchSizes,
    prepare: statement,
    async batch(statements) {
      batchSizes.push(statements.length);
      if (statements.length > maxBatchSize) {
        throw new Error(`D1 batch statement limit exceeded: ${statements.length}`);
      }
      for (const item of statements) item.apply();
      return statements.map(() => ({ success: true }));
    }
  };
}

test("ordinary inventory upserts never exceed the safe D1 statement batch", async () => {
  const db = createInventoryProjectionD1();
  const rows = Array.from({ length: 101 }, (_, index) => inventoryRow(index));

  await goodsFlowStorage.saveInventoryDaily(db, rows, "2026-07-26T13:00:00.000Z");

  assert.deepEqual(db.batchSizes, [50, 50, 1]);
  assert.equal(db.live.size, 101);
});

test("complete inventory projection stages 3,568 rows in safe batches and atomically replaces one snapshot date", async () => {
  assert.equal(
    typeof goodsFlowStorage.replaceInventoryDailySnapshot,
    "function",
    "replaceInventoryDailySnapshot must be implemented"
  );
  const db = createInventoryProjectionD1();
  db.live.set("2026-07-25:old:warehouse-1", {
    id: "history",
    snapshot_date: "2026-07-25",
    sku_id: "old",
    warehouse_id: "warehouse-1"
  });
  db.live.set("2026-07-26:stale:warehouse-1", {
    id: "stale",
    snapshot_date: "2026-07-26",
    sku_id: "stale",
    warehouse_id: "warehouse-1"
  });
  const rows = Array.from({ length: 3_568 }, (_, index) => inventoryRow(index));

  const first = await goodsFlowStorage.replaceInventoryDailySnapshot(db, rows, {
    projectionId: "erp-batch-20260726",
    now: "2026-07-26T13:00:00.000Z"
  });

  assert.deepEqual(first, {
    projectionId: "erp-batch-20260726",
    snapshotDate: "2026-07-26",
    rows: 3_568
  });
  assert.equal(Math.max(...db.batchSizes), 50);
  assert.equal(db.live.size, 3_569);
  assert.equal(db.live.has("2026-07-25:old:warehouse-1"), true);
  assert.equal(db.live.has("2026-07-26:stale:warehouse-1"), false);
  assert.equal(db.stage.size, 0);

  await goodsFlowStorage.replaceInventoryDailySnapshot(db, rows, {
    projectionId: "erp-batch-20260726",
    now: "2026-07-26T13:05:00.000Z"
  });
  assert.equal(db.live.size, 3_569);
  assert.equal(db.stage.size, 0);
});

test("complete inventory projection rejects mixed snapshot dates before writing", async () => {
  assert.equal(
    typeof goodsFlowStorage.replaceInventoryDailySnapshot,
    "function",
    "replaceInventoryDailySnapshot must be implemented"
  );
  const db = createInventoryProjectionD1();

  await assert.rejects(
    goodsFlowStorage.replaceInventoryDailySnapshot(db, [
      inventoryRow(1, "2026-07-25"),
      inventoryRow(2, "2026-07-26")
    ], {
      projectionId: "erp-batch-mixed",
      now: "2026-07-26T13:00:00.000Z"
    }),
    error => error?.code === "GOODS_FLOW_INVENTORY_SNAPSHOT_INVALID"
  );
  assert.deepEqual(db.batchSizes, []);
  assert.equal(db.live.size, 0);
  assert.equal(db.stage.size, 0);
});

test("completed ERP inventory batches publish through full-snapshot replacement", async () => {
  const controlDb = createErpCollectionD1Mock();
  const businessDb = createInventoryProjectionD1();

  const result = await ingestErpCollection(controlDb, {
    idempotencyKey: "inventory-batch-20260726",
    batch: {
      id: "inventory-batch-20260726",
      platformId: "kuaimai",
      resourceType: "inventory_snapshot",
      sourceFileName: "仓库库存.csv",
      contentHash: "a".repeat(64),
      schemaVersion: "kuaimai-inventory-v1",
      rangeStart: null,
      rangeEnd: null,
      rowCount: 1,
      status: "completed",
      collectedAt: "2026-07-26T13:00:00.000Z"
    },
    archive: null,
    records: [{
      id: "inventory-record-1",
      sourceKey: "WH-1::SKU-001",
      occurredAt: null,
      modifiedAt: "2026-07-25T12:00:00.000Z",
      shopId: null,
      warehouseId: "WH-1",
      contentHash: "b".repeat(64),
      payload: {
        productCode: "P-001",
        skuCode: "SKU-001",
        warehouseName: "华东仓",
        quantity: 18
      }
    }],
    issues: []
  }, {
    actor: "数据中心",
    businessDb,
    target: { environmentId: "production", environmentVersion: 1 }
  });

  assert.equal(result.projection.inventoryDaily, 1);
  assert.equal(businessDb.live.size, 1);
  assert.equal(businessDb.stage.size, 0);
  assert.equal(Math.max(...businessDb.batchSizes), 3);
  assert.equal(
    controlDb.tables.erp_collection_batches.get("inventory-batch-20260726").status,
    "completed"
  );
});

test("failed ERP inventory projection keeps control batch and archive resumable", async () => {
  const controlDb = createErpCollectionD1Mock();
  const businessDb = createInventoryProjectionD1({ maxBatchSize: 0 });

  await assert.rejects(ingestErpCollection(controlDb, {
    idempotencyKey: "inventory-batch-failed-20260726",
    batch: {
      id: "inventory-batch-failed-20260726",
      platformId: "kuaimai",
      resourceType: "inventory_snapshot",
      sourceFileName: "仓库库存.csv",
      contentHash: "c".repeat(64),
      schemaVersion: "kuaimai-inventory-v1",
      rangeStart: null,
      rangeEnd: null,
      rowCount: 1,
      status: "completed",
      collectedAt: "2026-07-26T13:00:00.000Z"
    },
    archive: {
      id: "inventory-archive-failed-20260726",
      platformId: "kuaimai",
      resourceType: "inventory_snapshot",
      contentHash: "c".repeat(64),
      fileName: "仓库库存.csv",
      sizeBytes: 1024,
      relativePath: "2026/07/26/仓库库存.csv",
      storageType: "local",
      runnerId: "runner-1",
      status: "archived",
      archivedAt: "2026-07-26T13:00:00.000Z",
      processedAt: null,
      errorCode: null
    },
    records: [{
      id: "inventory-record-failed-1",
      sourceKey: "WH-1::SKU-001",
      occurredAt: null,
      modifiedAt: "2026-07-25T12:00:00.000Z",
      shopId: null,
      warehouseId: "WH-1",
      contentHash: "d".repeat(64),
      payload: {
        productCode: "P-001",
        skuCode: "SKU-001",
        warehouseName: "华东仓",
        quantity: 18
      }
    }],
    issues: []
  }, {
    actor: "数据中心",
    businessDb,
    target: { environmentId: "production", environmentVersion: 1 }
  }), /D1 batch statement limit exceeded/);

  assert.equal(
    controlDb.tables.erp_collection_batches.get("inventory-batch-failed-20260726").status,
    "pending"
  );
  assert.equal(
    controlDb.tables.erp_file_archives.get("inventory-archive-failed-20260726").status,
    "processing"
  );
  assert.equal(businessDb.live.size, 0);
});
