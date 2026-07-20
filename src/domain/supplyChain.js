export const SUPPLY_COLLECTIONS = [
  "suppliers",
  "productSupplierLinks",
  "purchaseApprovals",
  "purchaseLines",
  "paymentApprovals",
  "inventoryBatches",
  "inventorySnapshots",
  "materialInventorySnapshots",
  "inventoryRisks",
  "inventoryAdjustments",
  "qualityImportBatches",
  "qualityIssues",
  "syncRuns"
];

const DEFAULT_SETTINGS = {
  purchaseProcessCode: "PROC-E55BD07B-14E8-4111-ACFC-23835F3211E2",
  paymentProcessCode: "PROC-8E691E78-3D2D-45D5-9B77-C9EC5F8DFF6A",
  purchaseCategoryPrefixes: ["支出/产品费用/产品成本费用"],
  supplierCategories: ["原料", "包材", "里料", "耗材", "加工", "成品"],
  fieldMappings: {
    purchase: {
      supplierFieldId: "",
      productFieldId: "",
      amountFieldId: "金额（元）",
      purposeFieldId: "事由",
      businessCategoryFieldId: "业务分类",
      paymentDateFieldId: "预期付款时间",
      departmentFieldId: "费用归口部门",
      projectFieldId: "费用归口项目"
    },
    payment: {
      amountFieldId: "付款金额",
      relatedPurchaseFieldId: "采购申请单",
      purposeFieldId: "付款事由",
      businessCategoryFieldId: "支出分类"
    }
  }
};

const APPROVED_STATUSES = new Set(["COMPLETED", "APPROVED", "AGREE"]);
const PRIVATE_APPROVAL_FIELDS = ["rawPayload", "payeeInfo", "recipientInfo", "bankAccount", "accountNumber", "identityAttachment"];

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

export function isErpInventorySource(sourceType = "") {
  return ["kuaimai-import", "dingtalk-stocktake-import", "dingtalk-finished-inventory"].includes(cleanText(sourceType));
}

export function isPhysicalInventorySource(sourceType = "") {
  return ["stocktake-import", "dingtalk-stocktake-import", "dingtalk-finished-inventory"].includes(cleanText(sourceType));
}

export function inventorySourceLabel(sourceType = "") {
  const labels = {
    "kuaimai-import": "快麦 ERP 快照",
    "stocktake-import": "文件盘点核对",
    "dingtalk-stocktake-import": "钉钉盘点表",
    "dingtalk-finished-inventory": "钉钉成品月末库存"
  };
  return labels[cleanText(sourceType)] || "库存文件快照";
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

function sanitizeSupplyRecord(collection, record) {
  const safe = { ...record };
  if (["purchaseApprovals", "purchaseLines", "paymentApprovals"].includes(collection)) {
    for (const key of PRIVATE_APPROVAL_FIELDS) delete safe[key];
  }
  return safe;
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
      ? input[collection].filter(item => item && typeof item === "object").map(item => sanitizeSupplyRecord(collection, item))
      : [];
  }
  state.settings = {
    ...DEFAULT_SETTINGS,
    ...(input?.settings || {}),
    purchaseProcessCode: cleanText(input?.settings?.purchaseProcessCode) || DEFAULT_SETTINGS.purchaseProcessCode,
    paymentProcessCode: cleanText(input?.settings?.paymentProcessCode) || DEFAULT_SETTINGS.paymentProcessCode,
    fieldMappings: {
      purchase: {
        ...DEFAULT_SETTINGS.fieldMappings.purchase,
        ...(input?.settings?.fieldMappings?.purchase || {})
      },
      payment: {
        ...DEFAULT_SETTINGS.fieldMappings.payment,
        ...(input?.settings?.fieldMappings?.payment || {})
      }
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
  const record = sanitizeSupplyRecord(action.collection, { ...action.record, id: action.record.id || id });
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
    adjustedInventoryFunds: 0,
    bomUnitCost: 0,
    erpInventoryQuantity: 0,
    physicalInventoryQuantity: 0,
    quantityVariance: 0,
    erpInventoryValue: 0,
    physicalInventoryValue: 0,
    hasErpSnapshot: false,
    hasPhysicalSnapshot: false,
    hasPaymentEvidence: false,
    hasSalesCostEvidence: false,
    hasAdjustmentEvidence: false,
    hasInventoryFundsEvidence: false,
    hasBomCostEvidence: false
  };
}

function activePrimarySupplyLinks(links = []) {
  const groups = new Map();
  for (const link of links) {
    if (!link?.productId || cleanText(link.status).toLowerCase() === "inactive") continue;
    const materialKey = cleanText(link.materialName) || cleanText(link.category) || link.id;
    const key = `${link.productId}::${cleanText(link.category)}::${materialKey}`;
    groups.set(key, [...(groups.get(key) || []), link]);
  }
  return [...groups.values()].flatMap(group => {
    const primary = group.filter(link => cleanText(link.supplyRole).toLowerCase() !== "backup");
    return primary.length ? primary : group.slice(0, 1);
  });
}

function snapshotTime(snapshot) {
  const value = snapshot.stocktakeDate || snapshot.snapshotDate || snapshot.importedAt || "";
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latestInventorySnapshots(snapshots = []) {
  const latestErp = new Map();
  const latestPhysical = new Map();
  for (const snapshot of snapshots) {
    if (!snapshot?.productId) continue;
    const key = `${snapshot.productId}::${cleanText(snapshot.skuCode)}::${cleanText(snapshot.warehouse)}`;
    if (Number.isFinite(Number(snapshot.erpQuantity))) {
      const current = latestErp.get(key);
      if (!current || snapshotTime(snapshot) >= snapshotTime(current)) latestErp.set(key, snapshot);
    }
    if (snapshot.countedQuantity !== null && snapshot.countedQuantity !== undefined && Number.isFinite(Number(snapshot.countedQuantity))) {
      const current = latestPhysical.get(key);
      if (!current || snapshotTime(snapshot) >= snapshotTime(current)) latestPhysical.set(key, snapshot);
    }
  }
  return { latestErp, latestPhysical };
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
  const approvedPaidByPurchase = new Map();

  for (const payment of state.paymentApprovals) {
    if (!APPROVED_STATUSES.has(cleanText(payment.status).toUpperCase())) continue;
    approvedPaidByPurchase.set(
      payment.purchaseProcessInstanceId,
      (approvedPaidByPurchase.get(payment.purchaseProcessInstanceId) || 0) + finiteNumber(payment.amount)
    );
    const purchase = purchaseMap.get(payment.purchaseProcessInstanceId);
    if (!purchase) continue;
    for (const allocation of purchaseProductWeights(purchase, state.purchaseLines)) {
      const amount = finiteNumber(payment.amount) * allocation.weight;
      const product = productMap.get(allocation.productId);
      const productRow = productRows.get(allocation.productId) || emptyDimensionRow({ product: product || { id: allocation.productId } });
      productRow.actualPaid += amount;
      productRow.hasPaymentEvidence = true;
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
    productRow.hasSalesCostEvidence = true;
    productRows.set(product.id, productRow);
    soldQuantityByProduct.set(product.id, (soldQuantityByProduct.get(product.id) || 0) + finiteNumber(salesRow.qty ?? salesRow.quantity));
  }

  const linkedCostProducts = new Set();
  const primarySupplyLinks = activePrimarySupplyLinks(state.productSupplierLinks);
  const bomUnitCostByProduct = new Map();
  for (const link of primarySupplyLinks) {
    if (!link.productId || !link.supplierId) continue;
    const unitCost = finiteNumber(link.unitCost);
    const consumptionPerSale = finiteNumber(link.consumptionPerSale);
    if (unitCost <= 0 || consumptionPerSale <= 0) continue;
    bomUnitCostByProduct.set(link.productId, (bomUnitCostByProduct.get(link.productId) || 0) + unitCost * consumptionPerSale);
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

  const resolvedInventorySnapshots = state.inventorySnapshots.map(snapshot => {
    if (snapshot.productId) return snapshot;
    const matchedProduct = productBySku.get(cleanText(snapshot.skuCode));
    return matchedProduct ? { ...snapshot, productId: matchedProduct.id } : snapshot;
  });
  const { latestErp, latestPhysical } = latestInventorySnapshots(resolvedInventorySnapshots);
  for (const snapshot of latestErp.values()) {
    const product = productMap.get(snapshot.productId);
    const productRow = productRows.get(snapshot.productId) || emptyDimensionRow({ product: product || { id: snapshot.productId } });
    productRow.erpInventoryQuantity += finiteNumber(snapshot.erpQuantity);
    productRow.hasErpSnapshot = true;
    productRows.set(snapshot.productId, productRow);
  }
  for (const snapshot of latestPhysical.values()) {
    const product = productMap.get(snapshot.productId);
    const productRow = productRows.get(snapshot.productId) || emptyDimensionRow({ product: product || { id: snapshot.productId } });
    productRow.physicalInventoryQuantity += finiteNumber(snapshot.countedQuantity);
    productRow.hasPhysicalSnapshot = true;
    if (snapshot.inventoryAmount !== null && snapshot.inventoryAmount !== undefined) {
      productRow.physicalInventoryValue += finiteNumber(snapshot.inventoryAmount);
      productRow.hasPhysicalInventoryAmount = true;
    }
    productRows.set(snapshot.productId, productRow);
  }

  for (const issue of state.qualityIssues) {
    if (!issue.supplierId || ["closed", "resolved"].includes(cleanText(issue.status).toLowerCase())) continue;
    const supplier = state.suppliers.find(item => item.id === issue.supplierId);
    const supplierRow = supplierRows.get(issue.supplierId) || {
      supplierId: issue.supplierId,
      supplierName: supplier?.name || "待映射供应商",
      actualPaid: 0,
      consumedSalesCost: 0,
      rawInventoryFunds: 0,
      adjustmentAmount: 0,
      adjustedInventoryFunds: 0
    };
    supplierRow.openQualityIssues = (supplierRow.openQualityIssues || 0) + 1;
    supplierRows.set(issue.supplierId, supplierRow);
  }

  for (const adjustment of state.inventoryAdjustments) {
    if (cleanText(adjustment.status).toLowerCase() !== "confirmed") continue;
    const product = productMap.get(adjustment.productId);
    const productRow = productRows.get(adjustment.productId) || emptyDimensionRow({ product: product || { id: adjustment.productId } });
    productRow.adjustmentAmount += finiteNumber(adjustment.adjustmentAmount);
    productRow.hasAdjustmentEvidence = true;
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
    productRow.hasInventoryFundsEvidence = productRow.hasPaymentEvidence || productRow.hasSalesCostEvidence || productRow.hasAdjustmentEvidence;
    productRow.bomUnitCost = bomUnitCostByProduct.get(productRow.productId) || 0;
    productRow.hasBomCostEvidence = bomUnitCostByProduct.has(productRow.productId);
    productRow.quantityVariance = productRow.hasPhysicalSnapshot && productRow.hasErpSnapshot
      ? productRow.physicalInventoryQuantity - productRow.erpInventoryQuantity
      : 0;
    productRow.erpInventoryValue = productRow.erpInventoryQuantity * productRow.bomUnitCost;
    if (!productRow.hasPhysicalInventoryAmount) {
      productRow.physicalInventoryValue = productRow.physicalInventoryQuantity * productRow.bomUnitCost;
    }
    for (const key of ["actualPaid", "consumedSalesCost", "rawInventoryFunds", "adjustmentAmount", "adjustedInventoryFunds", "bomUnitCost", "erpInventoryValue", "physicalInventoryValue"]) {
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
  const erpInventoryValue = roundMoney(byProduct.reduce((sum, item) => sum + item.erpInventoryValue, 0));
  const physicalInventoryValue = roundMoney(byProduct.reduce((sum, item) => sum + item.physicalInventoryValue, 0));
  return {
    actualPaid,
    consumedSalesCost,
    rawInventoryFunds: roundMoney(actualPaid - consumedSalesCost),
    adjustmentAmount,
    adjustedInventoryFunds: roundMoney(actualPaid - consumedSalesCost + adjustmentAmount),
    erpInventoryValue,
    physicalInventoryValue,
    byProduct,
    bySupplier,
    exceptions: {
      unmappedApprovals: state.purchaseApprovals.filter(item => !item.supplierId || !(item.productIds?.length || state.purchaseLines.some(line => line.purchaseProcessInstanceId === item.processInstanceId && line.productId))).length,
      unmappedPayments: state.paymentApprovals.filter(item => APPROVED_STATUSES.has(cleanText(item.status).toUpperCase()) && (!item.purchaseProcessInstanceId || !purchaseMap.has(item.purchaseProcessInstanceId))).length,
      missingPaymentAmounts: state.paymentApprovals.filter(item => APPROVED_STATUSES.has(cleanText(item.status).toUpperCase()) && finiteNumber(item.amount) <= 0).length,
      overpaidPurchases: state.purchaseApprovals.filter(item => {
        const approvedAmount = finiteNumber(item.approvedAmount || item.requestedAmount);
        return approvedAmount > 0 && (approvedPaidByPurchase.get(item.processInstanceId) || 0) > approvedAmount + 0.01;
      }).length,
      openQualityIssues: state.qualityIssues.filter(item => !["closed", "resolved"].includes(cleanText(item.status).toLowerCase())).length,
      pendingAdjustments: state.inventoryAdjustments.filter(item => cleanText(item.status).toLowerCase() !== "confirmed").length
    }
  };
}

export function parseInventoryImportRows(rows = [], { products = [], suppliers = [], mode = "stocktake" } = {}) {
  const productBySku = buildProductBySku(products);
  const supplierByCode = new Map(suppliers.flatMap(supplier => [supplier.code, supplier.name].filter(Boolean).map(value => [cleanText(value), supplier])));
  const validRows = [];
  const errors = [];

  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const skuCode = cleanText(firstValue(row, ["商品编码", "SKU", "sku", "skuCode", "产品编码", "规格商家编码", "商家编码", "条码", "条形码"]));
    const product = productBySku.get(skuCode);
    const erpMode = mode === "erp";
    const countedQuantity = erpMode
      ? null
      : finiteNumber(firstValue(row, ["盘点数量", "实盘数量", "实际库存", "countedQuantity"]), Number.NaN);
    const erpQuantity = finiteNumber(firstValue(row, ["ERP库存", "erp数量", "ERP数量", "系统库存", "账面库存", "erpQuantity", "实际可用数", "实际总库存", "库存数量"]), Number.NaN);
    if (!skuCode || !product) errors.push({ rowNumber, field: "商品编码", message: "未找到对应产品" });
    if (!erpMode && (!Number.isFinite(countedQuantity) || countedQuantity < 0)) errors.push({ rowNumber, field: "盘点数量", message: "盘点数量必须是非负数字" });
    if (!Number.isFinite(erpQuantity) || erpQuantity < 0) errors.push({ rowNumber, field: "ERP库存", message: "ERP库存必须是非负数字" });
    if (!product || (!erpMode && (!Number.isFinite(countedQuantity) || countedQuantity < 0)) || !Number.isFinite(erpQuantity) || erpQuantity < 0) return;

    const supplierValue = cleanText(firstValue(row, ["供应商编码", "供应商", "supplierCode"]));
    const supplier = supplierByCode.get(supplierValue);
    const inventoryAmountValue = firstValue(row, ["库存金额", "盘点金额", "inventoryAmount"]);
    validRows.push({
      id: uniqueId("inventory"),
      productId: product.id,
      productName: cleanText(firstValue(row, ["产品名称（规格）", "产品名称", "规格别名", "productName"])) || product.name || product.productName || "",
      supplierId: supplier?.id || "",
      skuCode,
      countedQuantity,
      erpQuantity,
      quantityVariance: erpMode ? null : roundMoney(countedQuantity - erpQuantity),
      inventoryAmount: cleanText(inventoryAmountValue) ? roundMoney(inventoryAmountValue) : null,
      warehouse: cleanText(firstValue(row, ["仓库", "仓库名称", "warehouse"])),
      sourceType: erpMode ? "kuaimai-import" : "stocktake-import",
      sourceRow: rowNumber
    });
  });
  return { validRows, errors };
}

export function parseQualityImportRows(rows = [], { products = [], suppliers = [] } = {}) {
  const productBySku = buildProductBySku(products);
  const supplierByValue = new Map(suppliers.flatMap(supplier => [supplier.id, supplier.code, supplier.name].filter(Boolean).map(value => [cleanText(value), supplier])));
  const validRows = [];
  const errors = [];
  rows.forEach((row, index) => {
    const rowNumber = index + 2;
    const skuCode = cleanText(firstValue(row, ["商品编码", "SKU", "sku", "skuCode", "产品编码", "规格商家编码", "商家编码"]));
    const product = productBySku.get(skuCode);
    const content = cleanText(firstValue(row, ["差评内容", "评价内容", "问题描述", "质量问题", "问题", "反馈", "content"]));
    if (!product) errors.push({ rowNumber, field: "商品编码", message: "未找到对应产品" });
    if (!content) errors.push({ rowNumber, field: "差评内容", message: "差评内容不能为空" });
    if (!product || !content) return;
    const publicRelationsStatus = cleanText(firstValue(row, ["公关状态", "处理状态", "status"]));
    const supplierValue = cleanText(firstValue(row, ["供应商编码", "供应商", "责任供应商", "supplier"]));
    const supplier = supplierByValue.get(supplierValue);
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
      sourceType: cleanText(firstValue(row, ["来源", "问题来源", "sourceType"])) || "文件导入",
      batchNo: cleanText(firstValue(row, ["批次", "批次号", "生产批次", "batchNo"])),
      productionDate: cleanText(firstValue(row, ["生产日期", "生产时间", "productionDate"])),
      inspectionDate: cleanText(firstValue(row, ["抽检日期", "质检日期", "inspectionDate"])),
      warehouse: cleanText(firstValue(row, ["仓库", "仓库名称", "warehouse"])),
      supplierId: supplier?.id || "",
      supplierName: supplier?.name || supplierValue,
      disposition: cleanText(firstValue(row, ["处置方式", "处理结果", "处理方式", "disposition"])),
      correctiveAction: cleanText(firstValue(row, ["整改措施", "纠正措施", "长期措施", "correctiveAction"])),
      verificationResult: cleanText(firstValue(row, ["验证结果", "复检结果", "verificationResult"])),
      publicRelationsResult: cleanText(firstValue(row, ["公关结果", "公关处理结果", "回复结果", "publicRelationsResult"])),
      publicRelationsStatus,
      status: closed ? "closed" : "open",
      sourceRow: rowNumber
    });
  });
  return { validRows, errors };
}
