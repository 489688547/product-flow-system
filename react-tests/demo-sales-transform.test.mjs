import assert from "node:assert/strict";
import test from "node:test";

import {
  DISPLAY_SALES_FACTOR,
  DISPLAY_SALES_RULE_VERSION,
  deriveSalesMetrics,
  deterministicDisplayId,
  scaleBusinessRecord,
  scaleSalesFact,
  validateSalesTransform
} from "../src/domain/demoSalesTransform.js";

const source = {
  code: "690001",
  date: "2026-07-22",
  platform: "天猫",
  qty: 3,
  sales: 300,
  net_sales: 240,
  refund: 60,
  cost: 120,
  gross_profit: 120,
  pre_ship_refund: 20,
  post_ship_refund: 40
};

test("doubles additive sales facts and preserves dimensions", () => {
  assert.equal(DISPLAY_SALES_FACTOR, 2);
  assert.equal(DISPLAY_SALES_RULE_VERSION, "sales-2x-v1");
  assert.deepEqual(scaleSalesFact(source), {
    ...source,
    qty: 6,
    sales: 600,
    net_sales: 480,
    refund: 120,
    cost: 240,
    gross_profit: 240,
    pre_ship_refund: 40,
    post_ship_refund: 80
  });
});

test("keeps ratios and averages consistent after transformation", () => {
  const metrics = deriveSalesMetrics(scaleSalesFact(source));
  assert.equal(metrics.refundRate, source.refund / source.sales);
  assert.equal(metrics.grossMarginRate, source.gross_profit / source.net_sales);
  assert.equal(metrics.averageSellingPrice, source.sales / source.qty);
});

test("keeps nulls, zeroes, prices, dimensions and non-sales records unchanged", () => {
  const row = { ...source, qty: 0, refund: null, unit_price: 100, productName: "商品" };
  const scaled = scaleSalesFact(row);
  assert.equal(scaled.qty, 0);
  assert.equal(scaled.refund, null);
  assert.equal(scaled.unit_price, 100);
  assert.equal(scaled.productName, "商品");
  assert.deepEqual(scaleBusinessRecord({ id: "project-1", inventory: 12 }), { id: "project-1", inventory: 12 });
});

test("validates totals and produces deterministic non-source display ids", () => {
  const sourceTotals = { qty: 10, sales: 1000, refund: 100, net_sales: 900, cost: 400, gross_profit: 500 };
  const displayTotals = scaleSalesFact(sourceTotals);
  assert.deepEqual(validateSalesTransform(sourceTotals, displayTotals), { valid: true, errors: [] });
  assert.equal(validateSalesTransform(sourceTotals, { ...displayTotals, refund: 100 }).valid, false);
  assert.equal(validateSalesTransform(sourceTotals, { ...displayTotals, net_sales: 1700 }).valid, false);

  const first = deterministicDisplayId("order-100", 1);
  assert.equal(first, deterministicDisplayId("order-100", 1));
  assert.notEqual(first, deterministicDisplayId("order-100", 2));
  assert.notEqual(first, "order-100");
});
