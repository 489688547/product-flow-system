import assert from "node:assert/strict";
import test from "node:test";
import { projectKuaimaiErpRecords } from "../src/domain/kuaimaiErpProjection.js";

const now = "2026-07-22T10:00:00.000Z";

function record(sourceKey, payload, overrides = {}) {
  return {
    sourceKey,
    occurredAt: overrides.occurredAt || null,
    modifiedAt: Object.hasOwn(overrides, "modifiedAt") ? overrides.modifiedAt : now,
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

test("product snapshot groups SKU rows and preserves cost and classification", () => {
  const projection = projectKuaimaiErpRecords("products", [
    record("P-1::S-1", {
      productCode: "SPU-1",
      productName: "测试商品",
      skuCode: "SKU-1",
      barcode: "6978705011208",
      skuName: "红色",
      purchasePrice: "6.50",
      category: "仓鼠食品",
      brand: "提野星"
    }),
    record("P-1::S-2", {
      productCode: "SPU-1",
      productName: "测试商品",
      skuCode: "SKU-2",
      barcode: "6978705011215",
      skuName: "蓝色",
      purchasePrice: "7.00",
      category: "仓鼠食品",
      brand: "提野星"
    })
  ], { batchId: "batch-products", now });

  assert.equal(projection.catalog.items.length, 1);
  assert.equal(projection.catalog.items[0].category, "仓鼠食品");
  assert.equal(projection.catalog.items[0].brand, "提野星");
  assert.deepEqual(
    projection.catalog.items[0].skus.map(sku => [sku.merchantSkuCode, sku.barcode, sku.purchasePrice]),
    [
      ["SKU-1", "6978705011208", 6.5],
      ["SKU-2", "6978705011215", 7]
    ]
  );
});

test("kit and combination snapshots project official component relationships", () => {
  for (const resourceType of ["product_kits", "product_combinations"]) {
    const projection = projectKuaimaiErpRecords(resourceType, [
      record(`${resourceType}-1`, {
        productCode: resourceType === "product_kits" ? "KIT-1" : "COMBO-1",
        productName: resourceType === "product_kits" ? "测试套件" : "测试组合装",
        componentSkuCode: "SKU-1",
        componentName: "单品一",
        componentQuantity: "2",
        componentCost: "6.50"
      })
    ], { batchId: `batch-${resourceType}`, now });

    assert.equal(projection.catalog.items.length, 1);
    assert.equal(projection.catalog.items[0].productKind, "bundle");
    assert.deepEqual(projection.catalog.items[0].components, [{
      skuOuterId: "SKU-1",
      inventoryUnitCode: "SKU-1",
      title: "单品一",
      ratio: 2,
      purchasePrice: 6.5
    }]);
  }
});

test("inventory snapshot projects into daily inventory without inventing missing values", () => {
  const projection = projectKuaimaiErpRecords("inventory_snapshot", [record("wh-1::sku-1", {
    productCode: "P-001", skuCode: "SKU-001", quantity: "18", warehouseName: "华东仓"
  }, { warehouseId: "WH-1", modifiedAt: "2026-07-21T23:00:00+08:00" })], { batchId: "batch-stock", now });
  assert.equal(projection.inventoryDaily.length, 1);
  assert.equal(projection.inventoryDaily[0].date, "2026-07-22");
  assert.equal(projection.inventoryDaily[0].sourceUpdatedAt, "2026-07-21T23:00:00+08:00");
  assert.equal(projection.inventoryDaily[0].erpQuantity, 18);
  assert.equal(projection.inventoryDaily[0].warehouseId, "WH-1");
  assert.equal(projection.inventoryDaily[0].unitCost, null);
});

test("inventory projection reads official Chinese columns and preserves zero stock", () => {
  const projection = projectKuaimaiErpRecords("inventory_snapshot", [record("杭州仓::S-1", {
    仓库名称: "杭州仓",
    规格商家编码: "SKU-1",
    "69码": "6978705011208",
    实际总库存: "18",
    实际可用数: "0",
    成本价: "6.50"
  }, {
    warehouseId: "杭州仓",
    modifiedAt: "2026-07-26T05:12:00+08:00"
  })], {
    batchId: "batch-inventory",
    now: "2026-07-26T05:12:00.000Z"
  });

  assert.equal(projection.inventoryDaily.length, 1);
  assert.equal(projection.inventoryDaily[0].skuId, "kuaimai:sku:SKU-1");
  assert.equal(projection.inventoryDaily[0].skuCode, "SKU-1");
  assert.equal(projection.inventoryDaily[0].warehouseId, "杭州仓");
  assert.equal(projection.inventoryDaily[0].erpQuantity, 18);
  assert.equal(projection.inventoryDaily[0].sellableQuantity, 0);
  assert.equal(projection.inventoryDaily[0].unitCost, 6.5);
  assert.equal(projection.inventoryDaily[0].sourceUpdatedAt, "2026-07-26T05:12:00+08:00");
  assert.equal(projection.inventoryDaily[0].confidence, "partial");
  assert.deepEqual(projection.inventoryQuality, {
    sourceRows: 1,
    projectedRows: 1,
    snapshotDate: "2026-07-26",
    quantityCoverage: 1,
    skuCoverage: 1,
    warehouseCoverage: 1,
    sourceUpdatedAt: "2026-07-26T05:12:00+08:00",
    complete: true,
    confidence: "partial"
  });
});

test("inventory projection uses Shanghai snapshot day and leaves unknown product mapping empty", () => {
  const projection = projectKuaimaiErpRecords("inventory_snapshot", [record("杭州仓::S-1", {
    仓库名称: "杭州仓",
    系统规格ID: "S-1",
    可用库存: "8"
  }, {
    warehouseId: "杭州仓",
    modifiedAt: null
  })], {
    batchId: "batch-inventory",
    now: "2026-07-25T21:12:00.000Z"
  });

  assert.equal(projection.inventoryDaily[0].date, "2026-07-26");
  assert.equal(projection.inventoryDaily[0].productId, null);
  assert.equal(projection.inventoryDaily[0].skuId, "kuaimai:sku:S-1");
  assert.equal(projection.inventoryDaily[0].skuCode, "S-1");
});

test("inventory snapshot keeps the same SKU in multiple warehouses without inventing product IDs", () => {
  const projection = projectKuaimaiErpRecords("inventory_snapshot", [
    record("杭州仓::S-1", {
      仓库名称: "杭州仓",
      系统规格ID: "S-1",
      可用库存: "8"
    }, {
      warehouseId: "杭州仓",
      modifiedAt: "2026-06-01T09:00:00+08:00"
    }),
    record("广州仓::S-1", {
      仓库名称: "广州仓",
      系统规格ID: "S-1",
      可用库存: "5"
    }, {
      warehouseId: "广州仓",
      modifiedAt: "2026-07-20T09:00:00+08:00"
    })
  ], {
    batchId: "batch-multi-warehouse",
    now: "2026-07-25T21:12:00.000Z"
  });

  assert.deepEqual(
    projection.inventoryDaily.map(row => ({
      date: row.date,
      productId: row.productId,
      skuId: row.skuId,
      warehouseId: row.warehouseId,
      sourceUpdatedAt: row.sourceUpdatedAt
    })),
    [
      {
        date: "2026-07-26",
        productId: null,
        skuId: "kuaimai:sku:S-1",
        warehouseId: "杭州仓",
        sourceUpdatedAt: "2026-06-01T09:00:00+08:00"
      },
      {
        date: "2026-07-26",
        productId: null,
        skuId: "kuaimai:sku:S-1",
        warehouseId: "广州仓",
        sourceUpdatedAt: "2026-07-20T09:00:00+08:00"
      }
    ]
  );
  assert.notEqual(projection.inventoryDaily[0].id, projection.inventoryDaily[1].id);
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

test("rich sales-item exports project daily facts without losing refunds or return costs", () => {
  const projection = projectKuaimaiErpRecords("sales_items", [
    record("KM-1::6978705011208", {
      规格商家编码: "6978705011208",
      主商家编码: "SPU-1",
      商品名称: "测试商品",
      所属平台: "抖店(放心购)",
      销售数量: "3",
      退货数量: "1",
      商品买家已付金额: "59.7",
      销售金额: "60",
      销售成本: "24",
      退货成本: "8",
      退款金额: "10"
    }, { occurredAt: "2026-07-22T10:20:30+08:00" }),
    record("KM-2::6978705011208", {
      规格商家编码: "6978705011208",
      所属平台: "抖店(放心购)",
      销售数量: "2",
      退货数量: "0",
      商品买家已付金额: "39.8",
      销售金额: "40",
      销售成本: "16",
      退货成本: "0",
      退款金额: "0"
    }, { occurredAt: "2026-07-22T11:20:30+08:00" }),
    record("KM-3::INTERNAL-SKU", {
      规格商家编码: "INTERNAL-SKU",
      所属平台: "天猫",
      销售数量: "1",
      销售金额: "20",
      销售成本: "5",
      退款金额: "0"
    }, { occurredAt: "2026-07-22T12:20:30+08:00" })
  ], { batchId: "batch-sales", now });

  assert.deepEqual(projection.salesDaily, [{
    code: "6978705011208",
    date: "2026-07-22",
    platform: "抖店(放心购)",
    qty: 4,
    sales: 99.5,
    netSales: 90,
    grossProfit: 58,
    refund: 10,
    cost: 32,
    preShipRefund: 0,
    postShipRefund: 0
  }]);
  assert.equal(projection.exceptions.some(item => item.code === "SALES_CODE_UNMAPPED"), true);
});
