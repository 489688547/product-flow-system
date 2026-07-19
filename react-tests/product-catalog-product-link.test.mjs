import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { catalogBackedProduct, mergeProductCatalogLink } from "../src/domain/productCatalog.js";
import { normalizeClientState } from "../src/state/stateModel.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const catalogItem = {
  id: "kuaimai:item:1001",
  merchantCode: "FCMZ",
  name: "发财毛毡",
  skus: [
    { id: "kuaimai:sku:1", barcode: "6978705011208", barcodeType: "sales_barcode", salePrice: 19.9 },
    { id: "kuaimai:sku:2", barcode: "6978705011215", barcodeType: "sales_barcode", salePrice: 29.9 },
    { id: "kuaimai:sku:3", barcode: "112233", barcodeType: "non_standard", salePrice: 9.9 }
  ]
};

test("linking a lifecycle product keeps its identity and derives catalog barcodes", () => {
  const product = { id: "p1", name: "业务产品", skuCodes: [{ code: "6978705011208", price: 18.8 }] };
  const linked = mergeProductCatalogLink(product, catalogItem);
  assert.equal(linked.id, "p1");
  assert.equal(linked.name, "业务产品");
  assert.equal(linked.catalogProductId, catalogItem.id);
  assert.deepEqual(linked.skuCodes, [
    { code: "6978705011208", price: 18.8 },
    { code: "6978705011215", price: 29.9 }
  ]);
});

test("catalog-backed reads follow later ERP barcode changes without rewriting lifecycle state", () => {
  const stored = { id: "p1", name: "业务产品", catalogProductId: catalogItem.id, skuCodes: [{ code: "6978705011208", price: 18.8 }] };
  const resolved = catalogBackedProduct(stored, [{ ...catalogItem, skus: [{ id: "new", barcode: "6978705011291", barcodeType: "sales_barcode", salePrice: 39.9 }] }]);
  assert.deepEqual(resolved.skuCodes, [{ code: "6978705011291", price: 39.9 }]);
  assert.deepEqual(stored.skuCodes, [{ code: "6978705011208", price: 18.8 }]);
});

test("legacy products remain compatible and catalogProductId is normalized", () => {
  const state = normalizeClientState({ products: [{ id: "legacy", name: "旧产品", stage: 1, skuCodes: [{ code: "6978705011208" }] }] });
  const legacy = state.products.find(product => product.id === "legacy");
  assert.equal(legacy.catalogProductId, "");
  assert.equal(legacy.skuCodes[0].code, "6978705011208");
});

test("product archive uses a searchable shared catalog selector and catalog-backed sales", () => {
  const modal = read("src/features/archive/ProductModal.jsx");
  const archive = read("src/features/archive/ProductArchivePage.jsx");
  const selector = read("src/features/product-catalog/ProductCatalogSelect.jsx");
  assert.match(modal, /ERP 商品关联/);
  assert.match(modal, /ProductCatalogSelect/);
  assert.match(selector, /role="combobox"/);
  assert.match(selector, /搜索商品、69 码或商家编码/);
  assert.match(archive, /useProductCatalog/);
  assert.match(archive, /catalogBackedProduct/);
  assert.match(archive, /catalogItems=\{catalogItems\}/);
});
