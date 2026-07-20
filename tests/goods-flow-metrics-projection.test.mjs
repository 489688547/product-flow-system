import assert from "node:assert/strict";
import test from "node:test";
import { buildGoodsFlowMetricInput } from "../functions/api/platform/v1/goods-flow/_shared/metricsProjection.js";

test("metric input separates monthly operating facts from cumulative inventory funds", () => {
  const input = buildGoodsFlowMetricInput({
    month: "2026-07",
    events: [
      { id: "sale-old", eventType: "sale_consumed", occurredAt: "2026-06-30T00:00:00.000Z", payload: { platform: "天猫", netSales: 200, cost: 60 } },
      { id: "sale-current", eventType: "sale_consumed", occurredAt: "2026-07-12T00:00:00.000Z", payload: { platform: "天猫", netSales: 1000, cost: 310 } },
      { id: "sale-future", eventType: "sale_consumed", occurredAt: "2026-08-01T00:00:00.000Z", payload: { platform: "天猫", netSales: 500, cost: 100 } },
      { id: "purchase-current", eventType: "purchase_approved", purchaseId: "purchase-1", occurredAt: "2026-07-01T00:00:00.000Z", payload: { approvedAmount: 100, receivedAt: "2026-07-01T00:00:00.000Z" } },
      { id: "payment-old", eventType: "purchase_paid", purchaseId: "purchase-old", occurredAt: "2026-06-10T00:00:00.000Z", payload: { amount: 50 } },
      { id: "payment-current", eventType: "purchase_paid", purchaseId: "purchase-1", occurredAt: "2026-07-21T00:00:00.000Z", payload: { amount: 100 } },
      { id: "adjustment", eventType: "inventory_adjustment_confirmed", occurredAt: "2026-07-20T00:00:00.000Z", payload: { amountVariance: -5 } }
    ],
    inventoryDaily: [
      { date: "2026-07-31", calibratedInventoryValue: 310 },
      { date: "2026-08-01", calibratedInventoryValue: 999 }
    ],
    receivableTerms: [{ platform: "天猫", days: 30, effectiveFrom: "2026-01-01" }]
  });

  assert.equal(input.periodEnd, "2026-07-31");
  assert.equal(input.daysInPeriod, 31);
  assert.deepEqual(input.sales, [{ platform: "天猫", date: "2026-07-12", netSales: 1000, cost: 310 }]);
  assert.equal(input.inventoryDaily.length, 1);
  assert.equal(input.inventoryFunds.paidPurchaseAmount, 150);
  assert.equal(input.inventoryFunds.consumedSalesCost, 370);
  assert.equal(input.inventoryFunds.confirmedStocktakeAdjustment, -5);
});

test("malformed and future events never become metric facts", () => {
  const input = buildGoodsFlowMetricInput({
    month: "2026-07",
    events: [
      { eventType: "sale_consumed", occurredAt: "2026-07-10T00:00:00.000Z", payloadMalformed: true, payload: { netSales: 100, cost: 20 } },
      { eventType: "purchase_paid", occurredAt: "2026-08-01T00:00:00.000Z", purchaseId: "purchase-1", payload: { amount: 100 } }
    ]
  });
  assert.deepEqual(input.sales, []);
  assert.equal(input.inventoryFunds.paidPurchaseAmount, 0);
});
