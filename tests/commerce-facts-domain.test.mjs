import assert from "node:assert/strict";
import test from "node:test";

import {
  COMMERCE_FACT_RESOURCES,
  commerceFactIdentity,
  deriveCommerceMetrics,
  normalizeCommerceBatchInput,
  normalizeCommerceFact
} from "../src/domain/commerceFacts.js";
import { scaleSalesFact } from "../src/domain/demoSalesTransform.js";

test("commerce resources are fixed and missing source metrics remain null", () => {
  assert.deepEqual(COMMERCE_FACT_RESOURCES, [
    "store_daily",
    "product_daily",
    "live_daily",
    "video_daily"
  ]);
  const fact = normalizeCommerceFact("store_daily", {
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    businessDate: "2026-07-23",
    transactionAmount: "100.50",
    transactionOrderCount: 0,
    refundAmountByPaymentDate: null,
    productExposureUsers: "",
    productClickUsers: 2
  });

  assert.equal(fact.transactionAmount, 100.5);
  assert.equal(fact.transactionOrderCount, 0);
  assert.equal(fact.refundAmountByPaymentDate, null);
  assert.equal(fact.productExposureUsers, null);
  assert.equal(fact.settlementAmount, null);
});

test("derived rates use atomic facts and return null for missing or zero denominators", () => {
  assert.deepEqual(deriveCommerceMetrics("store_daily", {
    transactionAmount: 100,
    transactionOrderCount: 0,
    transactionBuyerCount: 4,
    refundAmountByPaymentDate: null,
    productExposureUsers: 10,
    productClickUsers: 2
  }), {
    refundRate: null,
    averageOrderValue: null,
    exposureClickRate: 0.2,
    clickTransactionRate: 2
  });
  assert.equal(deriveCommerceMetrics("product_daily", {
    transactionAmount: 100,
    refundAmount: 10,
    exposureUsers: 0,
    clickUsers: 2,
    transactionBuyers: 1
  }).clickRate, null);
});

test("detail facts require stable identities and reject unknown or sensitive fields", () => {
  assert.throws(
    () => normalizeCommerceFact("product_daily", {
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      businessDate: "2026-07-23",
      productName: "没有 ID"
    }),
    error => error?.code === "COMMERCE_FACT_SCHEMA_INVALID"
  );
  assert.throws(
    () => normalizeCommerceFact("video_daily", {
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      businessDate: "2026-07-23",
      videoId: "video-1",
      pageText: "完整页面"
    }),
    error => error?.code === "COMMERCE_FACT_SCHEMA_INVALID"
  );
  assert.throws(
    () => normalizeCommerceFact("store_daily", {
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      businessDate: "2026-07-23",
      cookie: "secret"
    }),
    error => error?.code === "COMMERCE_FACT_SCHEMA_INVALID"
  );
});

test("fact identity is stable within a batch and separates detail dimensions", () => {
  const base = {
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    businessDate: "2026-07-23",
    productId: "product-1"
  };
  assert.equal(
    commerceFactIdentity("batch-1", "product_daily", { ...base, skuId: "sku-a" }),
    commerceFactIdentity("batch-1", "product_daily", { ...base, skuId: "sku-a" })
  );
  assert.notEqual(
    commerceFactIdentity("batch-1", "product_daily", { ...base, skuId: "sku-a" }),
    commerceFactIdentity("batch-1", "product_daily", { ...base, skuId: "sku-b" })
  );
});

test("batch input is bounded, strict and can complete only with expected count", () => {
  const batch = normalizeCommerceBatchInput({
    jobId: "job-1",
    batchId: "batch-1",
    providerId: "douyin-ecommerce",
    storeId: "store-a",
    resourceType: "store_daily",
    businessDate: "2026-07-23",
    schemaVersion: "douyin-store-v1",
    sourceVersion: "compass-store-v1",
    chunkIndex: 0,
    complete: true,
    expectedCount: 1,
    coverage: 1,
    confidence: "high",
    facts: [{
      providerId: "douyin-ecommerce",
      storeId: "store-a",
      businessDate: "2026-07-23",
      transactionAmount: 100
    }]
  });

  assert.equal(batch.expectedCount, 1);
  assert.equal(batch.facts[0].transactionAmount, 100);
  assert.throws(
    () => normalizeCommerceBatchInput({ ...batch, targetEnvironment: "display" }),
    error => error?.code === "COMMERCE_FACT_SCHEMA_INVALID"
  );
  assert.throws(
    () => normalizeCommerceBatchInput({ ...batch, complete: true, expectedCount: null }),
    error => error?.code === "COMMERCE_BATCH_INCOMPLETE"
  );
});

test("display transformation scales commerce atomic facts together so derived rates stay stable", () => {
  const transformed = scaleSalesFact({
    transaction_amount: 100,
    transaction_order_count: 2,
    refund_amount_by_payment_date: 10,
    product_exposure_users: 20,
    product_click_users: 5,
    duration_seconds: 3600
  });

  assert.deepEqual(transformed, {
    transaction_amount: 200,
    transaction_order_count: 4,
    refund_amount_by_payment_date: 20,
    product_exposure_users: 40,
    product_click_users: 10,
    duration_seconds: 3600
  });
});
