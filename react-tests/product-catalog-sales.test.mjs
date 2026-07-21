import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateProductCatalogSales,
  currentShanghaiDate,
  productCatalogSalesRange,
  sortProductCatalogBySales
} from "../src/domain/productCatalogSales.js";

test("catalog sales uses the Shanghai calendar day", () => {
  assert.equal(currentShanghaiDate(new Date("2026-07-20T17:00:00.000Z")), "2026-07-21");
});

test("product catalog sales range defaults to the latest 30 inclusive calendar days", () => {
  assert.deepEqual(productCatalogSalesRange("last30", {}, "2026-07-20"), {
    preset: "last30",
    from: "2026-06-21",
    to: "2026-07-20"
  });
  assert.deepEqual(productCatalogSalesRange("thisMonth", {}, "2026-07-20"), {
    preset: "thisMonth",
    from: "2026-07-01",
    to: "2026-07-20"
  });
  assert.deepEqual(productCatalogSalesRange("lastMonth", {}, "2026-07-20"), {
    preset: "lastMonth",
    from: "2026-06-01",
    to: "2026-06-30"
  });
});

test("custom catalog sales range rejects missing, reversed and overlong ranges", () => {
  assert.deepEqual(productCatalogSalesRange("custom", { from: "2026-07-01", to: "2026-07-18" }, "2026-07-20"), {
    preset: "custom",
    from: "2026-07-01",
    to: "2026-07-18"
  });
  assert.throws(() => productCatalogSalesRange("custom", { from: "", to: "2026-07-18" }), /请选择完整的开始和结束日期/);
  assert.throws(() => productCatalogSalesRange("custom", { from: "2026-07-19", to: "2026-07-18" }), /开始日期不能晚于结束日期/);
  assert.throws(() => productCatalogSalesRange("custom", { from: "2025-01-01", to: "2026-07-18" }), /最多查询 370 天/);
});

test("sales aggregation de-duplicates catalog codes and groups quantity by product and platform", () => {
  const items = [
    {
      id: "product-1",
      name: "商品一",
      skus: [
        { id: "sku-1", barcode: "6978705011208", merchantSkuCode: "SKU-1" },
        { id: "sku-1-copy", barcode: "6978705011208", merchantSkuCode: "SKU-1" },
        { id: "sku-2", barcode: "6978705011215", merchantSkuCode: "SKU-2" }
      ]
    },
    { id: "product-2", name: "商品二", skus: [{ id: "sku-3", barcode: "6978705011222" }] },
    { id: "product-3", name: "商品三", skus: [] }
  ];
  const result = aggregateProductCatalogSales(items, [
    { code: "6978705011208", platform: "抖音", qty: 4, netSales: 80 },
    { code: "6978705011215", platform: "天猫", qty: 2, netSales: 50 },
    { code: "6978705011208", platform: "抖音", qty: 1, netSales: 20 },
    { code: "NOT-MATCHED", platform: "天猫", qty: 9, netSales: 100 }
  ]);

  assert.equal(result.items[0].sales.quantity, 7);
  assert.equal(result.items[0].sales.netSales, 150);
  assert.equal(result.items[0].sales.matchedCodeCount, 2);
  assert.deepEqual(result.items[0].sales.platforms, [
    { platform: "抖音", quantity: 5, netSales: 100 },
    { platform: "天猫", quantity: 2, netSales: 50 }
  ]);
  assert.deepEqual(result.items[1].sales, { quantity: 0, netSales: 0, matchedCodeCount: 0, platforms: [] });
  assert.equal(result.meta.totalQuantity, 7);
  assert.equal(result.meta.totalNetSales, 150);
  assert.equal(result.meta.coveredProducts, 1);
  assert.equal(result.meta.unmatchedRowCount, 1);
});

test("a code attached to multiple products remains unmatched instead of double counting", () => {
  const result = aggregateProductCatalogSales([
    { id: "product-1", skus: [{ barcode: "6978705011208" }] },
    { id: "product-2", skus: [{ merchantSkuCode: "6978705011208" }] }
  ], [{ code: "6978705011208", platform: "抖音", qty: 3, netSales: 60 }]);

  assert.equal(result.meta.totalQuantity, 0);
  assert.equal(result.meta.unmatchedRowCount, 1);
  assert.deepEqual(result.items.map(item => item.sales.quantity), [0, 0]);
});

test("catalog rows put the highest-selling products first with a stable name fallback", () => {
  const items = [
    { id: "zero", name: "零销量", sales: { quantity: 0, netSales: 0 } },
    { id: "second", name: "乙商品", sales: { quantity: 8, netSales: 120 } },
    { id: "first", name: "甲商品", sales: { quantity: 8, netSales: 160 } }
  ];

  assert.deepEqual(sortProductCatalogBySales(items).map(item => item.id), ["first", "second", "zero"]);
  assert.deepEqual(items.map(item => item.id), ["zero", "second", "first"]);
});
