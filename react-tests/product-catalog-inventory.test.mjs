import assert from "node:assert/strict";
import test from "node:test";

import { aggregateProductCatalogInventory } from "../src/domain/productCatalogInventory.js";

const trusted = {
  status: "trusted",
  latestSnapshotDate: "2026-07-28",
  confidence: "partial",
  coverage: 1,
  lastSuccessfulSyncAt: "2026-07-28T05:20:00.000Z"
};

function row(overrides = {}) {
  return {
    id: "inventory-1",
    date: "2026-07-28",
    productId: null,
    skuId: "sku-1",
    skuCode: "6970000000001",
    warehouseId: "warehouse-1",
    calibratedQuantity: 0,
    confidence: "partial",
    ...overrides
  };
}

test("single products sum each matched SKU across warehouses exactly once", () => {
  const items = [{
    id: "catalog-item-1",
    sourceProductId: "product-1",
    productKind: "single",
    skus: [
      { id: "catalog-sku-1", sourceSkuId: "sku-1", merchantSkuCode: "M-1", barcode: "6970000000001" },
      { id: "catalog-sku-2", sourceSkuId: "sku-2", merchantSkuCode: "M-2", barcode: "6970000000002" }
    ],
    components: []
  }];
  const result = aggregateProductCatalogInventory(items, [
    row({ id: "row-1", calibratedQuantity: 4 }),
    row({ id: "row-2", warehouseId: "warehouse-2", calibratedQuantity: 6 }),
    row({
      id: "row-3",
      skuId: "inventory-system-id-2",
      skuCode: "M-2",
      warehouseId: "warehouse-1",
      calibratedQuantity: 3
    })
  ], trusted);

  assert.deepEqual(result.items[0].inventory, {
    quantity: 13,
    status: "available",
    snapshotDate: "2026-07-28",
    coverage: 1,
    confidence: "partial",
    matchedSkuCount: 2,
    requiredComponentCount: 0,
    matchedComponentCount: 0
  });
  assert.equal(result.meta.coveredProducts, 1);
  assert.equal(result.meta.warehouseCount, 2);
  assert.equal(result.meta.skuCount, 2);
});

test("matched zero stock stays zero while missing and conflicting identities stay unknown", () => {
  const items = [
    {
      id: "zero-item",
      sourceProductId: "zero-product",
      productKind: "single",
      skus: [{ id: "zero-sku", sourceSkuId: "zero-source-sku", barcode: "zero-code" }],
      components: []
    },
    {
      id: "missing-item",
      sourceProductId: "missing-product",
      productKind: "single",
      skus: [{ id: "missing-sku", sourceSkuId: "missing-source-sku", barcode: "missing-code" }],
      components: []
    },
    {
      id: "conflict-left",
      sourceProductId: "conflict-product-left",
      productKind: "single",
      skus: [{ id: "left-sku", barcode: "shared-code" }],
      components: []
    },
    {
      id: "conflict-right",
      sourceProductId: "conflict-product-right",
      productKind: "single",
      skus: [{ id: "right-sku", barcode: "shared-code" }],
      components: []
    }
  ];
  const result = aggregateProductCatalogInventory(items, [
    row({ id: "zero-row", skuId: "zero-source-sku", skuCode: "zero-code", calibratedQuantity: 0 }),
    row({ id: "conflict-row", skuId: "unrelated", skuCode: "shared-code", calibratedQuantity: 9 })
  ], trusted);

  assert.equal(result.items[0].inventory.status, "zero");
  assert.equal(result.items[0].inventory.quantity, 0);
  for (const item of result.items.slice(1)) {
    assert.equal(item.inventory.status, "unmatched");
    assert.equal(item.inventory.quantity, null);
  }
  assert.equal(result.meta.unmatchedProducts, 3);
});

test("bundles use the limiting component ratio and never calculate from incomplete components", () => {
  const items = [
    {
      id: "bundle-complete",
      productKind: "bundle",
      skus: [],
      components: [
        { id: "component-a", sourceSkuId: "sku-a", inventoryUnitCode: "A", ratio: 2 },
        { id: "component-b", sourceSkuId: "sku-b", inventoryUnitCode: "B", ratio: 3 }
      ]
    },
    {
      id: "bundle-missing",
      productKind: "bundle",
      skus: [],
      components: [
        { id: "component-c", sourceSkuId: "sku-c", inventoryUnitCode: "C", ratio: 2 },
        { id: "component-d", sourceSkuId: "sku-d", inventoryUnitCode: "D", ratio: 1 }
      ]
    },
    {
      id: "bundle-invalid-ratio",
      productKind: "bundle",
      skus: [],
      components: [{ id: "component-e", sourceSkuId: "sku-e", inventoryUnitCode: "E", ratio: null }]
    }
  ];
  const result = aggregateProductCatalogInventory(items, [
    row({ id: "a-1", skuId: "sku-a", skuCode: "A", calibratedQuantity: 10 }),
    row({ id: "b-1", skuId: "sku-b", skuCode: "B", calibratedQuantity: 8 }),
    row({ id: "c-1", skuId: "sku-c", skuCode: "C", calibratedQuantity: 10 }),
    row({ id: "e-1", skuId: "sku-e", skuCode: "E", calibratedQuantity: 10 })
  ], trusted);

  assert.deepEqual(result.items[0].inventory, {
    quantity: 2,
    status: "available",
    snapshotDate: "2026-07-28",
    coverage: 1,
    confidence: "partial",
    matchedSkuCount: 0,
    requiredComponentCount: 2,
    matchedComponentCount: 2
  });
  assert.equal(result.items[1].inventory.status, "incomplete");
  assert.equal(result.items[1].inventory.quantity, null);
  assert.equal(result.items[1].inventory.coverage, 0.5);
  assert.equal(result.items[2].inventory.status, "incomplete");
  assert.equal(result.items[2].inventory.quantity, null);
});

test("an untrusted snapshot never exposes a decision quantity", () => {
  const result = aggregateProductCatalogInventory([{
    id: "catalog-item-1",
    productKind: "single",
    skus: [{ id: "catalog-sku-1", sourceSkuId: "sku-1" }],
    components: []
  }], [row({ calibratedQuantity: 20 })], {
    ...trusted,
    status: "stale"
  });

  assert.deepEqual(result.items[0].inventory, {
    quantity: null,
    status: "unavailable",
    snapshotDate: "2026-07-28",
    coverage: 0,
    confidence: "partial",
    matchedSkuCount: 0,
    requiredComponentCount: 0,
    matchedComponentCount: 0
  });
  assert.equal(result.meta.status, "stale");
});
