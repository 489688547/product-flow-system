import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSupplyChainSummary,
  createDefaultSupplyChainState,
  normalizeSupplyChainState,
  parseInventoryImportRows,
  parseQualityImportRows,
  reduceSupplyChainState,
  resolveSupplyLinkProductId
} from "../src/domain/supplyChain.js";
import {
  GOODS_FLOW_STAGES,
  SUPPLY_CHAIN_WORKSPACES,
  buildGoodsFlowProgress,
  buildRoleWorkbench,
  normalizeSupplyChainSection
} from "../src/domain/supplyChainWorkflow.js";

test("supply chain workspaces follow the task-first product structure", () => {
  assert.deepEqual(SUPPLY_CHAIN_WORKSPACES.map(item => [item.section, item.label]), [
    ["workbench", "我的工作台"],
    ["planning", "计划与采购"],
    ["suppliers", "供应商"],
    ["transit", "生产与在途"],
    ["inventory", "库存与盘点"],
    ["quality", "质量闭环"],
    ["finance", "成本与财务"],
    ["rules", "数据与规则"]
  ]);
});

test("legacy supply chain sections resolve to the closest new workspace", () => {
  assert.equal(normalizeSupplyChainSection("overview"), "workbench");
  assert.equal(normalizeSupplyChainSection("demand"), "planning");
  assert.equal(normalizeSupplyChainSection("procurement"), "planning");
  assert.equal(normalizeSupplyChainSection("fulfillment"), "transit");
  assert.equal(normalizeSupplyChainSection("cash"), "finance");
  assert.equal(normalizeSupplyChainSection("records"), "rules");
  assert.equal(normalizeSupplyChainSection("settings"), "rules");
  assert.equal(normalizeSupplyChainSection("unknown"), "workbench");
});

test("goods flow progress never infers missing earlier milestones from a later receipt", () => {
  const progress = buildGoodsFlowProgress({
    milestones: [
      { stage: "purchase_order", status: "complete", actualAt: "2026-07-18T08:00:00+08:00" },
      { stage: "receipt", status: "complete", actualAt: "2026-07-24T15:00:00+08:00" }
    ]
  });

  assert.deepEqual(progress.stages.map(item => item.key), GOODS_FLOW_STAGES.map(item => item.key));
  assert.equal(progress.stages.find(item => item.key === "purchase_order").status, "complete");
  assert.equal(progress.stages.find(item => item.key === "receipt").status, "complete");
  assert.equal(progress.stages.find(item => item.key === "shipment").status, "waiting_data");
  assert.equal(progress.stages.find(item => item.key === "arrival").status, "waiting_data");
  assert.equal(progress.completeCount, 2);
  assert.equal(progress.qualityStatus, "partial");
});

test("goods flow progress marks an explicitly active overdue milestone without changing other stages", () => {
  const progress = buildGoodsFlowProgress({
    now: "2026-07-25T10:00:00+08:00",
    milestones: [
      { stage: "purchase_request", status: "complete", actualAt: "2026-07-20T09:00:00+08:00" },
      { stage: "approval", status: "active", plannedAt: "2026-07-24T18:00:00+08:00", ownerName: "采购主管" }
    ]
  });

  assert.equal(progress.stages.find(item => item.key === "approval").status, "overdue");
  assert.equal(progress.stages.find(item => item.key === "approval").ownerName, "采购主管");
  assert.equal(progress.stages.find(item => item.key === "production").status, "waiting_data");
  assert.equal(progress.currentStage.key, "approval");
});

test("role workbench shows an employee only assigned work while supervisors can see assignment gaps", () => {
  const items = [
    { id: "mine", title: "核对采购建议", ownerId: "user-1", ownerDepartment: "供应链部", status: "open" },
    { id: "other", title: "确认付款", ownerId: "user-2", ownerDepartment: "财务部", status: "open" },
    { id: "gap", title: "指派包材采购", ownerId: "", ownerDepartment: "", status: "open" },
    { id: "closed", title: "已完成", ownerId: "user-1", status: "closed" }
  ];

  const employee = buildRoleWorkbench({
    actor: { id: "user-1", departments: ["供应链部"], roles: ["品牌采购专员"] },
    items,
    now: "2026-07-25T10:00:00+08:00"
  });
  const supervisor = buildRoleWorkbench({
    actor: { id: "manager-1", departments: ["供应链部"], roles: ["品牌采购主管"] },
    items,
    now: "2026-07-25T10:00:00+08:00"
  });

  assert.deepEqual(employee.items.map(item => item.id), ["mine"]);
  assert.deepEqual(supervisor.items.map(item => item.id), ["gap", "mine", "other"]);
  assert.equal(supervisor.items.find(item => item.id === "gap").attentionState, "needs_assignment");
  assert.equal(supervisor.summary.needsAssignment, 1);
});

test("role workbench orders overdue work before upcoming and data-quality work", () => {
  const workbench = buildRoleWorkbench({
    actor: { id: "executive", executive: true },
    now: "2026-07-25T10:00:00+08:00",
    items: [
      { id: "normal", title: "普通事项", ownerId: "executive", status: "open" },
      { id: "quality", title: "库存数据过期", ownerId: "executive", kind: "data_quality", status: "open" },
      { id: "soon", title: "三天内到期", ownerId: "executive", status: "open", dueAt: "2026-07-27T10:00:00+08:00" },
      { id: "overdue", title: "已经逾期", ownerId: "executive", status: "open", dueAt: "2026-07-24T10:00:00+08:00" }
    ]
  });

  assert.deepEqual(workbench.items.map(item => item.id), ["overdue", "soon", "quality", "normal"]);
  assert.equal(workbench.summary.overdue, 1);
  assert.equal(workbench.summary.dueSoon, 1);
  assert.equal(workbench.summary.dataIssues, 1);
});

test("catalog supplier links resolve to the lifecycle product when available", () => {
  const products = [{ id: "p1", catalogProductId: "kuaimai:item:1001" }, { id: "kuaimai:item:1002" }];
  assert.equal(resolveSupplyLinkProductId({ catalogProductId: "kuaimai:item:1001" }, products), "p1");
  assert.equal(resolveSupplyLinkProductId({ productId: "kuaimai:item:1002" }, products), "kuaimai:item:1002");
});

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
  assert.equal(summary.byProduct[0].hasPaymentEvidence, true);
});

test("product funds preserve missing source evidence instead of presenting synthetic zero", () => {
  const summary = buildSupplyChainSummary({
    supplyState: normalizeSupplyChainState(),
    products: [{ id: "p1", name: "待接入产品" }],
    salesRows: []
  });
  assert.equal(summary.byProduct[0].actualPaid, 0);
  assert.equal(summary.byProduct[0].hasPaymentEvidence, false);
  assert.equal(summary.byProduct[0].hasSalesCostEvidence, false);
  assert.equal(summary.byProduct[0].hasInventoryFundsEvidence, false);
  assert.equal(summary.byProduct[0].hasBomCostEvidence, false);
});

test("approved payments flag purchases paid above the approved request amount", () => {
  const summary = buildSupplyChainSummary({
    supplyState: normalizeSupplyChainState({
      purchaseApprovals: [{ processInstanceId: "purchase-1", productIds: ["p1"], supplierId: "s1", approvedAmount: 100 }],
      paymentApprovals: [
        { processInstanceId: "pay-1", purchaseProcessInstanceId: "purchase-1", status: "COMPLETED", amount: 70 },
        { processInstanceId: "pay-2", purchaseProcessInstanceId: "purchase-1", status: "COMPLETED", amount: 50 }
      ]
    }),
    products: [{ id: "p1" }],
    salesRows: []
  });

  assert.equal(summary.actualPaid, 120);
  assert.equal(summary.exceptions.overpaidPurchases, 1);
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
  assert.equal(summary.byProduct[0].hasSalesCostEvidence, true);
  assert.equal(summary.byProduct[0].hasInventoryFundsEvidence, true);
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

test("latest ERP and physical stock use primary BOM cost without counting backup suppliers", () => {
  const summary = buildSupplyChainSummary({
    supplyState: normalizeSupplyChainState({
      suppliers: [{ id: "s1", name: "主供" }, { id: "s2", name: "备选" }],
      productSupplierLinks: [
        { id: "main", productId: "p1", supplierId: "s1", category: "原料", materialName: "主料", unitCost: 2.5, consumptionPerSale: 1, supplyRole: "primary", status: "active" },
        { id: "backup", productId: "p1", supplierId: "s2", category: "原料", materialName: "主料", unitCost: 9.9, consumptionPerSale: 1, supplyRole: "backup", status: "active" }
      ],
      inventorySnapshots: [
        { id: "old", productId: "p1", skuCode: "6977173969783", warehouse: "兰山云仓", stocktakeDate: "2026-05-01", erpQuantity: 90, countedQuantity: 90 },
        { id: "latest", productId: "p1", skuCode: "6977173969783", warehouse: "兰山云仓", stocktakeDate: "2026-06-01", erpQuantity: 100, countedQuantity: 96 }
      ]
    }),
    products: [{ id: "p1", name: "莓果粮", skuCodes: [{ code: "6977173969783" }] }],
    salesRows: []
  });

  assert.equal(summary.byProduct[0].bomUnitCost, 2.5);
  assert.equal(summary.byProduct[0].erpInventoryQuantity, 100);
  assert.equal(summary.byProduct[0].physicalInventoryQuantity, 96);
  assert.equal(summary.byProduct[0].quantityVariance, -4);
  assert.equal(summary.byProduct[0].erpInventoryValue, 250);
  assert.equal(summary.byProduct[0].physicalInventoryValue, 240);
});

test("inventory snapshots with an exact SKU dynamically link to the product summary", () => {
  const summary = buildSupplyChainSummary({
    supplyState: normalizeSupplyChainState({
      inventorySnapshots: [{
        id: "dingtalk-row",
        productId: "",
        productName: "莓果粮",
        skuCode: "6977173969783",
        warehouse: "全仓汇总",
        stocktakeDate: "2026-04-01",
        erpQuantity: 10,
        countedQuantity: 12,
        sourceType: "dingtalk-stocktake-import"
      }]
    }),
    products: [{ id: "p1", name: "莓果粮", skuCodes: [{ code: "6977173969783" }] }],
    salesRows: []
  });

  assert.equal(summary.byProduct[0].erpInventoryQuantity, 10);
  assert.equal(summary.byProduct[0].physicalInventoryQuantity, 12);
  assert.equal(summary.byProduct[0].quantityVariance, 2);
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

test("ERP inventory import accepts Kuaimai merchant barcode and available quantity without inventing a physical count", () => {
  const result = parseInventoryImportRows([
    { 规格商家编码: "6977173969783", 实际可用数: "38", 仓库: "兰山云仓" }
  ], {
    mode: "erp",
    products: [{ id: "p1", skuCodes: [{ code: "6977173969783" }] }]
  });

  assert.equal(result.errors.length, 0);
  assert.equal(result.validRows[0].erpQuantity, 38);
  assert.equal(result.validRows[0].countedQuantity, null);
  assert.equal(result.validRows[0].quantityVariance, null);
  assert.equal(result.validRows[0].warehouse, "兰山云仓");
  assert.equal(result.validRows[0].sourceType, "kuaimai-import");
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

test("quality import preserves batch supplier disposition corrective action and verification", () => {
  const result = parseQualityImportRows([{
    商品编码: "6977173969783",
    问题描述: "受潮",
    批次: "B-001",
    仓库: "兰山云仓",
    供应商: "原料主供",
    处置方式: "召回",
    整改措施: "调整烘干工艺",
    验证结果: "复检通过"
  }], {
    products: [{ id: "p1", skuCodes: [{ code: "6977173969783" }] }],
    suppliers: [{ id: "s1", name: "原料主供" }]
  });

  assert.equal(result.validRows[0].batchNo, "B-001");
  assert.equal(result.validRows[0].warehouse, "兰山云仓");
  assert.equal(result.validRows[0].supplierId, "s1");
  assert.equal(result.validRows[0].disposition, "召回");
  assert.equal(result.validRows[0].correctiveAction, "调整烘干工艺");
  assert.equal(result.validRows[0].verificationResult, "复检通过");
});

test("default supply settings contain the verified DingTalk processes and field names", () => {
  const state = createDefaultSupplyChainState();
  assert.equal(state.settings.purchaseProcessCode, "PROC-E55BD07B-14E8-4111-ACFC-23835F3211E2");
  assert.equal(state.settings.paymentProcessCode, "PROC-8E691E78-3D2D-45D5-9B77-C9EC5F8DFF6A");
  assert.equal(state.settings.fieldMappings.purchase.amountFieldId, "金额（元）");
  assert.equal(state.settings.fieldMappings.payment.relatedPurchaseFieldId, "采购申请单");
});

test("state normalization removes legacy raw approval payloads and payment account fields", () => {
  const state = normalizeSupplyChainState({
    paymentApprovals: [{
      id: "pay-1",
      processInstanceId: "pay-1",
      amount: 100,
      rawPayload: { formComponentValues: [{ name: "收款人信息", value: "6214 0000 0000" }] },
      payeeInfo: "6214 0000 0000",
      bankAccount: "621400000000"
    }]
  });
  const serialized = JSON.stringify(state.paymentApprovals[0]);
  assert.equal(serialized.includes("rawPayload"), false);
  assert.equal(serialized.includes("6214"), false);
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
  assert.ok(Array.isArray(updated.materialInventorySnapshots));
  assert.ok(Array.isArray(updated.inventoryRisks));
});
