import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSupplyChainSummary,
  createDefaultSupplyChainState,
  normalizeSupplyChainState,
  parseInventoryImportRows,
  parseQualityImportRows,
  reduceSupplyChainState
} from "../src/domain/supplyChain.js";

test("approved payments aggregate one purchase without counting running or rejected payments", () => {
  const state = normalizeSupplyChainState({
    purchaseApprovals: [{ processInstanceId: "purchase-1", productIds: ["p1"], supplierId: "s1", approvedAmount: 100 }],
    paymentApprovals: [
      { processInstanceId: "pay-1", purchaseProcessInstanceId: "purchase-1", status: "COMPLETED", amount: 30 },
      { processInstanceId: "pay-2", purchaseProcessInstanceId: "purchase-1", status: "RUNNING", amount: 40 },
      { processInstanceId: "pay-3", purchaseProcessInstanceId: "purchase-1", status: "REJECTED", amount: 30 }
    ]
  });

  const summary = buildSupplyChainSummary({
    supplyState: state,
    products: [{ id: "p1", skuCodes: [{ code: "6977173969783" }] }],
    salesRows: []
  });

  assert.equal(summary.actualPaid, 30);
  assert.equal(summary.byProduct[0].actualPaid, 30);
  assert.equal(summary.bySupplier[0].actualPaid, 30);
});

test("a multi-product payment is allocated by purchase line amount", () => {
  const summary = buildSupplyChainSummary({
    supplyState: normalizeSupplyChainState({
      purchaseApprovals: [{ processInstanceId: "purchase-1", supplierId: "s1" }],
      purchaseLines: [
        { id: "line-1", purchaseProcessInstanceId: "purchase-1", productId: "p1", amount: 75 },
        { id: "line-2", purchaseProcessInstanceId: "purchase-1", productId: "p2", amount: 25 }
      ],
      paymentApprovals: [{ processInstanceId: "pay-1", purchaseProcessInstanceId: "purchase-1", status: "COMPLETED", amount: 80 }]
    }),
    products: [{ id: "p1" }, { id: "p2" }],
    salesRows: []
  });

  assert.equal(summary.byProduct.find(item => item.productId === "p1").actualPaid, 60);
  assert.equal(summary.byProduct.find(item => item.productId === "p2").actualPaid, 20);
});

test("inventory funds subtract sales cost and include confirmed adjustment", () => {
  const summary = buildSupplyChainSummary({
    supplyState: normalizeSupplyChainState({
      purchaseApprovals: [{ processInstanceId: "purchase-1", productIds: ["p1"], supplierId: "s1" }],
      paymentApprovals: [{ processInstanceId: "pay-1", purchaseProcessInstanceId: "purchase-1", status: "COMPLETED", amount: 100 }],
      inventoryAdjustments: [
        { id: "adjust-1", productId: "p1", supplierId: "s1", adjustmentAmount: -5, status: "confirmed" },
        { id: "adjust-2", productId: "p1", supplierId: "s1", adjustmentAmount: 500, status: "draft" }
      ]
    }),
    products: [{ id: "p1", skuCodes: [{ code: "6977173969783" }] }],
    salesRows: [{ code: "6977173969783", cost: 40, qty: 2 }]
  });

  assert.equal(summary.consumedSalesCost, 40);
  assert.equal(summary.rawInventoryFunds, 60);
  assert.equal(summary.adjustedInventoryFunds, 55);
});

test("supplier inventory funds use product material consumption per sale", () => {
  const summary = buildSupplyChainSummary({
    supplyState: normalizeSupplyChainState({
      suppliers: [{ id: "s1", name: "包材供应商" }],
      purchaseApprovals: [{ processInstanceId: "purchase-1", productIds: ["p1"], supplierId: "s1" }],
      paymentApprovals: [{ processInstanceId: "pay-1", purchaseProcessInstanceId: "purchase-1", status: "COMPLETED", amount: 100 }],
      productSupplierLinks: [{ id: "link-1", productId: "p1", supplierId: "s1", unitCost: 2, consumptionPerSale: 3, status: "active" }]
    }),
    products: [{ id: "p1", skuCodes: [{ code: "6977173969783" }] }],
    salesRows: [{ code: "6977173969783", cost: 40, qty: 4 }]
  });
  assert.equal(summary.byProduct[0].consumedSalesCost, 40);
  assert.equal(summary.bySupplier[0].consumedSalesCost, 24);
  assert.equal(summary.bySupplier[0].adjustedInventoryFunds, 76);
});

test("inventory import validates product mapping and computes ERP variance", () => {
  const result = parseInventoryImportRows([
    { 商品编码: "6977173969783", 盘点数量: "12", ERP库存: "10", 库存金额: "240", 供应商编码: "SUP-1" },
    { 商品编码: "unknown", 盘点数量: "3", ERP库存: "3", 库存金额: "20" }
  ], {
    products: [{ id: "p1", skuCodes: [{ code: "6977173969783" }] }],
    suppliers: [{ id: "s1", code: "SUP-1" }]
  });

  assert.equal(result.validRows.length, 1);
  assert.equal(result.validRows[0].productId, "p1");
  assert.equal(result.validRows[0].supplierId, "s1");
  assert.equal(result.validRows[0].quantityVariance, 2);
  assert.equal(result.errors.length, 1);
});

test("quality import maps product and keeps rows requiring public-relations follow-up", () => {
  const result = parseQualityImportRows([
    { 商品编码: "6977173969783", 平台: "天猫", 差评内容: "包装破损", 公关状态: "待处理", 订单号: "TM-1" }
  ], { products: [{ id: "p1", skuCodes: [{ code: "6977173969783" }] }] });

  assert.equal(result.validRows.length, 1);
  assert.equal(result.validRows[0].productId, "p1");
  assert.equal(result.validRows[0].status, "open");
  assert.equal(result.validRows[0].content, "包装破损");
});

test("reducer upserts records and keeps the normalized state shape", () => {
  const initial = createDefaultSupplyChainState();
  const next = reduceSupplyChainState(initial, {
    type: "upsert",
    collection: "suppliers",
    record: { id: "s1", name: "杭州鲜宠食品", category: "原料" }
  });
  const updated = reduceSupplyChainState(next, {
    type: "upsert",
    collection: "suppliers",
    record: { id: "s1", name: "杭州鲜宠食品有限公司" }
  });

  assert.equal(updated.suppliers.length, 1);
  assert.equal(updated.suppliers[0].name, "杭州鲜宠食品有限公司");
  assert.ok(Array.isArray(updated.syncRuns));
});
