import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogDataIssues,
  catalogSellableQuantity,
  flattenCatalogConsumption,
  normalizeCatalogComponent
} from "../src/domain/productCatalogGraph.js";
import { normalizeCatalogPayload } from "../src/domain/productCatalog.js";

function catalogItems() {
  return normalizeCatalogPayload({
    source: "kuaimai",
    items: [
      {
        sysItemId: 1,
        outerId: "BYMSDHBD",
        title: "白杨木砂2.7kg+大号冰垫",
        type: "2",
        suitSingleList: [
          { outerId: "6978705011727", title: "白杨木砂箱装2.7kg", ratio: 1, purchasePrice: 14.6 },
          { outerId: "6977173969059", title: "冰垫大号黄色", ratio: 1, purchasePrice: 4 }
        ]
      },
      {
        sysItemId: 2,
        outerId: "2DGZZ",
        title: "单个慕斯粽子*2",
        type: "2",
        suitSingleList: [{ outerId: "1111", title: "绿色粽子", ratio: 2, purchasePrice: 2.5 }]
      },
      { sysItemId: 3, outerId: "1111", title: "绿色粽子", barcode: "1111", purchasePrice: 2.5 },
      { sysItemId: 4, outerId: "6978705011727", title: "白杨木砂箱装2.7kg", barcode: "6978705011727", purchasePrice: 14.6 },
      { sysItemId: 5, outerId: "6977173969059", title: "冰垫大号黄色", barcode: "6977173969059", purchasePrice: 4 }
    ]
  }).items;
}

test("normalizes ERP internal unique codes as valid inventory units", () => {
  const items = catalogItems();
  const internal = items.find(item => item.merchantCode === "1111");

  assert.equal(internal.skus[0].barcodeType, "internal_unique");
  assert.equal(internal.productKind, "single");
  assert.equal(items.find(item => item.merchantCode === "2DGZZ").components[0].inventoryUnitCode, "1111");
});

test("expands a one-component bundle by its integer ratio without duplicating sales", () => {
  const items = catalogItems();
  const bundle = items.find(item => item.merchantCode === "2DGZZ");
  const result = flattenCatalogConsumption({ items, itemId: bundle.id, quantity: 3 });

  assert.deepEqual(result.components.map(component => ({ code: component.inventoryUnitCode, quantity: component.quantity })), [
    { code: "1111", quantity: 6 }
  ]);
  assert.equal(result.totalCost, 15);
  assert.deepEqual(result.issues, []);
});

test("aggregates different bundle components and calculates sellable stock", () => {
  const items = catalogItems();
  const bundle = items.find(item => item.merchantCode === "BYMSDHBD");
  const result = flattenCatalogConsumption({ items, itemId: bundle.id, quantity: 2 });

  assert.deepEqual(result.components.map(component => component.inventoryUnitCode).sort(), ["6977173969059", "6978705011727"]);
  assert.equal(result.totalCost, 37.2);
  assert.equal(catalogSellableQuantity({ items, itemId: bundle.id, inventoryByCode: { "6978705011727": 502, "6977173969059": 2064 } }), 502);
});

test("recursively expands nested bundles and stops component cycles", () => {
  const items = catalogItems();
  const baseBundle = items.find(item => item.merchantCode === "2DGZZ");
  const nested = normalizeCatalogPayload({
    source: "kuaimai",
    items: [{ sysItemId: 6, outerId: "NESTED", title: "嵌套组合", type: "2", suitSingleList: [{ outerId: "2DGZZ", ratio: 3 }] }]
  }).items[0];
  const nestedResult = flattenCatalogConsumption({ items: [...items, nested], itemId: nested.id, quantity: 1 });
  assert.equal(nestedResult.components[0].inventoryUnitCode, "1111");
  assert.equal(nestedResult.components[0].quantity, 6);

  const left = { ...baseBundle, id: "left", merchantCode: "LEFT", components: [normalizeCatalogComponent({ outerId: "RIGHT", ratio: 1 }, { parentItemId: "left", source: "kuaimai" })] };
  const right = { ...baseBundle, id: "right", merchantCode: "RIGHT", components: [normalizeCatalogComponent({ outerId: "LEFT", ratio: 1 }, { parentItemId: "right", source: "kuaimai" })] };
  const cyclic = flattenCatalogConsumption({ items: [left, right], itemId: "left", quantity: 1 });
  assert.equal(cyclic.components.length, 0);
  assert.equal(cyclic.issues[0].code, "PRODUCT_CATALOG_COMPONENT_CYCLE");
});

test("data quality reports missing or conflicting codes but accepts internal formats", () => {
  const items = catalogItems();
  const validIssues = catalogDataIssues(items);
  assert.equal(validIssues.some(issue => issue.inventoryUnitCode === "1111"), false);

  const duplicate = structuredClone(items.find(item => item.merchantCode === "1111"));
  duplicate.id = "another-item";
  duplicate.skus[0].id = "another-sku";
  const issues = catalogDataIssues([...items, duplicate]);
  assert.equal(issues.some(issue => issue.code === "PRODUCT_CATALOG_INVENTORY_CODE_CONFLICT"), true);
});
