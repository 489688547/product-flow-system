import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInventoryDailyRows,
  calculateGoodsFlowMetrics,
  calibrateInventoryQuantity,
  resolveReceivableTerm
} from "../src/domain/goodsFlow.js";

test("stocktake anchors calibrated inventory without overwriting ERP movement", () => {
  assert.equal(calibrateInventoryQuantity({
    currentErpQuantity: 88,
    anchorErpQuantity: 100,
    anchorCountedQuantity: 96
  }), 84);
  assert.equal(calibrateInventoryQuantity({ currentErpQuantity: 88 }), 88);
});

test("receivable terms use the version effective on the metric date", () => {
  const term = resolveReceivableTerm([
    { id: "tmall-30", platform: "天猫", days: 30, effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" },
    { id: "tmall-45", platform: "天猫", days: 45, effectiveFrom: "2026-07-01" },
    { id: "douyin-10", platform: "抖音", days: 10, effectiveFrom: "2026-01-01" }
  ], "天猫", "2026-07-20");
  assert.equal(term.id, "tmall-45");
  assert.equal(resolveReceivableTerm([], "天猫", "2026-07-20"), null);
});

test("daily inventory keeps ERP and physical values while deriving calibrated quantity", () => {
  const rows = buildInventoryDailyRows({
    asOf: "2026-07-20",
    erpSnapshots: [
      { id: "old", date: "2026-07-10", skuId: "sku-1", skuCode: "690001", warehouseId: "wh-1", quantity: 100, unitCost: 2 },
      { id: "current", date: "2026-07-20", skuId: "sku-1", skuCode: "690001", warehouseId: "wh-1", quantity: 88, unitCost: 2 }
    ],
    stocktakes: [{
      id: "st-1",
      countedAt: "2026-07-10",
      status: "confirmed",
      lines: [{ skuId: "sku-1", warehouseId: "wh-1", erpQuantity: 100, countedQuantity: 96 }]
    }]
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0], {
    date: "2026-07-20",
    skuId: "sku-1",
    skuCode: "690001",
    warehouseId: "wh-1",
    erpQuantity: 88,
    countedQuantity: 96,
    calibratedQuantity: 84,
    unitCost: 2,
    calibratedInventoryValue: 168,
    stocktakeId: "st-1",
    stocktakeStatus: "calibrated",
    sourceUpdatedAt: "2026-07-20"
  });
});

test("goods-flow metrics combine inventory receivable payable stockout and cash", () => {
  const metrics = calculateGoodsFlowMetrics({
    month: "2026-07",
    periodEnd: "2026-07-31",
    daysInPeriod: 31,
    inventoryDaily: [{
      date: "2026-07-20",
      skuId: "sku-1",
      calibratedInventoryValue: 3100,
      sellableQuantity: 0,
      isCore: true,
      stocktakeStatus: "calibrated"
    }],
    sales: [
      { platform: "天猫", netSales: 7000, cost: 3100 },
      { platform: "抖音", netSales: 3000, cost: 0 }
    ],
    receivableTerms: [
      { platform: "天猫", days: 30, effectiveFrom: "2026-01-01" },
      { platform: "抖音", days: 10, effectiveFrom: "2026-01-01" }
    ],
    purchases: [{ id: "po-1", amount: 1000, receivedAt: "2026-07-01" }],
    payments: [{ purchaseId: "po-1", amount: 600, paidAt: "2026-07-11" }],
    inventoryFunds: {
      paidPurchaseAmount: 4000,
      consumedSalesCost: 3100,
      confirmedStocktakeAdjustment: -100
    }
  });

  assert.deepEqual(metrics, {
    month: "2026-07",
    cccDays: 37,
    inventoryDays: 31,
    receivableDays: 24,
    payableDays: 18,
    stockoutRate: 100,
    inventoryCashTied: 800,
    coverage: {
      inventory: 1,
      salesCost: 1,
      receivableTerms: 1,
      payableDates: 1,
      stocktake: 1
    },
    confidence: "complete",
    formulaVersion: "goods-flow-v1"
  });
});

test("missing cost or platform terms stays visible instead of becoming zero", () => {
  const metrics = calculateGoodsFlowMetrics({
    month: "2026-07",
    periodEnd: "2026-07-31",
    daysInPeriod: 31,
    inventoryDaily: [{ date: "2026-07-20", skuId: "sku-1", calibratedInventoryValue: 100, sellableQuantity: 5, isCore: true }],
    sales: [{ platform: "未知平台", netSales: 1000 }],
    receivableTerms: [],
    purchases: [],
    payments: []
  });
  assert.equal(metrics.inventoryDays, null);
  assert.equal(metrics.receivableDays, null);
  assert.equal(metrics.payableDays, null);
  assert.equal(metrics.cccDays, null);
  assert.equal(metrics.coverage.salesCost, 0);
  assert.equal(metrics.coverage.receivableTerms, 0);
  assert.equal(metrics.confidence, "insufficient");
});
