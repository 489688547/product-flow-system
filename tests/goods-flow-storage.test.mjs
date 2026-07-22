import test from "node:test";
import assert from "node:assert/strict";
import { createGoodsFlowD1Mock } from "./helpers/goods-flow-d1-mock.mjs";
import {
  appendGoodsFlowEvents,
  listGoodsFlowEvents,
  listMonthlyMetrics,
  listReceivableTerms,
  saveMonthlyMetrics,
  upsertReceivableTerm
} from "../functions/api/platform/v1/goods-flow/_shared/storage.js";
import { projectLegacyGoodsFlow } from "../functions/api/platform/v1/goods-flow/_shared/legacyProjection.js";

test("event storage is idempotent by source reference and version", async () => {
  const db = createGoodsFlowD1Mock();
  const event = {
    id: "event-1",
    eventType: "purchase_paid",
    purchaseId: "purchase-1",
    occurredAt: "2026-07-10T00:00:00.000Z",
    source: "dingtalk-approval",
    sourceReference: "payment-1",
    sourceVersion: "1",
    payload: { amount: 300 },
    createdAt: "2026-07-20T00:00:00.000Z"
  };
  await appendGoodsFlowEvents(db, [event, { ...event, id: "event-duplicate" }]);
  assert.equal(db.tables.goods_flow_events.size, 1);
});

test("malformed event payloads are isolated from valid facts", async () => {
  const db = createGoodsFlowD1Mock();
  await appendGoodsFlowEvents(db, [{
    id: "event-valid",
    eventType: "sale_consumed",
    occurredAt: "2026-07-19T00:00:00.000Z",
    source: "kuaimai-sales",
    sourceReference: "sale-1",
    sourceVersion: "1",
    payload: { quantity: 2 },
    createdAt: "2026-07-20T00:00:00.000Z"
  }]);
  db.tables.goods_flow_events.set("broken:row:1", {
    ...db.tables.goods_flow_events.values().next().value,
    id: "event-broken",
    source: "broken",
    source_reference: "row",
    payload: "{not-json"
  });

  const rows = await listGoodsFlowEvents(db);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.find(row => row.id === "event-valid").payload, { quantity: 2 });
  assert.equal(rows.find(row => row.id === "event-broken").payloadMalformed, true);
});

test("finance terms reject overlapping effective ranges", async () => {
  const db = createGoodsFlowD1Mock();
  await upsertReceivableTerm(db, {
    id: "tmall-30",
    platform: "天猫",
    days: 30,
    effectiveFrom: "2026-01-01",
    effectiveTo: "2026-12-31",
    reason: "年度账期",
    version: 1
  }, "财务同事", "2026-07-20T00:00:00.000Z");
  await assert.rejects(() => upsertReceivableTerm(db, {
    id: "tmall-45",
    platform: "天猫",
    days: 45,
    effectiveFrom: "2026-07-01",
    reason: "大促调整",
    version: 1
  }, "财务同事", "2026-07-20T00:00:00.000Z"), error => error.code === "GOODS_FLOW_TERM_OVERLAP");
  assert.equal((await listReceivableTerms(db)).length, 1);
});

test("monthly metrics append versions instead of overwriting frozen history", async () => {
  const db = createGoodsFlowD1Mock();
  const base = {
    month: "2026-07",
    formulaVersion: "goods-flow-v1",
    cccDays: 37,
    inventoryDays: 31,
    receivableDays: 24,
    payableDays: 18,
    stockoutRate: 4,
    inventoryCashTied: 800,
    coverage: { inventory: 1 },
    confidence: "complete",
    status: "frozen"
  };
  await saveMonthlyMetrics(db, { ...base, id: "ccc-1", version: 1 }, "财务同事", "2026-07-20T00:00:00.000Z");
  await saveMonthlyMetrics(db, { ...base, id: "ccc-2", version: 2, cccDays: 35 }, "财务同事", "2026-07-21T00:00:00.000Z");
  const rows = await listMonthlyMetrics(db, { month: "2026-07" });
  assert.deepEqual(rows.map(row => [row.version, row.cccDays]), [[2, 35], [1, 37]]);
});

test("legacy projection keeps linked approvals and reports uncertain mappings", () => {
  const projection = projectLegacyGoodsFlow({
    asOf: "2026-07-20",
    products: [{ id: "product-1", name: "木丝绒", skuCodes: ["690001"] }],
    salesRows: [{ code: "690001", platform: "天猫", qty: 2, netSales: 80, cost: 20, date: "2026-07-19" }],
    supplyState: {
      suppliers: [{ id: "supplier-1", name: "德杉工厂" }],
      purchaseApprovals: [{ id: "purchase-1", processInstanceId: "purchase-1", supplierId: "supplier-1", productIds: ["product-1"], status: "COMPLETED", approvedAmount: 100, receivedAt: "2026-07-02" }],
      paymentApprovals: [
        { id: "payment-1", processInstanceId: "payment-1", purchaseProcessInstanceId: "purchase-1", amount: 100, status: "COMPLETED", completedAt: "2026-07-10" },
        { id: "payment-2", processInstanceId: "payment-2", amount: 50, status: "COMPLETED", completedAt: "2026-07-11" }
      ],
      inventorySnapshots: [
        { id: "inventory-1", skuCode: "690001", warehouse: "兰山云仓", erpQuantity: 10, sourceType: "kuaimai-import", stocktakeDate: "2026-07-20" },
        { id: "inventory-unknown", skuCode: "UNKNOWN", warehouse: "兰山云仓", erpQuantity: 3, sourceType: "kuaimai-import", stocktakeDate: "2026-07-20" }
      ]
    }
  });
  assert.equal(projection.events.filter(row => row.eventType === "purchase_paid").length, 1);
  assert.equal(projection.events.some(row => row.sourceReference === "payment-2"), false);
  assert.equal(projection.exceptions.some(row => row.code === "GOODS_FLOW_PURCHASE_LINK_REQUIRED"), true);
  assert.equal(projection.exceptions.some(row => row.code === "GOODS_FLOW_SKU_MAPPING_REQUIRED"), true);
  assert.equal(projection.inventoryDaily[0].skuId, "product-1::690001");
  assert.equal(projection.events.find(row => row.eventType === "sale_consumed").payload.netSales, 80);
  assert.equal(projection.events.find(row => row.eventType === "purchase_approved").payload.receivedAt, "2026-07-02T00:00:00.000Z");
});

test("legacy projection expands one bundle sale into inventory-unit consumption once", () => {
  const projection = projectLegacyGoodsFlow({
    asOf: "2026-07-20",
    catalogItems: [
      {
        id: "catalog-bundle",
        merchantCode: "2DGZZ",
        productKind: "bundle",
        skus: [],
        components: [{ id: "bundle-component", inventoryUnitCode: "1111", ratio: 2, purchasePrice: 2.5 }]
      },
      {
        id: "catalog-single",
        merchantCode: "SINGLE-1111",
        productKind: "single",
        skus: [{ id: "physical-1111", barcode: "1111", barcodeType: "internal_unique", purchasePrice: 2.5 }],
        components: []
      }
    ],
    salesRows: [{ id: "bundle-sale", code: "2DGZZ", platform: "天猫", qty: 3, netSales: 60, date: "2026-07-19" }]
  });

  const event = projection.events.find(row => row.eventType === "sale_consumed");
  assert.equal(projection.events.filter(row => row.eventType === "sale_consumed").length, 1);
  assert.equal(event.payload.quantity, 3);
  assert.equal(event.payload.netSales, 60);
  assert.equal(event.payload.cost, 15);
  assert.deepEqual(event.payload.components, [{ inventoryUnitCode: "1111", ratio: 2, quantity: 6, unitCost: 2.5, cost: 15 }]);
  assert.equal(projection.exceptions.length, 0);
});
