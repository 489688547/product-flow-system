import assert from "node:assert/strict";
import test from "node:test";
import { buildGoodsFlowMigrationPreview } from "../scripts/preview-goods-flow-migration.mjs";

const snapshot = {
  asOf: "2026-07-20",
  products: [{ id: "product-1", name: "木丝绒", skuCodes: ["690001"] }],
  salesRows: [
    { id: "sale-known", code: "690001", date: "2026-07-19", qty: 2, cost: 20 },
    { id: "sale-unknown", code: "UNKNOWN", date: "2026-07-19", qty: 1, cost: 5, customerName: "不应输出" }
  ],
  supplyState: {
    purchaseApprovals: [{ id: "purchase-1", processInstanceId: "purchase-1", status: "COMPLETED", approvedAmount: 100 }],
    paymentApprovals: [
      { id: "payment-1", processInstanceId: "payment-1", purchaseProcessInstanceId: "purchase-1", status: "COMPLETED", amount: 100 },
      { id: "payment-unlinked", processInstanceId: "payment-unlinked", status: "COMPLETED", amount: 50, bankAccount: "不应输出" }
    ],
    inventorySnapshots: [
      { id: "inventory-1", skuCode: "690001", warehouse: "兰山云仓", erpQuantity: 10, sourceType: "kuaimai-import", stocktakeDate: "2026-07-20" },
      { id: "inventory-unknown", skuCode: "UNKNOWN", warehouse: "兰山云仓", erpQuantity: 2, sourceType: "kuaimai-import", stocktakeDate: "2026-07-20" }
    ]
  }
};

test("migration preview reports counts, coverage and blocking differences without writing", () => {
  const report = buildGoodsFlowMigrationPreview(snapshot);
  assert.deepEqual(Object.keys(report), ["counts", "coverage", "unmapped", "blockingDifferences"]);
  assert.equal(report.counts.inventoryDaily, 1);
  assert.equal(report.counts.purchasePaid, 1);
  assert.equal(report.unmapped.length, 2);
  assert.equal(report.blockingDifferences.some(row => row.type === "payment_without_purchase"), true);
  assert.equal(report.coverage.inventory, 0.5);
  assert.equal(report.coverage.sales, 0.5);
});

test("migration preview redacts raw source payload and personal fields", () => {
  const serialized = JSON.stringify(buildGoodsFlowMigrationPreview(snapshot));
  assert.doesNotMatch(serialized, /不应输出|bankAccount|customerName|rawPayload/);
  assert.match(serialized, /payment-unlinked/);
});
