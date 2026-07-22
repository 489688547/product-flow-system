import assert from "node:assert/strict";
import test from "node:test";
import { projectKuaimaiErpRecords } from "../src/domain/kuaimaiErpProjection.js";

const now = "2026-07-22T10:00:00.000Z";

function record(sourceKey, payload, overrides = {}) {
  return {
    sourceKey,
    occurredAt: overrides.occurredAt || null,
    modifiedAt: overrides.modifiedAt || now,
    shopId: overrides.shopId || null,
    warehouseId: overrides.warehouseId || null,
    contentHash: overrides.contentHash || "a".repeat(64),
    payload
  };
}

test("product and SKU resources project into the shared product catalog", () => {
  const products = projectKuaimaiErpRecords("products", [record("p-1", {
    productCode: "P-001", productName: "测试商品", supplierName: "测试供应商", status: "正常"
  })], { batchId: "batch-products", now });
  assert.equal(products.catalog.items.length, 1);
  assert.equal(products.catalog.items[0].merchantCode, "P-001");
  assert.equal(products.catalog.items[0].name, "测试商品");

  const skus = projectKuaimaiErpRecords("skus", [record("sku-1", {
    productCode: "P-001", skuCode: "SKU-001", barcode: "6978705011208", skuName: "红色"
  })], { batchId: "batch-skus", now });
  assert.equal(skus.catalog.items[0].skus[0].merchantSkuCode, "SKU-001");
  assert.equal(skus.catalog.items[0].skus[0].barcode, "6978705011208");
});

test("inventory snapshot projects into daily inventory without inventing missing values", () => {
  const projection = projectKuaimaiErpRecords("inventory_snapshot", [record("wh-1::sku-1", {
    productCode: "P-001", skuCode: "SKU-001", quantity: "18", warehouseName: "华东仓"
  }, { warehouseId: "WH-1", modifiedAt: "2026-07-21T23:00:00+08:00" })], { batchId: "batch-stock", now });
  assert.equal(projection.inventoryDaily.length, 1);
  assert.equal(projection.inventoryDaily[0].date, "2026-07-21");
  assert.equal(projection.inventoryDaily[0].erpQuantity, 18);
  assert.equal(projection.inventoryDaily[0].warehouseId, "WH-1");
  assert.equal(projection.inventoryDaily[0].unitCost, null);
});

test("movement, purchase and aftersales resources become idempotent goods-flow events", () => {
  const movement = projectKuaimaiErpRecords("inventory_movements", [record("move-1", {
    skuCode: "SKU-001", quantity: "-2", movementType: "销售出库", documentNumber: "OUT-1"
  }, { occurredAt: "2026-07-21T12:00:00+08:00", warehouseId: "WH-1" })], { batchId: "batch-move", now });
  assert.equal(movement.events[0].eventType, "inventory_movement");
  assert.equal(movement.events[0].payload.quantity, -2);

  const purchase = projectKuaimaiErpRecords("purchase_orders", [record("PO-1", {
    supplierCode: "SUP-1", supplierName: "供应商", amount: "100", status: "已审核"
  }, { occurredAt: "2026-07-20T10:00:00+08:00", warehouseId: "WH-1" })], { batchId: "batch-purchase", now });
  assert.equal(purchase.events[0].eventType, "purchase_order");
  assert.equal(purchase.events[0].purchaseId, "PO-1");

  const aftersale = projectKuaimaiErpRecords("aftersales", [record("AS-1", {
    sourceOrderId: "ORDER-1", amount: "20", status: "退款成功"
  }, { occurredAt: "2026-07-19T10:00:00+08:00" })], { batchId: "batch-aftersale", now });
  assert.equal(aftersale.events[0].eventType, "aftersale");
  assert.equal(aftersale.events[0].sourceReference, "AS-1");
});

