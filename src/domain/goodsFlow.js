const DAY_MS = 24 * 60 * 60 * 1000;

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function dateValue(value) {
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : Number.NEGATIVE_INFINITY;
}

function daysBetween(from, to) {
  const start = dateValue(from);
  const end = dateValue(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return Math.floor((end - start) / DAY_MS);
}

function inventoryKey(row = {}) {
  return `${String(row.skuId || "").trim()}::${String(row.warehouseId || "").trim()}`;
}

export function calibrateInventoryQuantity({ currentErpQuantity, anchorErpQuantity, anchorCountedQuantity } = {}) {
  const current = numberOrNull(currentErpQuantity) ?? 0;
  const counted = numberOrNull(anchorCountedQuantity);
  const anchor = numberOrNull(anchorErpQuantity);
  if (counted === null || anchor === null) return current;
  return round(counted + current - anchor, 4);
}

export function resolveReceivableTerm(terms = [], platform = "", date = "") {
  const targetPlatform = String(platform || "").trim();
  const targetDate = String(date || "").slice(0, 10);
  if (!targetPlatform || !targetDate) return null;
  return terms
    .filter(row => String(row?.platform || "").trim() === targetPlatform)
    .filter(row => String(row?.effectiveFrom || "").slice(0, 10) <= targetDate)
    .filter(row => !row?.effectiveTo || String(row.effectiveTo).slice(0, 10) >= targetDate)
    .sort((left, right) => String(right.effectiveFrom).localeCompare(String(left.effectiveFrom)))[0] || null;
}

export function buildInventoryDailyRows({ asOf, erpSnapshots = [], stocktakes = [] } = {}) {
  const targetDate = String(asOf || "").slice(0, 10);
  const latestErp = new Map();
  for (const snapshot of erpSnapshots) {
    const snapshotDate = String(snapshot?.date || snapshot?.snapshotDate || snapshot?.stocktakeDate || "").slice(0, 10);
    if (!snapshot?.skuId || !snapshot?.warehouseId || !snapshotDate || snapshotDate > targetDate) continue;
    const key = inventoryKey(snapshot);
    const current = latestErp.get(key);
    if (!current || dateValue(snapshotDate) >= dateValue(current.date)) latestErp.set(key, { ...snapshot, date: snapshotDate });
  }

  const anchors = new Map();
  for (const stocktake of stocktakes) {
    const countedAt = String(stocktake?.countedAt || stocktake?.stocktakeDate || "").slice(0, 10);
    if (String(stocktake?.status || "").toLowerCase() !== "confirmed" || !countedAt || countedAt > targetDate) continue;
    for (const line of stocktake.lines || []) {
      if (!line?.skuId || !line?.warehouseId) continue;
      const key = inventoryKey(line);
      const current = anchors.get(key);
      if (!current || dateValue(countedAt) >= dateValue(current.countedAt)) {
        anchors.set(key, { ...line, stocktakeId: stocktake.id, countedAt });
      }
    }
  }

  return [...latestErp.values()].map(snapshot => {
    const anchor = anchors.get(inventoryKey(snapshot));
    const erpQuantity = numberOrNull(snapshot.quantity ?? snapshot.erpQuantity) ?? 0;
    const unitCost = numberOrNull(snapshot.unitCost) ?? 0;
    const calibratedQuantity = calibrateInventoryQuantity({
      currentErpQuantity: erpQuantity,
      anchorErpQuantity: anchor?.erpQuantity,
      anchorCountedQuantity: anchor?.countedQuantity
    });
    return {
      date: targetDate,
      skuId: snapshot.skuId,
      skuCode: snapshot.skuCode || "",
      warehouseId: snapshot.warehouseId,
      erpQuantity,
      countedQuantity: anchor ? numberOrNull(anchor.countedQuantity) : null,
      calibratedQuantity,
      unitCost,
      calibratedInventoryValue: round(calibratedQuantity * unitCost),
      stocktakeId: anchor?.stocktakeId || null,
      stocktakeStatus: anchor ? "calibrated" : "unverified",
      sourceUpdatedAt: snapshot.date
    };
  }).sort((left, right) => inventoryKey(left).localeCompare(inventoryKey(right)));
}

function averageInventoryValue(rows) {
  const byDate = new Map();
  for (const row of rows) {
    const value = numberOrNull(row?.calibratedInventoryValue);
    if (value === null) continue;
    const date = String(row.date || "unknown");
    byDate.set(date, (byDate.get(date) || 0) + value);
  }
  if (!byDate.size) return null;
  return [...byDate.values()].reduce((sum, value) => sum + value, 0) / byDate.size;
}

function calculateReceivableDays({ sales, receivableTerms, periodEnd }) {
  let totalSales = 0;
  let matchedSales = 0;
  let weightedDays = 0;
  for (const row of sales) {
    const netSales = Math.max(0, numberOrNull(row?.netSales) ?? 0);
    if (!netSales) continue;
    totalSales += netSales;
    const term = resolveReceivableTerm(receivableTerms, row.platform, periodEnd);
    const days = numberOrNull(term?.days);
    if (days === null) continue;
    matchedSales += netSales;
    weightedDays += netSales * days;
  }
  return {
    days: matchedSales > 0 ? round(weightedDays / matchedSales) : null,
    coverage: totalSales > 0 ? round(matchedSales / totalSales, 4) : 0
  };
}

function calculatePayableDays({ purchases, payments, periodEnd }) {
  const paymentsByPurchase = new Map();
  for (const payment of payments) {
    const purchaseId = String(payment?.purchaseId || "").trim();
    const amount = Math.max(0, numberOrNull(payment?.amount) ?? 0);
    if (!purchaseId || !amount || !payment?.paidAt) continue;
    const rows = paymentsByPurchase.get(purchaseId) || [];
    rows.push({ amount, paidAt: payment.paidAt });
    paymentsByPurchase.set(purchaseId, rows);
  }

  let totalAmount = 0;
  let coveredAmount = 0;
  let weightedDays = 0;
  for (const purchase of purchases) {
    const amount = Math.max(0, numberOrNull(purchase?.amount) ?? 0);
    if (!amount) continue;
    totalAmount += amount;
    const startedAt = purchase.receivedAt || purchase.approvedAt;
    if (!startedAt) continue;
    coveredAmount += amount;
    let paidAmount = 0;
    for (const payment of paymentsByPurchase.get(String(purchase.id)) || []) {
      const allocated = Math.min(payment.amount, Math.max(0, amount - paidAmount));
      const elapsed = daysBetween(startedAt, payment.paidAt);
      if (!allocated || elapsed === null) continue;
      weightedDays += allocated * elapsed;
      paidAmount += allocated;
    }
    const unpaid = Math.max(0, amount - paidAmount);
    const unpaidDays = daysBetween(startedAt, periodEnd);
    if (unpaid && unpaidDays !== null) weightedDays += unpaid * unpaidDays;
  }
  return {
    days: coveredAmount > 0 ? round(weightedDays / coveredAmount) : null,
    coverage: totalAmount > 0 ? round(coveredAmount / totalAmount, 4) : 0
  };
}

function coverageConfidence(coverage, cccDays) {
  const values = Object.values(coverage);
  if (Number.isFinite(cccDays) && values.every(value => value === 1)) return "complete";
  if (values.filter(value => value > 0).length >= 3) return "partial";
  return "insufficient";
}

export function calculateGoodsFlowMetrics({
  month = "",
  periodEnd = "",
  daysInPeriod = 30,
  inventoryDaily = [],
  sales = [],
  receivableTerms = [],
  purchases = [],
  payments = [],
  inventoryFunds
} = {}) {
  const averageInventory = averageInventoryValue(inventoryDaily);
  const salesCost = sales.reduce((sum, row) => sum + Math.max(0, numberOrNull(row?.cost) ?? 0), 0);
  const inventoryDays = averageInventory !== null && salesCost > 0
    ? round(averageInventory / salesCost * Number(daysInPeriod || 0))
    : null;
  const receivable = calculateReceivableDays({ sales, receivableTerms, periodEnd });
  const payable = calculatePayableDays({ purchases, payments, periodEnd });
  const coreRows = inventoryDaily.filter(row => row?.isCore);
  const stockoutRows = coreRows.filter(row => (numberOrNull(row?.sellableQuantity) ?? 0) <= 0);
  const stockoutRate = coreRows.length ? round(stockoutRows.length / coreRows.length * 100) : null;
  const cccDays = [inventoryDays, receivable.days, payable.days].every(Number.isFinite)
    ? round(inventoryDays + receivable.days - payable.days)
    : null;
  const inventoryCashTied = inventoryFunds
    ? round((numberOrNull(inventoryFunds.paidPurchaseAmount) ?? 0)
      - (numberOrNull(inventoryFunds.consumedSalesCost) ?? 0)
      + (numberOrNull(inventoryFunds.confirmedStocktakeAdjustment) ?? 0))
    : null;
  const coverage = {
    inventory: inventoryDaily.length ? 1 : 0,
    salesCost: salesCost > 0 ? 1 : 0,
    receivableTerms: receivable.coverage,
    payableDates: payable.coverage,
    stocktake: inventoryDaily.length
      ? round(inventoryDaily.filter(row => row?.stocktakeStatus === "calibrated").length / inventoryDaily.length, 4)
      : 0
  };

  return {
    month,
    cccDays,
    inventoryDays,
    receivableDays: receivable.days,
    payableDays: payable.days,
    stockoutRate,
    inventoryCashTied,
    coverage,
    confidence: coverageConfidence(coverage, cccDays),
    formulaVersion: "goods-flow-v1"
  };
}
