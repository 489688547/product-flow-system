import assert from "node:assert/strict";
import test from "node:test";
import {
  KUAIMAI_ERP_RESOURCE_TYPES,
  normalizeErpCollectionPayload
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
    "orders", "order_items", "sales_items", "products", "skus", "inventory_snapshot",
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
