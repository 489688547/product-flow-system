function text(value) {
  return String(value ?? "").trim();
}

function quantity(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function uniqueValues(values = []) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function addToSetMap(map, key, value) {
  if (!key) return;
  const values = map.get(key) || new Set();
  values.add(value);
  map.set(key, values);
}

function rowKey(row, index) {
  return text(row?.id)
    || [row?.date, row?.skuId, row?.warehouseId, index].map(text).join("|");
}

function indexedRows(rows = []) {
  const bySkuId = new Map();
  const bySkuCode = new Map();
  const byProductId = new Map();
  const rowsByKey = new Map();
  rows.forEach((row, index) => {
    const key = rowKey(row, index);
    rowsByKey.set(key, row);
    addToSetMap(bySkuId, text(row?.skuId), key);
    addToSetMap(bySkuCode, text(row?.skuCode), key);
    addToSetMap(byProductId, text(row?.productId), key);
  });
  return { bySkuId, bySkuCode, byProductId, rowsByKey };
}

function catalogOwners(items = []) {
  const products = new Map();
  const skuIds = new Map();
  const skuCodes = new Map();
  for (const item of items) {
    const itemId = text(item?.id);
    for (const key of uniqueValues([item?.id, item?.sourceProductId])) {
      addToSetMap(products, key, itemId);
    }
    for (const sku of item?.skus || []) {
      for (const key of uniqueValues([sku?.id, sku?.sourceSkuId])) {
        addToSetMap(skuIds, key, itemId);
      }
      for (const key of uniqueValues([sku?.merchantSkuCode, sku?.barcode])) {
        addToSetMap(skuCodes, key, itemId);
      }
    }
  }
  return { products, skuIds, skuCodes };
}

function uniquelyOwned(owners, key, itemId) {
  const values = owners.get(key);
  return values?.size === 1 && values.has(itemId);
}

function rowsForSku(sku, itemId, indexes, owners) {
  for (const key of uniqueValues([sku?.sourceSkuId, sku?.id])) {
    if (!uniquelyOwned(owners.skuIds, key, itemId)) continue;
    const rowKeys = indexes.bySkuId.get(key);
    if (rowKeys?.size) return rowKeys;
  }
  for (const key of uniqueValues([sku?.merchantSkuCode, sku?.barcode])) {
    if (!uniquelyOwned(owners.skuCodes, key, itemId)) continue;
    const rowKeys = new Set([
      ...(indexes.bySkuId.get(key) || []),
      ...(indexes.bySkuCode.get(key) || [])
    ]);
    if (rowKeys.size) return rowKeys;
  }
  return new Set();
}

function rowsForComponent(component, indexes) {
  for (const key of uniqueValues([component?.sourceSkuId, component?.id])) {
    const rowKeys = indexes.bySkuId.get(key);
    if (rowKeys?.size) return rowKeys;
  }
  for (const key of uniqueValues([
    component?.inventoryUnitCode,
    component?.skuOuterId,
    component?.outerId
  ])) {
    const rowKeys = new Set([
      ...(indexes.bySkuId.get(key) || []),
      ...(indexes.bySkuCode.get(key) || [])
    ]);
    if (rowKeys.size) return rowKeys;
  }
  return new Set();
}

function sumRows(rowKeys, rowsByKey) {
  let total = 0;
  for (const key of rowKeys) {
    const value = quantity(rowsByKey.get(key)?.calibratedQuantity);
    if (value === null) return null;
    total += value;
  }
  return total;
}

function baseInventory(quality = {}) {
  return {
    quantity: null,
    status: "unavailable",
    snapshotDate: text(quality.latestSnapshotDate) || null,
    coverage: 0,
    confidence: text(quality.confidence) || "insufficient",
    matchedSkuCount: 0,
    requiredComponentCount: 0,
    matchedComponentCount: 0
  };
}

function singleInventory(item, indexes, owners, quality) {
  const inventory = baseInventory(quality);
  const skus = Array.isArray(item?.skus) ? item.skus : [];
  const itemId = text(item?.id);
  const directRows = new Set();
  for (const key of uniqueValues([item?.sourceProductId, item?.id])) {
    if (!uniquelyOwned(owners.products, key, itemId)) continue;
    for (const rowKeyValue of indexes.byProductId.get(key) || []) directRows.add(rowKeyValue);
  }

  const matchedRows = new Set(directRows);
  let matchedSkuCount = 0;
  for (const sku of skus) {
    const rowKeys = rowsForSku(sku, itemId, indexes, owners);
    if (rowKeys.size) matchedSkuCount += 1;
    for (const key of rowKeys) matchedRows.add(key);
  }
  if (directRows.size && !matchedSkuCount) matchedSkuCount = skus.length;
  const requiredSkuCount = skus.length;
  const coverage = requiredSkuCount ? Math.min(1, matchedSkuCount / requiredSkuCount) : 0;
  if (!matchedRows.size || coverage < 1) {
    return {
      ...inventory,
      status: "unmatched",
      coverage,
      matchedSkuCount
    };
  }
  const total = sumRows(matchedRows, indexes.rowsByKey);
  if (total === null) {
    return { ...inventory, status: "unmatched", coverage, matchedSkuCount };
  }
  return {
    ...inventory,
    quantity: total,
    status: total === 0 ? "zero" : "available",
    coverage,
    matchedSkuCount
  };
}

function bundleInventory(item, indexes, quality) {
  const inventory = baseInventory(quality);
  const components = Array.isArray(item?.components) ? item.components : [];
  let matchedComponentCount = 0;
  let coverage = 0;
  const constructible = [];
  for (const component of components) {
    const ratio = Number(component?.ratio);
    if (!Number.isInteger(ratio) || ratio <= 0) continue;
    const rowKeys = rowsForComponent(component, indexes);
    if (!rowKeys.size) continue;
    const total = sumRows(rowKeys, indexes.rowsByKey);
    if (total === null) continue;
    matchedComponentCount += 1;
    constructible.push(Math.floor(total / ratio));
  }
  if (components.length) coverage = matchedComponentCount / components.length;
  if (!components.length || coverage < 1 || constructible.length !== components.length) {
    return {
      ...inventory,
      status: "incomplete",
      coverage,
      requiredComponentCount: components.length,
      matchedComponentCount
    };
  }
  const total = Math.min(...constructible);
  return {
    ...inventory,
    quantity: total,
    status: total === 0 ? "zero" : "available",
    coverage: 1,
    requiredComponentCount: components.length,
    matchedComponentCount
  };
}

export function aggregateProductCatalogInventory(items = [], rows = [], quality = {}) {
  const safeItems = Array.isArray(items) ? items : [];
  const safeRows = Array.isArray(rows) ? rows : [];
  const indexes = indexedRows(safeRows);
  const owners = catalogOwners(safeItems);
  let coveredProducts = 0;
  let unmatchedProducts = 0;
  const trusted = quality?.status === "trusted";
  const resultItems = safeItems.map(item => {
    const inventory = trusted
      ? item?.productKind === "bundle"
        ? bundleInventory(item, indexes, quality)
        : singleInventory(item, indexes, owners, quality)
      : baseInventory(quality);
    if (["available", "zero"].includes(inventory.status)) coveredProducts += 1;
    if (["unmatched", "incomplete"].includes(inventory.status)) unmatchedProducts += 1;
    return { ...item, inventory };
  });
  return {
    items: resultItems,
    meta: {
      status: text(quality?.status) || "unavailable",
      snapshotDate: text(quality?.latestSnapshotDate) || null,
      coverage: Number.isFinite(Number(quality?.coverage)) ? Number(quality.coverage) : 0,
      confidence: text(quality?.confidence) || "insufficient",
      lastSuccessfulSyncAt: text(quality?.lastSuccessfulSyncAt) || null,
      totalRows: safeRows.length,
      warehouseCount: new Set(safeRows.map(row => text(row?.warehouseId)).filter(Boolean)).size,
      skuCount: new Set(safeRows.map(row => text(row?.skuId || row?.skuCode)).filter(Boolean)).size,
      coveredProducts,
      unmatchedProducts
    }
  };
}
