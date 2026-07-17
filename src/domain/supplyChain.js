export const SUPPLY_COLLECTIONS = [
  "suppliers",
  "productSupplierLinks",
  "purchaseApprovals",
  "purchaseLines",
  "paymentApprovals",
  "inventoryBatches",
  "inventorySnapshots",
  "inventoryAdjustments",
  "qualityImportBatches",
  "qualityIssues",
  "syncRuns"
];

const DEFAULT_SETTINGS = {
  purchaseProcessCode: "",
  paymentProcessCode: "",
  supplierCategories: ["包材", "里料", "原料", "加工"],
  fieldMappings: { purchase: {}, payment: {} }
};

const APPROVED_STATUSES = new Set(["COMPLETED", "APPROVED", "AGREE"]);

function finiteNumber(value, fallback = 0) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : fallback;
}

function cleanText(value) {
  return String(value ?? "").trim();
}

function recordId(record) {
  return cleanText(record?.id || record?.processInstanceId);
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function skuCodes(product) {
  const values = product?.skuCodes || product?.skus || [];
  return values.map(value => cleanText(typeof value === "object" ? value?.code : value)).filter(Boolean);
}

function buildProductBySku(products) {
  const result = new Map();
  for (const product of products || []) {
    for (const code of skuCodes(product)) result.set(code, product);
  }
  return result;
}

function firstValue(row, names) {
  for (const name of names) {
    if (row?.[name] !== undefined && cleanText(row[name])) return row[name];
  }
  return "";
}

function roundMoney(value) {
  return Math.round((finiteNumber(value) + Number.EPSILON) * 100) / 100;
}

export function createDefaultSupplyChainState() {
  return normalizeSupplyChainState();
}

export function normalizeSupplyChainState(input = {}) {
  const state = {
    version: "supply-chain-v1",
    updatedAt: cleanText(input?.updatedAt),
    ...input
  };
  for (const collection of SUPPLY_COLLECTIONS) {
    state[collection] = Array.isArray(input?.[collection])
      ? input[collection].filter(item => item && typeof item === "object").map(item => ({ ...item }))
      : [];
  }
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(input?.settings || {}),
    fieldMappings: {
      ...DEFAULT_SETTINGS.fieldMappings,
      ...(input?.settings?.fieldMappings || {})
    }
  };
  return state;
}

export function reduceSupplyChainState(currentState, action = {}) {
  const state = normalizeSupplyChainState(currentState);
  if (action.type === "replace") return normalizeSupplyChainState(action.state);
  if (action.type === "settings") {
    return normalizeSupplyChainState({ ...state, settings: { ...state.settings, ...(action.settings || {}) } });
  }
  if (action.type === "batch") {
    return (action.actions || []).reduce(reduceSupplyChainState, state);
  }
  if (!SUPPLY_COLLECTIONS.includes(action.collection)) return state;

  if (action.type === "remove") {
    return {
      ...state,
      [action.collection]: state[action.collection].filter(item => recordId(item) !== cleanText(action.id)),
      updatedAt: new Date().toISOString()
    };
  }
  if (action.type !== "upsert" || !action.record) return state;

  const id = recordId(action.record) || uniqueId(action.collection.replace(/s$/, ""));
  const record = { ...action.record, id: action.record.id || id };
  const found = state[action.collection].some(item => recordId(item) === id);
  return {
    ...state,
    [action.collection]: found
      ? state[action.collection].map(item => recordId(item) === id ? { ...item, ...record } : item)
      : [record, ...state[action.collection]],
    updatedAt: new Date().toISOString()
  };
}

function purchaseProductWeights(purchase, lines) {
  const purchaseLines = lines.filter(line => line.purchaseProcessInstanceId === purchase.processInstanceId && line.productId);
  if (purchaseLines.length) {
    const total = purchaseLines.reduce((sum, line) => sum + Math.max(0, finiteNumber(line.amount)), 0);
    const equalWeight = 1 / purchaseLines.length;
    return purchaseLines.map(line => ({
      productId: line.productId,
      weight: total > 0 ? Math.max(0, finiteNumber(line.amount)) / total : equalWeight
    }));
  }
  const productIds = Array.isArray(purchase.productIds) ? purchase.productIds.filter(Boolean) : [];
  return productIds.map(productId => ({ productId, weight: 1 / productIds.length }));
}

function emptyDimensionRow({ product, supplierId = "" }) {
  return {
    id: product?.id || (supplierId ? `supplier-${supplierId}` : "unmapped-dimension"),
    productId: product?.id || "",
    productName: product?.name || product?.productName || "未命名产品",
    supplierId,
    actualPaid: 0,
    consumedSalesCost: 0,
    rawInventoryFunds: 0,
    adjustmentAmount: 0,
    adjustedInventoryFunds: 0
  };
}

export function buildSupplyChainSummary({ supplyState, products = [], salesRows = [] } = {}) {
  const state = normalizeSupplyChainState(supplyState);
  const productMap = new Map(products.map(product => [product.id, product]));
  const productBySku = buildProductBySku(products);
  const purchaseMap = new Map(state.purchaseApprovals.map(item => [item.processInstanceId, item]));
  const productRows = new Map(products.map(product => [product.id, emptyDimensionRow({ product })]));
  const supplierRows = new Map();
  const paidByProductSupplier = new Map();
  const soldQuantityByProduct = new Map();

  for (const payment of state.paymentApprovals) {
    if (!APPROVED_STATUSES.has(cleanText(payment.status).toUpperCase())) continue;
    const purchase = purchaseMap.get(payment.purchaseProcessInstanceId);
    if (!purchase) continue;
    for (const allocation of purchaseProductWeights(purchase, state.purchaseLines)) {
      const amount = finiteNumber(payment.amount) * allocation.weight;
      const product = productMap.get(allocation.productId);
      const productRow = productRows.get(allocation.productId) || emptyDimensionRow({ product: product || { id: allocation.productId } });
      productRow.actualPaid += amount;
      productRows.set(allocation.productId, productRow);

      const supplierId = cleanText(purchase.supplierId) || "unmapped";
      const supplier = state.suppliers.find(item => item.id === supplierId);
      const supplierRow = supplierRows.get(supplierId) || {
        supplierId,
        supplierName: supplier?.name || "待映射供应商",
        actualPaid: 0,
        consumedSalesCost: 0,
        rawInventoryFunds: 0,
        adjustmentAmount: 0,
        adjustedInventoryFunds: 0
      };
      supplierRow.actualPaid += amount;
      supplierRows.set(supplierId, supplierRow);
      const key = `${allocation.productId}::${supplierId}`;
      paidByProductSupplier.set(key, (paidByProductSupplier.get(key) || 0) + amount);
    }
  }

  for (const salesRow of salesRows) {
    const product = productBySku.get(cleanText(salesRow.code || salesRow.skuCode));
    if (!product) continue;
    const productRow = productRows.get(product.id) || emptyDimensionRow({ product });
    productRow.consumedSalesCost += finiteNumber(salesRow.cost ?? salesRow.salesCost);
    productRows.set(product.id, productRow);
    soldQuantityByProduct.set(product.id, (soldQuantityByProduct.get(product.id) || 0) + finiteNumber(salesRow.qty ?? salesRow.quantity));
  }

  const linkedCostProducts = new Set();
  for (const link of state.productSupplierLinks) {
    if (!link.productId || !link.supplierId || cleanText(link.status).toLowerCase() === "inactive") continue;
    const unitCost = finiteNumber(link.unitCost);
    const consumptionPerSale = finiteNumber(link.consumptionPerSale);
    if (unitCost <= 0 || consumptionPerSale <= 0) continue;
    const supplier = state.suppliers.find(item => item.id === link.supplierId);
    const supplierRow = supplierRows.get(link.supplierId) || {
      supplierId: link.supplierId,
      supplierName: supplier?.name || "待映射供应商",
      actualPaid: 0,
      consumedSalesCost: 0,
      rawInventoryFunds: 0,
      adjustmentAmount: 0,
      adjustedInventoryFunds: 0
    };
    supplierRow.consumedSalesCost += (soldQuantityByProduct.get(link.productId) || 0) * consumptionPerSale * unitCost;
    supplierRows.set(link.supplierId, supplierRow);
    linkedCostProducts.add(link.productId);
  }

  for (const adjustment of state.inventoryAdjustments) {
    if (cleanText(adjustment.status).toLowerCase() !== "confirmed") continue;
    const product = productMap.get(adjustment.productId);
    const productRow = productRows.get(adjustment.productId) || emptyDimensionRow({ product: product || { id: adjustment.productId } });
    productRow.adjustmentAmount += finiteNumber(adjustment.adjustmentAmount);
    productRows.set(adjustment.productId, productRow);
    if (adjustment.supplierId) {
      const supplier = state.suppliers.find(item => item.id === adjustment.supplierId);
      const supplierRow = supplierRows.get(adjustment.supplierId) || {
        supplierId: adjustment.supplierId,
        supplierName: supplier?.name || "待映射供应商",
        actualPaid: 0,
        consumedSalesCost: 0,
        rawInventoryFunds: 0,
        adjustmentAmount: 0,
        adjustedInventoryFunds: 0
      };
      supplierRow.adjustmentAmount += finiteNumber(adjustment.adjustmentAmount);
      supplierRows.set(adjustment.supplierId, supplierRow);
    }
  }

  for (const productRow of productRows.values()) {
    const allocations = [...paidByProductSupplier.entries()].filter(([key]) => key.startsWith(`${productRow.productId}::`));
    if (!linkedCostProducts.has(productRow.productId)) {
      const paidTotal = allocations.reduce((sum, [, amount]) => sum + amount, 0);
      for (const [key, amount] of allocations) {
        const supplierId = key.split("::")[1];
        const supplierRow = supplierRows.get(supplierId);
        if (supplierRow) supplierRow.consumedSalesCost += paidTotal > 0 ? productRow.consumedSalesCost * amount / paidTotal : 0;
      }
    }
    productRow.rawInventoryFunds = productRow.actualPaid - productRow.consumedSalesCost;
    productRow.adjustedInventoryFunds = productRow.rawInventoryFunds + productRow.adjustmentAmount;
    for (const key of ["actualPaid", "consumedSalesCost", "rawInventoryFunds", "adjustmentAmount", "adjustedInventoryFunds"]) {
      productRow[key] = roundMoney(productRow[key]);
    }
  }

  for (const supplierRow of supplierRows.values()) {
    supplierRow.rawInventoryFunds = supplierRow.actualPaid - supplierRow.consumedSalesCost;
    supplierRow.adjustedInventoryFunds = supplierRow.rawInventoryFunds + supplierRow.adjustmentAmount;
    for (const key of ["actualPaid", "consumedSalesCost", "rawInventoryFunds", "adjustmentAmount", "adjustedInventoryFunds"]) {
      supplierRow[key] = roundMoney(supplierRow[key]);
    }
  }

  const byProduct = [...productRows.values()];
  const bySupplier = [...supplierRows.values()];
  const actualPaid = roundMoney(byProduct.reduce((sum, item) => sum + item.actualPaid, 0));
  const consumedSalesCost = roundMoney(byProduct.reduce((sum, item) => sum + item.consumedSalesCost, 0));
  const adjustmentAmount = roundMoney(byProduct.reduce((sum, item) => sum + item.adjustmentAmount, 0));
  return {
    actualPaid,
    consumedSalesCost,
    rawInventoryFunds: roundMoney(actualPaid - consumedSalesCost),
    adjustmentAmount,
    adjustedInventoryFunds: roundMoney(actualPaid - consumedSalesCost + adjustmentAmount),
    byProduct,
    bySupplier,
    exceptions: {
      unmappedApprovals: state.purchaseApprovals.filter(item => !item.supplierId || !(item.productIds?.length || state.purchaseLines.some(line => line.purchaseProcessInstanceId === item.processInstanceId && line.productId))).length,
      openQualityIssues: state.qualityIssues.filter(item => !["closed", "resolved"].includes(cleanText(item.status).toLowerCase())).length,
      pendingAdjustments: state.inventoryAdjustments.filter(item => cleanText(item.status).toLowerCase() !== "confirmed").length
    }
  };
}

export function parseInventoryImportRows(rows = [], { products = [], suppliers = [] } = {}) {
  const productBySku = buildProductBySku(products);
  const supplierByCode = new Map(suppliers.flatMap(supplier => [supplier.code, supplier.name].filter(Boolean).map(value => [cleanText(value), supplier])));
  const validRows = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const skuCode = cleanText(firstValue(row, ["商品编码", "SKU", "sku", "skuCode", "产品编码"]));
    const product = productBySku.get(skuCode);
    const countedQuantity = finiteNumber(firstValue(row, ["盘点数量", "实盘数量", "实际库存", "countedQuantity"]), Number.NaN);
    const erpQuantity = finiteNumber(firstValue(row, ["ERP库存", "系统库存", "账面库存", "erpQuantity"]), Number.NaN);
    if (!skuCode || !product) errors.push({ rowNumber, field: "商品编码", message: "未找到对应产品" });
    if (!Number.isFinite(countedQuantity) || countedQuantity < 0) errors.push({ rowNumber, field: "盘点数量", message: "盘点数量必须是非负数字" });
    if (!Number.isFinite(erpQuantity) || erpQuantity < 0) errors.push({ rowNumber, field: "ERP库存", message: "ERP库存必须是非负数字" });
    if (!product || !Number.isFinite(countedQuantity) || countedQuantity < 0 || !Number.isFinite(erpQuantity) || erpQuantity < 0) return;

    const supplierValue = cleanText(firstValue(row, ["供应商编码", "供应商", "supplierCode"]));
    const supplier = supplierByCode.get(supplierValue);
    const inventoryAmountValue = firstValue(row, ["库存金额", "盘点金额", "inventoryAmount"]);
    validRows.push({
      id: uniqueId("inventory"),
      productId: product.id,
      supplierId: supplier?.id || "",
      skuCode,
      countedQuantity,
      erpQuantity,
      quantityVariance: roundMoney(countedQuantity - erpQuantity),
      inventoryAmount: cleanText(inventoryAmountValue) ? roundMoney(inventoryAmountValue) : null,
      sourceRow: rowNumber
    });
  });
  return { validRows, errors };
}

export function parseQualityImportRows(rows = [], { products = [] } = {}) {
  const productBySku = buildProductBySku(products);
  const validRows = [];
  const errors = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const skuCode = cleanText(firstValue(row, ["商品编码", "SKU", "sku", "skuCode", "产品编码"]));
    const product = productBySku.get(skuCode);
    const content = cleanText(firstValue(row, ["差评内容", "评价内容", "问题描述", "content"]));
    if (!product) errors.push({ rowNumber, field: "商品编码", message: "未找到对应产品" });
    if (!content) errors.push({ rowNumber, field: "差评内容", message: "差评内容不能为空" });
    if (!product || !content) return;
    const publicRelationsStatus = cleanText(firstValue(row, ["公关状态", "处理状态", "status"]));
    const closed = ["已完成", "已关闭", "已处理", "closed", "resolved"].includes(publicRelationsStatus.toLowerCase());
    validRows.push({
      id: uniqueId("quality"),
      productId: product.id,
      skuCode,
      platform: cleanText(firstValue(row, ["平台", "店铺平台", "platform"])),
      shopName: cleanText(firstValue(row, ["店铺", "店铺名称", "shopName"])),
      orderId: cleanText(firstValue(row, ["订单号", "平台订单号", "orderId"])),
      content,
      category: cleanText(firstValue(row, ["问题分类", "差评分类", "category"])),
      publicRelationsStatus,
      status: closed ? "closed" : "open",
      sourceRow: rowNumber
    });
  });
  return { validRows, errors };
}
