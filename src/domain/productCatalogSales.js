const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function dateValue(value) {
  if (!DATE_PATTERN.test(String(value || ""))) return null;
  const [year, month, day] = String(value).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toISOString().slice(0, 10) === value ? date : null;
}

function dateString(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(value, days) {
  return new Date(value.valueOf() + days * DAY_MS);
}

export function currentShanghaiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function productCatalogSalesRange(preset = "last30", custom = {}, today = currentShanghaiDate()) {
  const current = dateValue(today);
  if (!current) throw new Error("当前日期无效。");
  if (preset === "custom") {
    const fromDate = dateValue(custom.from);
    const toDate = dateValue(custom.to);
    if (!fromDate || !toDate) throw new Error("请选择完整的开始和结束日期。");
    if (fromDate > toDate) throw new Error("开始日期不能晚于结束日期。");
    if ((toDate - fromDate) / DAY_MS > 370) throw new Error("日期范围最多查询 370 天。");
    return { preset, from: custom.from, to: custom.to };
  }
  if (preset === "thisMonth") {
    return { preset, from: `${today.slice(0, 7)}-01`, to: today };
  }
  if (preset === "lastMonth") {
    const firstOfThisMonth = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth(), 1));
    const lastOfPreviousMonth = shiftDays(firstOfThisMonth, -1);
    const firstOfPreviousMonth = new Date(Date.UTC(lastOfPreviousMonth.getUTCFullYear(), lastOfPreviousMonth.getUTCMonth(), 1));
    return { preset, from: dateString(firstOfPreviousMonth), to: dateString(lastOfPreviousMonth) };
  }
  const days = preset === "last7" ? 7 : 30;
  return { preset: preset === "last7" ? "last7" : "last30", from: dateString(shiftDays(current, -(days - 1))), to: today };
}

function codeValues(sku = {}) {
  return [...new Set([sku.barcode, sku.merchantSkuCode].map(value => String(value || "").trim()).filter(Boolean))];
}

function emptySales() {
  return { quantity: 0, netSales: 0, matchedCodeCount: 0, platforms: [] };
}

export function sortProductCatalogBySales(items = []) {
  return [...items].sort((left, right) => {
    const quantityDifference = (Number(right?.sales?.quantity) || 0) - (Number(left?.sales?.quantity) || 0);
    if (quantityDifference) return quantityDifference;
    const salesDifference = (Number(right?.sales?.netSales) || 0) - (Number(left?.sales?.netSales) || 0);
    if (salesDifference) return salesDifference;
    return String(left?.name || "").localeCompare(String(right?.name || ""), "zh-CN");
  });
}

export function aggregateProductCatalogSales(items = [], rows = []) {
  const ownersByCode = new Map();
  for (const item of items) {
    const itemCodes = new Set((item.skus || []).flatMap(codeValues));
    for (const code of itemCodes) {
      const owners = ownersByCode.get(code) || new Set();
      owners.add(item.id);
      ownersByCode.set(code, owners);
    }
  }

  const salesByProduct = new Map();
  let unmatchedRowCount = 0;
  for (const row of rows) {
    const code = String(row?.code || "").trim();
    const owners = ownersByCode.get(code);
    if (!owners || owners.size !== 1) {
      unmatchedRowCount += 1;
      continue;
    }
    const productId = [...owners][0];
    const current = salesByProduct.get(productId) || { ...emptySales(), codes: new Set(), byPlatform: new Map() };
    const quantity = Number(row.qty) || 0;
    const netSales = Number(row.netSales) || 0;
    const platform = String(row.platform || "未知平台").trim() || "未知平台";
    current.quantity += quantity;
    current.netSales += netSales;
    current.codes.add(code);
    const platformSales = current.byPlatform.get(platform) || { platform, quantity: 0, netSales: 0 };
    platformSales.quantity += quantity;
    platformSales.netSales += netSales;
    current.byPlatform.set(platform, platformSales);
    salesByProduct.set(productId, current);
  }

  let totalQuantity = 0;
  let totalNetSales = 0;
  let coveredProducts = 0;
  const resultItems = items.map(item => {
    const current = salesByProduct.get(item.id);
    if (!current) return { ...item, sales: emptySales() };
    const sales = {
      quantity: current.quantity,
      netSales: current.netSales,
      matchedCodeCount: current.codes.size,
      platforms: [...current.byPlatform.values()].sort((left, right) => right.quantity - left.quantity || left.platform.localeCompare(right.platform, "zh-CN"))
    };
    totalQuantity += sales.quantity;
    totalNetSales += sales.netSales;
    if (sales.quantity || sales.netSales) coveredProducts += 1;
    return { ...item, sales };
  });

  return {
    items: resultItems,
    meta: { totalQuantity, totalNetSales, coveredProducts, unmatchedRowCount }
  };
}
