import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogBarcodesForProduct,
  mergeCatalogRecords,
  normalizeCatalogPayload,
  parseProductCatalogRows
} from "../src/domain/productCatalog.js";

test("normalizes Kuaimai products and SKU identities without confusing lifecycle products", () => {
  const catalog = normalizeCatalogPayload({
    source: "kuaimai",
    items: [{
      sysItemId: 1001,
      outerId: "FCMZ",
      title: "发财毛毡",
      shortTitle: "毛毡",
      activeStatus: 1,
      brand: "提野星",
      classify: { fullName: ["宠物用品", "仓鼠用品"] },
      items: [{
        sysItemId: 1001,
        sysSkuId: 2001,
        skuOuterId: "FCMZ-01",
        barcode: "6978705011208",
        propertiesName: "标准款",
        purchasePrice: 9.5,
        priceOutput: 19.9,
        activeStatus: 1
      }]
    }]
  });

  assert.equal(catalog.items.length, 1);
  assert.match(catalog.items[0].id, /^kuaimai:item-code:/);
  assert.equal(catalog.items[0].merchantCode, "FCMZ");
  assert.equal(catalog.items[0].category, "宠物用品 / 仓鼠用品");
  assert.match(catalog.items[0].skus[0].id, /^kuaimai:sku-code:/);
  assert.equal(catalog.items[0].skus[0].barcodeType, "sales_barcode");
  assert.equal(catalog.items[0].skus[0].purchasePrice, 9.5);
});

test("normalizes object-shaped Kuaimai categories without leaking object text into the UI", () => {
  const catalog = normalizeCatalogPayload({
    source: "kuaimai",
    items: [{
      sysItemId: 1003,
      outerId: "OBJ-CAT",
      title: "对象类目商品",
      category: { name: "仓鼠用品", fullName: ["宠物用品", "仓鼠用品"] }
    }]
  });

  assert.equal(catalog.items[0].category, "宠物用品 / 仓鼠用品");
  assert.notEqual(catalog.items[0].category, "[object Object]");
});

test("normalizes JSON-array category text returned by Kuaimai", () => {
  const catalog = normalizeCatalogPayload({
    source: "kuaimai",
    items: [{ sysItemId: 1004, outerId: "JSON-CAT", title: "数组类目商品", category: '["仓鼠用品"]' }]
  });

  assert.equal(catalog.items[0].category, "仓鼠用品");
});

test("keeps internal unique codes valid and merges duplicate SKU rows", () => {
  const catalog = normalizeCatalogPayload({
    source: "kuaimai",
    items: [{
      sysItemId: 1002,
      outerId: "TEST",
      title: "测试商品",
      items: [
        { sysSkuId: 2002, skuOuterId: "TEST-01", barcode: "112233", activeStatus: 1 },
        { sysSkuId: 2002, skuOuterId: "TEST-01", barcode: "112233", activeStatus: 1 }
      ]
    }]
  });

  assert.equal(catalog.items[0].skus.length, 1);
  assert.equal(catalog.items[0].skus[0].barcodeType, "internal_unique");
  assert.deepEqual(catalogBarcodesForProduct(catalog.items, catalog.items[0].id), ["112233"]);
});

test("parses Kuaimai product archive rows and groups variants under one product", () => {
  const parsed = parseProductCatalogRows([
    {
      主商家编码: "SP-01",
      规格商家编码: "SP-01-RED",
      商品名称: "仓鼠小屋",
      商品简称: "小屋",
      规格: "红色",
      条形码: "6978705011222",
      成本价: "12.30",
      销售价: "29.90",
      重量: "0.4",
      商品分类: "仓鼠用品",
      品牌: "提野星",
      商品状态: "启用"
    },
    {
      主商家编码: "SP-01",
      规格商家编码: "SP-01-BLUE",
      商品名称: "仓鼠小屋",
      规格: "蓝色",
      条形码: "6978705011239",
      商品状态: "启用"
    },
    { 主商家编码: "", 规格商家编码: "", 商品名称: "无编码商品" }
  ], { source: "kuaimai-file", fileName: "商品档案V2.xlsx" });

  assert.equal(parsed.items.length, 1);
  assert.equal(parsed.items[0].skus.length, 2);
  assert.equal(parsed.items[0].name, "仓鼠小屋");
  assert.equal(parsed.items[0].skus[0].purchasePrice, 12.3);
  assert.equal(parsed.errors.length, 1);
  assert.equal(parsed.errors[0].rowNumber, 4);
});

test("normalization accepts JSON body returned by Kuaimai list API", () => {
  const catalog = normalizeCatalogPayload({
    source: "kuaimai",
    body: JSON.stringify({ items: [{ sysItemId: 9, outerId: "A9", title: "九号商品", barcode: "6978705011291" }] })
  });
  assert.equal(catalog.items[0].name, "九号商品");
  assert.equal(catalog.items[0].skus[0].barcode, "6978705011291");
});

test("Kuaimai API and Kuaimai file imports share one stable product identity", () => {
  const api = normalizeCatalogPayload({
    source: "kuaimai",
    items: [{ sysItemId: "1001", outerId: "FCMZ", title: "发财毛毡" }]
  });
  const file = parseProductCatalogRows([{
    系统主商品ID: "1001",
    主商家编码: "FCMZ",
    商品名称: "发财毛毡"
  }], { source: "kuaimai-file", fileName: "商品档案V2.xlsx" });

  assert.equal(file.items[0].id, api.items[0].id);
  assert.equal(file.items[0].source, "kuaimai");
});

test("uses a 69-style specification merchant code when Kuaimai omits barcode fields", () => {
  const file = parseProductCatalogRows([{
    主商家编码: "ZYZW",
    商品名称: "自由纸窝",
    规格商家编码: "6977173969363",
    "规格成本价(元)": "6.5",
    "规格销售价(元)": "18.9",
    商品品牌: "提野星",
    商品分类: "仓鼠用品"
  }], { source: "kuaimai-file" });

  assert.equal(file.items[0].skus[0].barcode, "6977173969363");
  assert.equal(file.items[0].skus[0].barcodeSource, "merchant_sku_code");
  assert.equal(file.items[0].skus[0].barcodeType, "sales_barcode");
  assert.equal(file.items[0].skus[0].purchasePrice, 6.5);
  assert.equal(file.items[0].brand, "提野星");
});

test("API refresh preserves file-only product and SKU enrichment", () => {
  const file = parseProductCatalogRows([{
    主商家编码: "ZYZW",
    商品名称: "自由纸窝",
    规格商家编码: "6977173969363",
    "规格条形码": "6977173969363",
    "规格成本价(元)": "6.5",
    供应商名称: "国产"
  }], { source: "kuaimai-file" }).items[0];
  const api = normalizeCatalogPayload({
    source: "kuaimai",
    items: [{ sysItemId: "1001", outerId: "ZYZW", title: "自由纸窝", skus: [] }]
  }).items[0];
  const merged = mergeCatalogRecords(file, api);

  assert.equal(merged.sourceProductId, "1001");
  assert.equal(merged.skus.length, 1);
  assert.equal(merged.skus[0].barcode, "6977173969363");
  assert.equal(merged.skus[0].purchasePrice, 6.5);
  assert.equal(merged.supplierName, "国产");
});
