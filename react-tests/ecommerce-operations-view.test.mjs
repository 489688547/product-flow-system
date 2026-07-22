import assert from "node:assert/strict";
import test from "node:test";

import {
  buildOperationsCockpit,
  buildOperationsDataSnapshot,
  evidenceSnapshotForScope
} from "../src/domain/ecommerceOperationsView.js";

const catalogItems = [
  { id: "product-food", name: "莓果冻干主粮", skus: [{ barcode: "6970000000001" }] },
  { id: "product-litter", name: "木丝绒 1kg", skus: [{ barcode: "6970000000002" }] }
];

const salesRows = [
  { date: "2026-07-20", platform: "抖音", code: "6970000000001", qty: 10, sales: 1200, netSales: 1100, grossProfit: 650, refund: 100 },
  { date: "2026-07-21", platform: "抖音", code: "6970000000001", qty: 12, sales: 1500, netSales: 1400, grossProfit: 800, refund: 100 },
  { date: "2026-07-21", platform: "天猫", code: "6970000000002", qty: 8, sales: 900, netSales: 850, grossProfit: 430, refund: 50 },
  { date: "2026-07-21", platform: "其它", code: "6970000000002", qty: 99, sales: 9900, netSales: 9900, grossProfit: 9000, refund: 0 }
];

const connections = [
  { id: "store-douyin", connectorId: "douyin-ecommerce", name: "抖音旗舰店", status: "healthy", enabled: true, lastDataDate: "2026-07-21" },
  { id: "store-tmall", connectorId: "taobao", accountType: "tmall", name: "天猫旗舰店", status: "pending_validation", enabled: true },
  { id: "erp", connectorId: "kuaimai-erp", name: "快麦 ERP", status: "healthy", enabled: true }
];

test("operations snapshot uses governed sales, real products and configured stores", () => {
  const snapshot = buildOperationsDataSnapshot({
    salesRows,
    catalogItems,
    connections,
    range: { from: "2026-07-01", to: "2026-07-21" },
    salesMeta: { timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true, lastSuccessfulSyncAt: "2026-07-22T01:00:00.000Z" }
  });

  assert.equal(snapshot.metrics.netSales, 3350);
  assert.equal(snapshot.metrics.grossProfit, 1880);
  assert.equal(snapshot.metrics.refundRate, 250 / 3600 * 100);
  assert.deepEqual(snapshot.platforms.map(item => item.platform), ["抖音", "天猫"]);
  assert.deepEqual(snapshot.products.map(item => item.id), ["product-food", "product-litter"]);
  assert.deepEqual(snapshot.stores.map(item => item.id), ["store-douyin", "store-tmall"]);
  assert.equal(snapshot.quality.latestDataDate, "2026-07-21");
  assert.equal(snapshot.quality.timeBasis, "create_time");
  assert.equal(snapshot.availability.storeSales, false);
  assert.equal(snapshot.availability.advertising, false);
});

test("missing datasets stay null instead of pretending zero", () => {
  const snapshot = buildOperationsDataSnapshot({
    salesRows: [],
    catalogItems,
    connections: [],
    range: { from: "2026-07-01", to: "2026-07-21" },
    salesMeta: {}
  });
  assert.deepEqual(snapshot.metrics, {
    netSales: null,
    grossProfit: null,
    refundRate: null,
    grossMarginRate: null,
    quantity: null
  });
  assert.equal(snapshot.quality.status, "unavailable");
  assert.equal(snapshot.availability.advertising, false);
  assert.equal(snapshot.availability.inventory, false);
});

test("inventory projection uses governed goods-flow facts without inventing risk thresholds", () => {
  const snapshot = buildOperationsDataSnapshot({
    salesRows,
    catalogItems,
    range: { from: "2026-07-01", to: "2026-07-21" },
    inventory: [
      { skuId: "sku-1", sellableQuantity: 8, daysOfSupply: 4 },
      { skuId: "sku-2", sellableQuantity: 20, daysOfSupply: 12 }
    ],
    goodsFlowDashboard: { metrics: { inventoryDays: 32, stockoutRate: 4.2, confidence: "complete" } },
    inventoryQuality: { inventoryCoverage: 0.8, metricCoverage: { inventory: 1 }, confidence: "complete" }
  });
  assert.equal(snapshot.availability.inventory, true);
  assert.deepEqual(snapshot.inventory, {
    rowCount: 2,
    sellableQuantity: 28,
    minimumDaysOfSupply: 4,
    inventoryDays: 32,
    stockoutRate: 4.2,
    coverage: 0.8,
    confidence: "complete"
  });
  assert.equal(Object.hasOwn(snapshot.inventory, "riskLevel"), false);
});

test("governed headline metrics never reuse results from another date range", () => {
  const snapshot = buildOperationsDataSnapshot({
    salesRows,
    catalogItems,
    range: { from: "2026-07-01", to: "2026-07-21" },
    metricResults: [{ metricCode: "sales.net_sales", value: 999999, from: "2026-06-01", to: "2026-06-30" }]
  });
  assert.equal(snapshot.metrics.netSales, null);
  assert.equal(snapshot.platforms[0].metrics.netSales, 2500);
});

test("scope evidence is automatic and never attributes platform totals to one store", () => {
  const snapshot = buildOperationsDataSnapshot({
    salesRows,
    catalogItems,
    connections,
    range: { from: "2026-07-01", to: "2026-07-21" },
    salesMeta: { timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true }
  });
  const evidence = evidenceSnapshotForScope(snapshot, {
    productId: "product-food",
    platform: "抖音",
    storeId: "store-douyin"
  });
  assert.equal(evidence.productName, "莓果冻干主粮");
  assert.equal(evidence.storeName, "抖音旗舰店");
  assert.equal(evidence.metrics.netSales, 2500);
  assert.equal(evidence.scopeLevel, "platform_product");
  assert.equal(evidence.storeMetricsAvailable, false);
  assert.match(evidence.limitations.join(" "), /店铺维度/);
  assert.equal(evidence.source.metricTimeBasis, "create_time");
});

test("cockpit separates manager decisions from operator actions and data blockers", () => {
  const state = {
    cycles: [{ id: "cycle-1", ownerId: "operator-1", product: "主粮", status: "active" }],
    plans: [
      { id: "plan-review", ownerId: "operator-1", product: "主粮", status: "submitted" },
      { id: "plan-returned", ownerId: "operator-1", product: "猫砂", status: "returned" }
    ],
    executions: [{ id: "execution-review", ownerId: "operator-1", planId: "plan-review", status: "submitted" }],
    collaborations: [{ id: "collab-overdue", title: "补库存", status: "overdue" }]
  };
  const manager = buildOperationsCockpit({ state, viewer: { id: "manager-1", manager: true }, dataQuality: { status: "stale" } });
  const operator = buildOperationsCockpit({ state, viewer: { id: "operator-1", manager: false }, dataQuality: { status: "ready" } });
  assert.deepEqual(manager.actions.map(item => item.type), ["review_plan", "review_execution", "resolve_collaboration", "data_quality"]);
  assert.deepEqual(operator.actions.map(item => item.type), ["revise_plan"]);
});
