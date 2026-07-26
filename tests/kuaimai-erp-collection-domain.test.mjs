import assert from "node:assert/strict";
import test from "node:test";
import {
  KUAIMAI_ERP_RESOURCE_TYPES,
  normalizeErpCollectionPayload,
  normalizeErpSalesFactsPayload
} from "../src/domain/kuaimaiErpCollection.js";

const hash = "a".repeat(64);

function payload(overrides = {}) {
  return {
    batch: {
      platformId: "kuaimai",
      resourceType: "orders",
      sourceFileName: "订单-2026-07-01.xlsx",
      contentHash: hash,
      rowCount: 1,
      rangeStart: "2026-07-01T00:00:00+08:00",
      rangeEnd: "2026-07-01T23:59:59+08:00",
      collectedAt: "2026-07-22T08:00:00.000Z"
    },
    records: [{
      sourceKey: "order-1001",
      occurredAt: "2026-07-01T10:00:00+08:00",
      contentHash: "b".repeat(64),
      payload: { 系统订单号: "order-1001", 创建时间: "2026-07-01 10:00:00" }
    }],
    issues: [],
    ...overrides
  };
}

test("ERP collection exposes the governed resource registry", () => {
  assert.deepEqual(KUAIMAI_ERP_RESOURCE_TYPES, [
    "orders", "order_items", "sales_items", "products", "product_kits", "product_combinations", "skus", "inventory_snapshot",
    "inventory_movements", "suppliers", "purchase_orders", "aftersales",
    "shops", "warehouses", "finance"
  ]);
});

test("normalization derives a stable batch id and keeps only the standard minimum index", () => {
  const normalized = normalizeErpCollectionPayload(payload(), { idempotencyKey: "orders-20260701-1" });
  assert.equal(normalized.batch.id, `kuaimai-orders-${hash.slice(0, 24)}`);
  assert.equal(normalized.batch.schemaVersion, "v1");
  assert.equal(normalized.batch.status, "completed");
  assert.equal(normalized.records[0].sourceKey, "order-1001");
  assert.deepEqual(normalized.records[0].payload, { sourceOrderId: "order-1001" });
});

test("inventory normalization retains the official total and sellable quantity fields", () => {
  const inventory = payload({
    batch: {
      ...payload().batch,
      resourceType: "inventory_snapshot",
      sourceFileName: "仓库库存.xlsx",
      rangeStart: null,
      rangeEnd: null
    },
    records: [{
      sourceKey: "杭州仓::SKU-1",
      occurredAt: null,
      warehouseId: "杭州仓",
      contentHash: "b".repeat(64),
      payload: {
        仓库: "杭州仓",
        规格商家编码: "SKU-1",
        实际总库存: "18",
        实际可用数: "12",
        成本价: "6.5"
      }
    }]
  });

  const normalized = normalizeErpCollectionPayload(inventory, { idempotencyKey: "inventory-20260726-1" });

  assert.deepEqual(normalized.records[0].payload, {
    skuCode: "SKU-1",
    purchasePrice: "6.5",
    quantity: "18",
    sellableQuantity: "12",
    warehouseName: "杭州仓"
  });
});

test("normalization rejects unknown resources, oversized chunks and secret fields", () => {
  assert.throws(() => normalizeErpCollectionPayload(payload({ batch: { ...payload().batch, resourceType: "mystery" } }), { idempotencyKey: "x" }), error => error.code === "ERP_COLLECTION_RESOURCE_INVALID");
  assert.throws(() => normalizeErpCollectionPayload(payload({ records: Array.from({ length: 501 }, (_, index) => ({ sourceKey: String(index), contentHash: hash, payload: {} })) }), { idempotencyKey: "x" }), error => error.code === "ERP_COLLECTION_CHUNK_TOO_LARGE");
  assert.throws(() => normalizeErpCollectionPayload(payload({ records: [{ sourceKey: "order-1", contentHash: hash, payload: { cookie: "secret" } }] }), { idempotencyKey: "x" }), error => error.code === "ERP_COLLECTION_SECRET_FIELD");
  assert.throws(() => normalizeErpCollectionPayload(payload({ records: [{ sourceKey: "order-1", contentHash: hash, payload: { 手机号: "13800000000" } }] }), { idempotencyKey: "x" }), error => error.code === "ERP_COLLECTION_PERSONAL_DATA_FIELD");
});

test("order records require a source key, creation timestamp and valid hashes", () => {
  assert.throws(() => normalizeErpCollectionPayload(payload({ records: [{ sourceKey: "", occurredAt: "2026-07-01T10:00:00+08:00", contentHash: hash, payload: {} }] }), { idempotencyKey: "x" }), error => error.code === "ERP_COLLECTION_SOURCE_KEY_REQUIRED");
  assert.throws(() => normalizeErpCollectionPayload(payload({ records: [{ sourceKey: "order-1", occurredAt: "", contentHash: hash, payload: {} }] }), { idempotencyKey: "x" }), error => error.code === "ERP_COLLECTION_OCCURRED_AT_REQUIRED");
  assert.throws(() => normalizeErpCollectionPayload(payload({ batch: { ...payload().batch, contentHash: "not-a-hash" } }), { idempotencyKey: "x" }), error => error.code === "ERP_COLLECTION_HASH_INVALID");
});

function salesFactsPayload(factCount, overrides = {}) {
  return {
    batch: {
      platformId: "kuaimai",
      resourceType: "sales_items",
      sourceFileName: "销售主题分析.xlsx",
      contentHash: hash,
      rowCount: factCount * 4,
      status: "completed",
      collectedAt: "2026-07-24T06:50:00.000Z"
    },
    facts: Array.from({ length: factCount }, (_, index) => ({
      code: `69${String(1000000000 + index)}`,
      date: "2026-07-23",
      platform: "抖店(放心购)",
      qty: 1,
      sales: 19.9,
      netSales: 19.9,
      grossProfit: 11.9,
      refund: 0,
      cost: 8
    })),
    issues: [],
    ...overrides
  };
}

test("legacy single-pack sales facts keep working up to 5000 rows", () => {
  const normalized = normalizeErpSalesFactsPayload(salesFactsPayload(2), { idempotencyKey: "batch:projected-sales" });
  assert.equal(normalized.chunk, null);
  assert.equal(normalized.replaceDates, null);
  assert.equal(normalized.facts.length, 2);

  assert.throws(
    () => normalizeErpSalesFactsPayload(salesFactsPayload(5001), { idempotencyKey: "x" }),
    error => error.code === "ERP_COLLECTION_SALES_FACTS_TOO_LARGE"
  );
});

test("chunked sales facts packs are limited to 1000 rows and 50 packs per batch", () => {
  const first = normalizeErpSalesFactsPayload(salesFactsPayload(1000, {
    chunk: { index: 1, total: 3 },
    replaceDates: ["2026-07-23"]
  }), { idempotencyKey: "batch:projected-sales:1" });
  assert.deepEqual(first.chunk, { index: 1, total: 3 });
  assert.deepEqual(first.replaceDates, ["2026-07-23"]);

  assert.throws(
    () => normalizeErpSalesFactsPayload(salesFactsPayload(1001, {
      chunk: { index: 1, total: 2 },
      replaceDates: ["2026-07-23"]
    }), { idempotencyKey: "x" }),
    error => error.code === "ERP_COLLECTION_SALES_FACTS_TOO_LARGE"
  );
  assert.throws(
    () => normalizeErpSalesFactsPayload(salesFactsPayload(1, {
      chunk: { index: 1, total: 51 },
      replaceDates: ["2026-07-23"]
    }), { idempotencyKey: "x" }),
    error => error.code === "ERP_COLLECTION_SALES_FACTS_TOO_LARGE"
  );
  assert.throws(
    () => normalizeErpSalesFactsPayload(salesFactsPayload(1, { chunk: { index: 3, total: 2 } }), { idempotencyKey: "x" }),
    error => error.code === "ERP_COLLECTION_SALES_FACTS_CHUNK_INVALID"
  );
});

test("chunked sales facts enforce the rewrite-dates contract across packs", () => {
  // 多包首包必须携带完整重写日期列表。
  assert.throws(
    () => normalizeErpSalesFactsPayload(salesFactsPayload(1, { chunk: { index: 1, total: 2 } }), { idempotencyKey: "x" }),
    error => error.code === "ERP_COLLECTION_SALES_FACTS_DATES_REQUIRED"
  );
  // 后续包只允许插入，携带重写日期会被拒绝，避免第二包删掉第一包已写的数据。
  assert.throws(
    () => normalizeErpSalesFactsPayload(salesFactsPayload(1, {
      chunk: { index: 2, total: 2 },
      replaceDates: ["2026-07-23"]
    }), { idempotencyKey: "x" }),
    error => error.code === "ERP_COLLECTION_SALES_FACTS_DATES_INVALID"
  );
  // 重写日期必须覆盖本包所有事实日期，且格式必须是 YYYY-MM-DD。
  assert.throws(
    () => normalizeErpSalesFactsPayload(salesFactsPayload(1, {
      chunk: { index: 1, total: 2 },
      replaceDates: ["2026-07-24"]
    }), { idempotencyKey: "x" }),
    error => error.code === "ERP_COLLECTION_SALES_FACTS_DATES_INVALID"
  );
  assert.throws(
    () => normalizeErpSalesFactsPayload(salesFactsPayload(1, { replaceDates: ["2026/07/23"] }), { idempotencyKey: "x" }),
    error => error.code === "ERP_COLLECTION_SALES_FACTS_DATES_INVALID"
  );

  // 后续包不带日期列表时按插入处理。
  const continuation = normalizeErpSalesFactsPayload(salesFactsPayload(1, { chunk: { index: 2, total: 2 } }), { idempotencyKey: "batch:projected-sales:2" });
  assert.deepEqual(continuation.chunk, { index: 2, total: 2 });
  assert.equal(continuation.replaceDates, null);
});
