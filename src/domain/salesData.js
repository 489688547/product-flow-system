const CODE_PATTERN = /^69\d{10,12}$/;

export const SALES_COLUMN_RULES = [
  { key: "code", label: "69码", required: true, synonyms: ["系统商品编码", "规格商家编码", "主商家编码", "商品编码", "69码", "条码", "条形码", "商品条码", "barcode"] },
  { key: "fallbackCode", label: "主商家编码", required: false, synonyms: ["主商家编码"] },
  { key: "title", label: "商品标题", required: false, synonyms: ["系统商品标题", "商品标题", "商品名称", "标题"] },
  { key: "platform", label: "平台", required: false, synonyms: ["店铺平台", "所属平台", "平台", "渠道"] },
  { key: "shop", label: "店铺", required: false, synonyms: ["店铺名称", "店铺"] },
  { key: "createTime", label: "订单创建时间", required: false, synonyms: ["订单创建时间", "创建时间", "下单时间", "交易创建时间"] },
  { key: "payTime", label: "付款时间", required: false, synonyms: ["付款时间", "支付时间"] },
  { key: "consignTime", label: "发货时间", required: false, synonyms: ["发货时间"] },
  { key: "finishTime", label: "完成时间", required: false, synonyms: ["完成时间", "成交时间"] },
  { key: "qty", label: "净销量", required: false, synonyms: ["净销量", "销量", "数量"] },
  { key: "grossQty", label: "销售数量", required: false, synonyms: ["销售数量"] },
  { key: "returnQty", label: "退货数量", required: false, synonyms: ["退货数量"] },
  { key: "sales", label: "已付金额", required: false, synonyms: ["订单买家已付金额", "商品买家已付金额", "买家已付金额", "已付金额", "支付金额", "销售额"] },
  { key: "netSales", label: "净销售额", required: false, synonyms: ["净销售额", "实收金额", "净销售"] },
  { key: "grossSales", label: "销售金额", required: false, synonyms: ["销售金额"] },
  { key: "grossProfit", label: "净毛利", required: false, synonyms: ["净毛利"] },
  { key: "refund", label: "退款金额", required: false, synonyms: ["退款金额", "退款"] },
  { key: "cost", label: "销售成本", required: false, synonyms: ["销售成本", "成本"] },
  { key: "returnCost", label: "退货成本", required: false, synonyms: ["退货成本"] },
  { key: "preShipRate", label: "发货前退款率", required: false, synonyms: ["发货前退款率"] },
  { key: "postShipRate", label: "发货后退款率", required: false, synonyms: ["发货后退款率"] }
];

function cellText(value) {
  return String(value ?? "").trim();
}

function headerText(header) {
  return cellText(header).replace(/[\s（(].*$/, "");
}

function findColumn(header, synonyms) {
  const texts = header.map(headerText);
  for (const synonym of synonyms) {
    const exact = texts.findIndex(text => text === synonym);
    if (exact >= 0) return exact;
  }
  for (const synonym of synonyms) {
    const prefixed = texts.findIndex(text => text && text.startsWith(synonym));
    if (prefixed >= 0) return prefixed;
  }
  return -1;
}

export function detectSalesHeader(rows, scanLimit = 8) {
  for (let index = 0; index < Math.min(rows.length, scanLimit); index += 1) {
    const row = (rows[index] || []).map(cellText);
    const codeAt = findColumn(row, SALES_COLUMN_RULES[0].synonyms);
    const qtyAt = findColumn(row, [
      ...SALES_COLUMN_RULES.find(rule => rule.key === "qty").synonyms,
      ...SALES_COLUMN_RULES.find(rule => rule.key === "grossQty").synonyms
    ]);
    if (codeAt >= 0 && qtyAt >= 0) return { headerIndex: index, header: row };
  }
  return null;
}

export function detectSalesColumns(header) {
  const mapping = {};
  const misses = [];
  SALES_COLUMN_RULES.forEach(rule => {
    const at = findColumn(header, rule.synonyms);
    if (at >= 0) mapping[rule.key] = at;
    else if (rule.required) misses.push(rule.label);
  });
  if (mapping.qty == null && mapping.grossQty == null) misses.push("净销量/销售数量");
  if (mapping.netSales == null && mapping.grossSales == null) misses.push("净销售额/销售金额");
  return { mapping, missing: misses, complete: misses.length === 0 };
}

function toNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = cellText(value).replace(/[,¥￥%]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Rates arrive either as text like "12.50%" or as an Excel fraction like 0.125.
export function toRate(value) {
  if (typeof value === "number") return Number.isFinite(value) ? (value > 1.5 ? value / 100 : value) : 0;
  const text = cellText(value);
  if (!text) return 0;
  const parsed = Number(text.replace(/[,%]/g, ""));
  if (!Number.isFinite(parsed)) return 0;
  return text.includes("%") || parsed > 1.5 ? parsed / 100 : parsed;
}

const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

export function normalizeSalesDate(value) {
  if (value == null || value === "") return "";
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const date = new Date(EXCEL_EPOCH_MS + value * 86400000);
    return date.toISOString().slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  const text = cellText(value).replace(/\//g, "-");
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!match) return "";
  const year = Number(match[1]);
  if (year < 2015 || year > 2100) return "";
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

export function isSalesBarcode(value) {
  return CODE_PATTERN.test(cellText(value));
}

function isInventoryUnitCode(value) {
  const code = cellText(value);
  return Boolean(code) && code.length <= 160;
}

export function createSalesAggregator(mapping) {
  const buckets = new Map();
  const titles = {};
  const months = new Set();
  let skipped = 0;
  let sourceRows = 0;
  const cell = (row, key) => (mapping[key] == null ? "" : row[mapping[key]]);
  return {
    add(row) {
      sourceRows += 1;
      const primaryCode = cellText(cell(row, "code"));
      const fallbackCode = cellText(cell(row, "fallbackCode"));
      const code = isInventoryUnitCode(primaryCode) ? primaryCode : fallbackCode;
      if (!isInventoryUnitCode(code)) {
        skipped += 1;
        return;
      }
      const date = normalizeSalesDate(cell(row, "createTime")) || normalizeSalesDate(cell(row, "payTime")) || normalizeSalesDate(cell(row, "consignTime")) || normalizeSalesDate(cell(row, "finishTime"));
      if (!date) {
        skipped += 1;
        return;
      }
      const platform = cellText(cell(row, "platform")) || "未知平台";
      const key = `${code}|${date}|${platform}`;
      const bucket = buckets.get(key) || { code, date, platform, qty: 0, sales: 0, netSales: 0, grossProfit: 0, refund: 0, cost: 0, preShipRefund: 0, postShipRefund: 0 };
      const rowSales = toNumber(cell(row, "sales"));
      const refund = toNumber(cell(row, "refund"));
      const derivesNetMetrics = mapping.netSales == null && mapping.grossSales != null;
      const quantity = mapping.qty == null
        ? toNumber(cell(row, "grossQty")) - toNumber(cell(row, "returnQty"))
        : toNumber(cell(row, "qty"));
      const netSales = derivesNetMetrics
        ? toNumber(cell(row, "grossSales")) - refund
        : toNumber(cell(row, "netSales"));
      const cost = derivesNetMetrics
        ? toNumber(cell(row, "cost")) - toNumber(cell(row, "returnCost"))
        : toNumber(cell(row, "cost"));
      const grossProfit = mapping.grossProfit == null && derivesNetMetrics
        ? netSales - cost
        : toNumber(cell(row, "grossProfit"));
      bucket.qty += quantity;
      bucket.sales += rowSales;
      bucket.netSales += netSales;
      bucket.grossProfit += grossProfit;
      bucket.refund += refund;
      bucket.cost += cost;
      bucket.preShipRefund += toRate(cell(row, "preShipRate")) * rowSales;
      bucket.postShipRefund += toRate(cell(row, "postShipRate")) * rowSales;
      buckets.set(key, bucket);
      months.add(date.slice(0, 7));
      const title = cellText(cell(row, "title"));
      if (title && !titles[code]) titles[code] = title;
    },
    finish() {
      const daily = [...buckets.values()].map(bucket => ({
        ...bucket,
        qty: Math.round(bucket.qty),
        sales: Math.round(bucket.sales * 100) / 100,
        netSales: Math.round(bucket.netSales * 100) / 100,
        grossProfit: Math.round(bucket.grossProfit * 100) / 100,
        refund: Math.round(bucket.refund * 100) / 100,
        cost: Math.round(bucket.cost * 100) / 100,
        preShipRefund: Math.round(bucket.preShipRefund * 100) / 100,
        postShipRefund: Math.round(bucket.postShipRefund * 100) / 100
      })).sort((a, b) => a.date.localeCompare(b.date) || a.code.localeCompare(b.code));
      return { rows: daily, titles, months: [...months].sort(), skipped, sourceRows };
    }
  };
}

export function aggregateSalesRows(rows, mapping) {
  const aggregator = createSalesAggregator(mapping);
  rows.forEach(row => aggregator.add(row));
  return aggregator.finish();
}

export function normalizeSkuCodes(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map(item => ({ code: cellText(item?.code), price: item?.price === "" || item?.price == null ? null : Number(item.price) }))
    .filter(item => isInventoryUnitCode(item.code))
    .map(item => ({ code: item.code, price: Number.isFinite(item.price) && item.price > 0 ? item.price : null }));
}

function round2(value) {
  return Math.round(value * 100) / 100;
}

export function summarizeProductSales(dailyRows, skuCodes) {
  const codes = normalizeSkuCodes(skuCodes);
  const codeSet = new Set(codes.map(item => item.code));
  const priceByCode = new Map(codes.map(item => [item.code, item.price]));
  const rows = dailyRows.filter(row => codeSet.has(row.code));
  const totals = { qty: 0, sales: 0, netSales: 0, grossProfit: 0, refund: 0, preShipRefund: 0, postShipRefund: 0 };
  const byPlatform = new Map();
  const byDay = new Map();
  let pricedListValue = 0;
  let pricedNetSales = 0;
  let unpricedQty = 0;
  rows.forEach(row => {
    totals.qty += row.qty;
    totals.sales += row.sales;
    totals.netSales += row.netSales;
    totals.grossProfit += row.grossProfit;
    totals.refund += row.refund;
    totals.preShipRefund += row.preShipRefund || 0;
    totals.postShipRefund += row.postShipRefund || 0;
    const platform = byPlatform.get(row.platform) || { platform: row.platform, qty: 0, netSales: 0, grossProfit: 0, refund: 0, sales: 0, preShipRefund: 0, postShipRefund: 0, listValue: 0, pricedNetSales: 0 };
    platform.qty += row.qty;
    platform.netSales += row.netSales;
    platform.grossProfit += row.grossProfit;
    platform.refund += row.refund;
    platform.sales += row.sales;
    platform.preShipRefund += row.preShipRefund || 0;
    platform.postShipRefund += row.postShipRefund || 0;
    byPlatform.set(row.platform, platform);
    const day = byDay.get(row.date) || { date: row.date, qty: 0, netSales: 0 };
    day.qty += row.qty;
    day.netSales += row.netSales;
    byDay.set(row.date, day);
    const price = priceByCode.get(row.code);
    if (price) {
      pricedListValue += price * row.qty;
      pricedNetSales += row.netSales;
      platform.listValue += price * row.qty;
      platform.pricedNetSales += row.netSales;
    } else {
      unpricedQty += row.qty;
    }
  });
  const marketingExpense = pricedListValue > 0 ? round2(pricedListValue - pricedNetSales) : null;
  return {
    totals: {
      qty: totals.qty,
      sales: round2(totals.sales),
      netSales: round2(totals.netSales),
      grossProfit: round2(totals.grossProfit),
      refund: round2(totals.refund),
      preShipRefund: round2(totals.preShipRefund),
      postShipRefund: round2(totals.postShipRefund),
      grossMarginRate: totals.netSales > 0 ? round2(totals.grossProfit / totals.netSales * 100) : null,
      refundRate: totals.sales > 0 ? round2(totals.refund / totals.sales * 100) : null,
      preShipRefundRate: totals.sales > 0 ? round2(totals.preShipRefund / totals.sales * 100) : null,
      postShipRefundRate: totals.sales > 0 ? round2(totals.postShipRefund / totals.sales * 100) : null,
      marketingExpense,
      // 营销费用率 = 营销费用 / 牌价(定价×销量)，即定价里让利出去的比例，上限100%。
      marketingExpenseRate: marketingExpense != null && pricedListValue > 0 ? round2(marketingExpense / pricedListValue * 100) : null,
      unpricedQty
    },
    byPlatform: [...byPlatform.values()]
      .map(item => ({
        platform: item.platform,
        qty: item.qty,
        netSales: round2(item.netSales),
        grossProfit: round2(item.grossProfit),
        refund: round2(item.refund),
        sales: round2(item.sales),
        refundRate: item.sales > 0 ? round2(item.refund / item.sales * 100) : null,
        grossMarginRate: item.netSales > 0 ? round2(item.grossProfit / item.netSales * 100) : null,
        marketingExpenseRate: item.listValue > 0 ? round2((item.listValue - item.pricedNetSales) / item.listValue * 100) : null,
        preShipRefundRate: item.sales > 0 ? round2(item.preShipRefund / item.sales * 100) : null,
        postShipRefundRate: item.sales > 0 ? round2(item.postShipRefund / item.sales * 100) : null
      }))
      .sort((a, b) => b.netSales - a.netSales),
    byDay: [...byDay.values()].map(item => ({ ...item, netSales: round2(item.netSales) })).sort((a, b) => a.date.localeCompare(b.date))
  };
}

export function salesMonthsFromRows(rows) {
  return [...new Set(rows.map(row => row.date.slice(0, 7)))].sort();
}

function toDateString(date) {
  return date.toISOString().slice(0, 10);
}

function shiftDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return toDateString(date);
}

export const SALES_PERIOD_PRESETS = [
  { key: "15d", label: "过去15天" },
  { key: "30d", label: "过去30天" },
  { key: "thisMonth", label: "本月" },
  { key: "lastMonth", label: "上个月" },
  { key: "custom", label: "自定义" }
];

// "过去N天" anchors to the latest imported day, so a fresh month's export
// still fills the chart even when it is opened days later.
export function resolveSalesPeriod(preset, rows, custom = {}, today = new Date()) {
  const todayString = toDateString(today);
  const latest = rows.reduce((max, row) => (row.date > max ? row.date : max), rows.length ? rows[0].date : todayString);
  if (preset === "custom" && custom.from && custom.to) {
    return custom.from <= custom.to ? { start: custom.from, end: custom.to } : { start: custom.to, end: custom.from };
  }
  if (preset === "thisMonth") {
    return { start: `${todayString.slice(0, 7)}-01`, end: todayString };
  }
  if (preset === "lastMonth") {
    const firstOfThisMonth = `${todayString.slice(0, 7)}-01`;
    const lastMonthEnd = shiftDays(firstOfThisMonth, -1);
    return { start: `${lastMonthEnd.slice(0, 7)}-01`, end: lastMonthEnd };
  }
  const days = preset === "30d" ? 30 : 15;
  return { start: shiftDays(latest, -(days - 1)), end: latest };
}

export function filterRowsByPeriod(rows, period) {
  return rows.filter(row => row.date >= period.start && row.date <= period.end);
}

export function buildDailySeries(rows, period) {
  const byDay = new Map();
  rows.forEach(row => {
    const day = byDay.get(row.date) || { date: row.date, netSales: 0, qty: 0 };
    day.netSales = round2(day.netSales + row.netSales);
    day.qty += row.qty;
    byDay.set(row.date, day);
  });
  const series = [];
  for (let date = period.start; date <= period.end && series.length < 400; date = shiftDays(date, 1)) {
    series.push(byDay.get(date) || { date, netSales: 0, qty: 0 });
  }
  return series;
}

const PLATFORM_SORT_KEYS = new Set([
  "platform",
  "qty",
  "netSales",
  "grossMarginRate",
  "marketingExpenseRate",
  "preShipRefundRate",
  "postShipRefundRate"
]);

export function sortPlatformSalesRows(rows, sort = { key: "netSales", direction: "desc" }) {
  const key = PLATFORM_SORT_KEYS.has(sort?.key) ? sort.key : "netSales";
  const direction = sort?.direction === "asc" ? "asc" : "desc";
  const factor = direction === "asc" ? 1 : -1;
  return [...rows].sort((left, right) => {
    const leftValue = left[key];
    const rightValue = right[key];
    if (leftValue == null && rightValue == null) return String(left.platform).localeCompare(String(right.platform), "zh-CN");
    if (leftValue == null) return 1;
    if (rightValue == null) return -1;
    const difference = key === "platform"
      ? String(leftValue).localeCompare(String(rightValue), "zh-CN")
      : Number(leftValue) - Number(rightValue);
    return difference ? difference * factor : String(left.platform).localeCompare(String(right.platform), "zh-CN");
  });
}
