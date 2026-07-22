function text(value, max = 240) {
  return String(value ?? "").trim().slice(0, max);
}

function numberOrNull(value) {
  if (value === "" || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function stablePart(value) {
  return encodeURIComponent(text(value, 500) || "missing").replaceAll("%", "_");
}

function inventoryCode(input = {}) {
  return text(input.inventoryUnitCode || input.skuOuterId || input.barcode || input.outerId, 160);
}

export function normalizeCatalogComponent(input = {}, context = {}) {
  const parentItemId = text(context.parentItemId || input.parentItemId, 200);
  const source = text(context.source || input.source || "manual", 40).toLowerCase();
  const code = inventoryCode(input);
  const parsedRatio = numberOrNull(input.ratio ?? input.quantity ?? input.num);
  const ratio = Number.isInteger(parsedRatio) && parsedRatio > 0 ? parsedRatio : null;
  return {
    id: `${parentItemId}:component:${stablePart(input.sourceSkuId || input.sysSkuId || code)}`,
    parentItemId,
    source,
    sourceProductId: text(input.sourceProductId || input.sysItemId, 120),
    sourceSkuId: text(input.sourceSkuId || input.sysSkuId, 120),
    outerId: text(input.outerId, 160),
    skuOuterId: text(input.skuOuterId, 160),
    inventoryUnitCode: code,
    title: text(input.title || input.name, 240),
    specification: text(input.propertiesName || input.specification, 240),
    ratio,
    purchasePrice: numberOrNull(input.purchasePrice ?? input.costPrice ?? input.cost),
    availableQuantity: numberOrNull(input.availableQuantity ?? input.availableStock ?? input.stock),
    syncedAt: text(context.syncedAt || input.syncedAt, 80)
  };
}

function catalogIndexes(items = []) {
  const byId = new Map();
  const byMerchantCode = new Map();
  const byInventoryCode = new Map();
  for (const item of items) {
    if (item?.id) byId.set(item.id, item);
    if (item?.merchantCode) byMerchantCode.set(String(item.merchantCode), item);
    for (const sku of item?.skus || []) {
      const code = String(sku?.barcode || sku?.merchantSkuCode || "").trim();
      if (code && !byInventoryCode.has(code)) byInventoryCode.set(code, { item, sku });
    }
  }
  return { byId, byMerchantCode, byInventoryCode };
}

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function flattenCatalogConsumption({ items = [], itemId = "", skuId = "", quantity = 1 } = {}) {
  const indexes = catalogIndexes(items);
  const root = indexes.byId.get(itemId) || indexes.byMerchantCode.get(String(itemId));
  const baseQuantity = numberOrNull(quantity);
  const components = new Map();
  const issues = [];

  function addLeaf(code, ratio, unitCost, sourceItemId = "") {
    const normalizedCode = text(code, 160);
    if (!normalizedCode) {
      issues.push({ code: "PRODUCT_CATALOG_COMPONENT_CODE_MISSING", itemId: sourceItemId });
      return;
    }
    const current = components.get(normalizedCode) || {
      inventoryUnitCode: normalizedCode,
      ratio: 0,
      quantity: 0,
      unitCost: numberOrNull(unitCost),
      cost: 0
    };
    current.ratio += ratio;
    current.quantity += (baseQuantity ?? 0) * ratio;
    if (current.unitCost === null) current.unitCost = numberOrNull(unitCost);
    current.cost = current.unitCost === null ? 0 : current.quantity * current.unitCost;
    components.set(normalizedCode, current);
  }

  function visit(item, factor, path) {
    if (!item) return;
    if (path.has(item.id)) {
      issues.push({ code: "PRODUCT_CATALOG_COMPONENT_CYCLE", itemId: item.id });
      return;
    }
    const nextPath = new Set(path);
    nextPath.add(item.id);
    const edges = item.components || [];
    if (edges.length) {
      for (const edge of edges) {
        if (!Number.isInteger(edge?.ratio) || edge.ratio <= 0) {
          issues.push({ code: "PRODUCT_CATALOG_COMPONENT_RATIO_INVALID", itemId: item.id, componentId: edge?.id || "" });
          continue;
        }
        const code = text(edge.inventoryUnitCode, 160);
        const skuMatch = indexes.byInventoryCode.get(code);
        const targetItem = skuMatch?.item || indexes.byMerchantCode.get(code);
        if (targetItem?.components?.length) visit(targetItem, factor * edge.ratio, nextPath);
        else addLeaf(code, factor * edge.ratio, edge.purchasePrice ?? skuMatch?.sku?.purchasePrice, item.id);
      }
      return;
    }

    const activeSkus = (item.skus || []).filter(sku => sku?.barcode && sku.barcodeType !== "missing");
    const selected = skuId ? activeSkus.find(sku => sku.id === skuId || sku.barcode === skuId) : activeSkus.length === 1 ? activeSkus[0] : null;
    if (selected) addLeaf(selected.barcode, factor, selected.purchasePrice, item.id);
    else if (!activeSkus.length && item.merchantCode) addLeaf(item.merchantCode, factor, item.purchasePrice, item.id);
    else issues.push({ code: "PRODUCT_CATALOG_SKU_AMBIGUOUS", itemId: item.id });
  }

  if (!root) issues.push({ code: "PRODUCT_CATALOG_ITEM_NOT_FOUND", itemId });
  else if (baseQuantity === null || baseQuantity < 0) issues.push({ code: "PRODUCT_CATALOG_QUANTITY_INVALID", itemId: root.id });
  else visit(root, 1, new Set());

  const rows = [...components.values()].map(component => ({
    ...component,
    ratio: round(component.ratio),
    quantity: round(component.quantity),
    cost: round(component.cost)
  })).sort((left, right) => left.inventoryUnitCode.localeCompare(right.inventoryUnitCode));
  return {
    components: rows,
    totalCost: round(rows.reduce((sum, component) => sum + component.cost, 0)),
    issues
  };
}

export function catalogSellableQuantity({ items = [], itemId = "", skuId = "", inventoryByCode = {} } = {}) {
  const result = flattenCatalogConsumption({ items, itemId, skuId, quantity: 1 });
  if (result.issues.length || !result.components.length) return null;
  const quantities = result.components.map(component => {
    const value = inventoryByCode instanceof Map
      ? inventoryByCode.get(component.inventoryUnitCode)
      : inventoryByCode?.[component.inventoryUnitCode];
    const available = numberOrNull(value);
    return available === null ? null : Math.floor(available / component.ratio);
  });
  return quantities.some(value => value === null) ? null : Math.min(...quantities);
}

export function catalogDataIssues(items = []) {
  const issues = [];
  const ownersByCode = new Map();
  for (const item of items) {
    for (const sku of item?.skus || []) {
      const code = text(sku?.barcode, 160);
      if (!code) {
        issues.push({ code: "PRODUCT_CATALOG_INVENTORY_CODE_MISSING", itemId: item.id, skuId: sku?.id || "" });
        continue;
      }
      const owners = ownersByCode.get(code) || new Set();
      owners.add(`${item.id}:${sku.id}`);
      ownersByCode.set(code, owners);
    }
    for (const component of item?.components || []) {
      if (!component.inventoryUnitCode) issues.push({ code: "PRODUCT_CATALOG_COMPONENT_CODE_MISSING", itemId: item.id, componentId: component.id });
      if (!Number.isInteger(component.ratio) || component.ratio <= 0) issues.push({ code: "PRODUCT_CATALOG_COMPONENT_RATIO_INVALID", itemId: item.id, componentId: component.id });
    }
  }
  for (const [code, owners] of ownersByCode) {
    if (owners.size > 1) issues.push({ code: "PRODUCT_CATALOG_INVENTORY_CODE_CONFLICT", inventoryUnitCode: code, owners: [...owners] });
  }
  return issues;
}
