import {
  DEFAULT_AI_PROVIDER,
  createDefaultAiDataPolicies,
  normalizeAiDataPolicies,
  normalizeAiProvider
} from "./aiAssistant.js";

export const DATA_CENTER_COLLECTIONS = [
  "sources",
  "runners",
  "syncRuns",
  "sourceFiles",
  "mappings",
  "metricDefinitions",
  "qualityIssues",
  "subscriptions",
  "auditLogs",
  "aiProviders",
  "aiDataPolicies"
];

// Shared data-standard definitions are only retained here for old readers while
// the API migration is in progress. Generic data-center writes must not replace
// the governed definition collection.
export const DATA_CENTER_PERSISTED_COLLECTIONS = DATA_CENTER_COLLECTIONS.filter(collection => collection !== "metricDefinitions");

export const DATA_CENTER_STATUS = [
  "healthy",
  "running",
  "stale",
  "login_required",
  "schema_changed",
  "failed",
  "disabled"
];

// Legacy data_sources remains metadata-only. New encrypted values belong in the
// shared credential vault and are referenced by ID from connector instances.
const BLOCKED_SOURCE_KEY = /(?:password|passwd|cookie|token|secret|verificationcode|smscode|session)/i;
const COLLECTION_LIMITS = {
  sources: 200,
  runners: 100,
  syncRuns: 300,
  sourceFiles: 300,
  mappings: 1000,
  metricDefinitions: 100,
  qualityIssues: 500,
  subscriptions: 100,
  auditLogs: 500,
  aiProviders: 10,
  aiDataPolicies: 50
};
const EXCLUDED_PLATFORMS = new Set(["", "其它", "其他", "未知", "未知平台"]);
const SALES_METRICS = ["qty", "sales", "netSales", "grossProfit", "refund", "cost"];

export const DATA_CENTER_OVERVIEW_METRICS = Object.freeze([
  { metricCode: "sales.net_sales", label: "净销售额", format: "money", comparison: "relative", favorable: "increase" },
  { metricCode: "sales.quantity", label: "销售数量", format: "number", comparison: "relative", favorable: "increase" },
  { metricCode: "sales.gross_profit", label: "毛利", format: "money", comparison: "relative", favorable: "increase" },
  { metricCode: "sales.refund_rate", label: "退款率", format: "percent", comparison: "percentage_point", favorable: "decrease" },
  { metricCode: "sales.gross_margin_rate", label: "毛利率", format: "percent", comparison: "percentage_point", favorable: "increase" }
]);

function shanghaiDate(value) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${byType.year}-${byType.month}-${byType.day}`;
}

function previousDay(day) {
  return shanghaiDate(new Date(Date.parse(`${day}T00:00:00+08:00`) - 86400000));
}

function shiftDay(day, amount) {
  return new Date(Date.parse(`${day}T00:00:00Z`) + amount * 86400000).toISOString().slice(0, 10);
}

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(value, digits = 2) {
  const scale = 10 ** digits;
  return Math.round((number(value) + Number.EPSILON) * scale) / scale;
}

function safeValue(value) {
  if (Array.isArray(value)) return value.map(safeValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !BLOCKED_SOURCE_KEY.test(key))
    .map(([key, nested]) => [key, safeValue(nested)]));
}

function safeRecord(record = {}) {
  return safeValue(record);
}

function normalizeCollection(input, fallback, key) {
  return (Array.isArray(input) ? input : fallback).slice(0, COLLECTION_LIMITS[key]).map(safeRecord);
}

function groupSales(rows, key) {
  const grouped = new Map();
  for (const row of rows) {
    const value = String(row?.[key] || "");
    const item = grouped.get(value) || {
      [key]: value,
      qty: 0,
      sales: 0,
      netSales: 0,
      grossProfit: 0,
      refund: 0,
      cost: 0
    };
    for (const metric of SALES_METRICS) item[metric] += number(row?.[metric]);
    grouped.set(value, item);
  }
  return [...grouped.values()];
}

function groupDailySales(rows) {
  const rowsByDay = new Map();
  for (const row of rows) {
    const date = String(row?.date || "");
    const dailyRows = rowsByDay.get(date) || [];
    dailyRows.push(row);
    rowsByDay.set(date, dailyRows);
  }
  return groupSales(rows, "date").map(day => ({
    ...day,
    platforms: groupSales(rowsByDay.get(day.date) || [], "platform")
      .sort((a, b) => b.sales - a.sales)
  }));
}

function completeDailySalesRange(rows, range = {}) {
  const days = dataCenterRangeDays(range);
  const actualByDate = new Map(rows.map(row => [row.date, row]));
  if (!days || days > 370) return rows.map(row => ({ ...row, hasData: true }));
  return Array.from({ length: days }, (_, index) => {
    const date = shiftDay(range.from, index);
    const actual = actualByDate.get(date);
    return actual ? { ...actual, hasData: true } : {
      date,
      qty: 0,
      sales: 0,
      netSales: 0,
      grossProfit: 0,
      refund: 0,
      cost: 0,
      platforms: [],
      hasData: false
    };
  });
}

function syncRunTimestamp(run = {}) {
  const parsed = Date.parse(run.completedAt || run.startedAt || run.createdAt || "");
  return Number.isFinite(parsed) ? parsed : 0;
}

function countLatestSyncAttention(syncRuns = []) {
  const latestBySource = new Map();
  for (const run of syncRuns) {
    const source = String(run.sourceId || run.sourceName || run.provider || run.id || "unknown");
    const current = latestBySource.get(source);
    if (!current || syncRunTimestamp(run) >= syncRunTimestamp(current)) latestBySource.set(source, run);
  }
  return [...latestBySource.values()].filter(run => !["success", "healthy"].includes(String(run.status || ""))).length;
}

export function defaultDataCenterRange(today = new Date()) {
  const to = previousDay(shanghaiDate(today));
  return { from: `${to.slice(0, 7)}-01`, to };
}

export function dataCenterPresetRange(days, today = new Date()) {
  const length = Number(days);
  if (![7, 15, 30].includes(length)) throw new RangeError("数据总览只支持近 7、15、30 天快捷范围。");
  const to = previousDay(shanghaiDate(today));
  return { from: shiftDay(to, -(length - 1)), to };
}

export function dataCenterRangeDays(range = {}) {
  const from = Date.parse(`${range.from || ""}T00:00:00Z`);
  const to = Date.parse(`${range.to || ""}T00:00:00Z`);
  if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) return 0;
  return Math.floor((to - from) / 86400000) + 1;
}

export function previousDataCenterRange(range = {}) {
  const days = dataCenterRangeDays(range);
  if (!days) return { from: "", to: "" };
  const to = shiftDay(range.from, -1);
  return { from: shiftDay(to, -(days - 1)), to };
}

function comparisonUnit(metric = {}) {
  return metric.comparison === "percentage_point" ? "percentage_point" : "percent";
}

function unavailableComparison(reasonCode, metric) {
  return {
    available: false,
    direction: "flat",
    favorable: false,
    value: null,
    unit: comparisonUnit(metric),
    reasonCode
  };
}

function resultIssue(result, period) {
  if (!result || result.value == null || !Number.isFinite(Number(result.value))) {
    return result?.reasonCode || `${period}_RESULT_NOT_AVAILABLE`;
  }
  if (result.status && result.status !== "complete") {
    return result.reasonCode || `${period}_RESULT_NOT_AVAILABLE`;
  }
  if (result.coverageRate != null && Number(result.coverageRate) < 1) return `${period}_DATA_NOT_COVERED`;
  return "";
}

export function compareDataCenterMetric(currentResult, previousResult, metric = {}) {
  const currentIssue = resultIssue(currentResult, "CURRENT");
  if (currentIssue) return unavailableComparison(currentIssue, metric);
  const previousIssue = resultIssue(previousResult, "PREVIOUS");
  if (previousIssue) return unavailableComparison(previousIssue, metric);

  const current = Number(currentResult.value);
  const previous = Number(previousResult.value);
  const unit = comparisonUnit(metric);
  if (unit === "percent" && previous === 0 && current !== 0) {
    return unavailableComparison("PREVIOUS_VALUE_ZERO", metric);
  }
  const difference = unit === "percentage_point"
    ? round(current - previous)
    : previous === 0 ? 0 : round((current - previous) / Math.abs(previous) * 100);
  const direction = difference > 0 ? "up" : difference < 0 ? "down" : "flat";
  const favorable = direction === "flat"
    || (metric.favorable === "decrease" ? direction === "down" : direction === "up");
  return {
    available: true,
    direction,
    favorable,
    value: Math.abs(difference),
    unit,
    reasonCode: ""
  };
}

export function isOperationalPlatform(value) {
  return !EXCLUDED_PLATFORMS.has(String(value || "").trim());
}

export function filterOperationalSales(rows = []) {
  return rows.filter(row => isOperationalPlatform(row?.platform));
}

export function createDefaultDataCenterState() {
  return {
    version: "data-center-v1",
    updatedAt: "",
    sources: [],
    runners: [],
    syncRuns: [],
    sourceFiles: [],
    mappings: [],
    metricDefinitions: [
      {
        id: "net-sales",
        metricCode: "sales.net_sales",
        name: "净销售额",
        formula: "净销售额按订单创建日汇总",
        timeBasis: "create_time",
        timezone: "Asia/Shanghai",
        excludeOther: true,
        owner: "财务部",
        version: 1,
        readOnly: true
      },
      {
        id: "gross-profit",
        metricCode: "sales.gross_profit",
        name: "毛利",
        formula: "毛利按订单创建日汇总",
        timeBasis: "create_time",
        timezone: "Asia/Shanghai",
        excludeOther: true,
        owner: "财务部",
        version: 1,
        readOnly: true
      }
    ],
    qualityIssues: [],
    subscriptions: [
      {
        id: "product-flow-sales",
        appId: "product-flow",
        dataset: "sales_daily",
        apiVersion: "v1",
        freshnessHours: 32,
        enabled: true
      }
    ],
    auditLogs: [],
    aiProviders: [{ ...DEFAULT_AI_PROVIDER }],
    aiDataPolicies: createDefaultAiDataPolicies(),
    settings: {
      timezone: "Asia/Shanghai",
      cutoff: "07:30",
      rawRetentionDays: 365,
      staleAfterHours: 32
    }
  };
}

export function normalizeDataCenterState(input = {}) {
  const base = createDefaultDataCenterState();
  const state = {
    ...base,
    ...input,
    settings: { ...base.settings, ...(input.settings || {}) }
  };
  for (const key of DATA_CENTER_COLLECTIONS) {
    state[key] = normalizeCollection(input[key], base[key], key);
  }
  state.aiProviders = [normalizeAiProvider(state.aiProviders[0])];
  state.aiDataPolicies = normalizeAiDataPolicies(state.aiDataPolicies);
  state.sources = state.sources.map(source => ({
    captureMethod: "export",
    timeBasis: "create_time",
    timezone: "Asia/Shanghai",
    status: "disabled",
    enabled: false,
    ...source
  }));
  return state;
}

export function reduceDataCenterState(state, action = {}) {
  const current = normalizeDataCenterState(state);
  const timestamp = action.timestamp || new Date().toISOString();
  if (action.type === "upsert_source") {
    const record = { ...safeRecord(action.record), updatedAt: timestamp };
    if (!record.id) return current;
    const exists = current.sources.some(item => item.id === record.id);
    const sources = exists
      ? current.sources.map(item => item.id === record.id ? { ...item, ...record } : item)
      : [record, ...current.sources];
    return normalizeDataCenterState({
      ...current,
      sources,
      updatedAt: timestamp,
      auditLogs: [{
        id: `audit-${timestamp}-${record.id}`,
        actor: action.actor || "系统",
        action: "upsert_source",
        entityId: record.id,
        createdAt: timestamp
      }, ...current.auditLogs]
    });
  }
  if (action.type === "settings") {
    return normalizeDataCenterState({
      ...current,
      settings: { ...current.settings, ...safeRecord(action.settings) },
      updatedAt: timestamp
    });
  }
  return current;
}

export function summarizeDataCenterSales(rows = [], options = {}) {
  const factViews = buildDataCenterSalesFactViews(rows, options);
  const filtered = factViews.filteredRows;
  const totals = filtered.reduce((sum, row) => {
    for (const metric of SALES_METRICS) sum[metric] += number(row?.[metric]);
    return sum;
  }, { qty: 0, sales: 0, netSales: 0, grossProfit: 0, refund: 0, cost: 0 });

  return {
    totals: {
      ...totals,
      refundRate: totals.sales ? round(totals.refund / totals.sales * 100) : 0,
      grossMarginRate: totals.netSales ? round(totals.grossProfit / totals.netSales * 100) : 0
    },
    byDay: factViews.byDay,
    byPlatform: factViews.byPlatform,
    byProduct: groupSales(filtered, "code").sort((a, b) => b.netSales - a.netSales),
    excludedRows: factViews.excludedRows,
    rowCount: factViews.rowCount
  };
}

export function buildLegacyDataCenterMetricResults(rows = [], options = {}) {
  const summary = summarizeDataCenterSales(rows, options);
  const values = {
    "sales.net_sales": summary.totals.netSales,
    "sales.quantity": summary.totals.qty,
    "sales.gross_profit": summary.totals.grossProfit,
    "sales.refund_rate": summary.totals.refundRate,
    "sales.gross_margin_rate": summary.totals.grossMarginRate
  };
  const cutoffAt = summary.byDay.at(-1)?.date || "";
  return DATA_CENTER_OVERVIEW_METRICS.map(metric => ({
    metricCode: metric.metricCode,
    value: values[metric.metricCode],
    version: 0,
    from: options.from || "",
    to: options.to || "",
    cutoffAt,
    coverageRate: summary.rowCount ? 1 : 0,
    status: summary.rowCount ? "complete" : "incomplete",
    reasonCode: summary.rowCount ? "LEGACY_ROLLBACK" : "RESULT_NOT_AVAILABLE"
  }));
}

export function buildDataCenterSalesFactViews(rows = [], options = {}) {
  const operational = filterOperationalSales(rows);
  const filtered = operational.filter(row => (
    (!options.from || row.date >= options.from) && (!options.to || row.date <= options.to)
  ));
  const byDay = groupDailySales(filtered).sort((a, b) => a.date.localeCompare(b.date));
  return {
    byDay,
    trendByDay: completeDailySalesRange(byDay, options),
    byPlatform: groupSales(filtered, "platform").sort((a, b) => b.sales - a.sales),
    excludedRows: rows.length - operational.length,
    rowCount: filtered.length,
    filteredRows: filtered
  };
}

function median(values) {
  const ordered = values.map(number).sort((left, right) => left - right);
  if (!ordered.length) return 0;
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function detectLatestSalesAnomaly(latestDailyFacts = [], threshold = 0.25, targetBusinessDate = "") {
  const facts = latestDailyFacts
    .filter(item => /^\d{4}-\d{2}-\d{2}$/.test(String(item?.date || "")))
    .map(item => ({ date: String(item.date), sales: number(item.sales), qty: number(item.qty) }))
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-8);
  const latest = facts.at(-1);
  const targetDate = /^\d{4}-\d{2}-\d{2}$/.test(String(targetBusinessDate || "")) ? String(targetBusinessDate) : "";
  if (targetDate && (!latest || latest.date < targetDate)) {
    return {
      status: "anomaly",
      code: "SALES_TARGET_DAY_MISSING",
      date: targetDate,
      latestTrustedDate: latest?.date || "",
      baselineDays: facts.length,
      threshold
    };
  }
  if (!latest) return { status: "empty", code: "SALES_COMPLETENESS_NO_DATA", date: "", baselineDays: 0, threshold };
  const baseline = facts.slice(0, -1).slice(-7);
  if (baseline.length < 3) {
    return {
      status: "insufficient_baseline",
      code: "SALES_COMPLETENESS_BASELINE_INSUFFICIENT",
      date: latest.date,
      baselineDays: baseline.length,
      threshold
    };
  }
  const salesMedian = median(baseline.map(item => item.sales));
  const qtyMedian = median(baseline.map(item => item.qty));
  const salesRatio = salesMedian > 0 ? round(latest.sales / salesMedian, 4) : 1;
  const qtyRatio = qtyMedian > 0 ? round(latest.qty / qtyMedian, 4) : 1;
  return {
    status: salesRatio < threshold && qtyRatio < threshold ? "anomaly" : "healthy",
    code: salesRatio < threshold && qtyRatio < threshold ? "SALES_LATEST_DAY_INCOMPLETE" : "SALES_LATEST_DAY_COMPLETE",
    date: latest.date,
    sales: latest.sales,
    qty: latest.qty,
    baselineDays: baseline.length,
    salesMedian,
    qtyMedian,
    salesRatio,
    qtyRatio,
    threshold
  };
}

export function buildDataQualitySummary({ state, salesMeta, salesRows } = {}) {
  const normalized = normalizeDataCenterState(state);
  const latestRowDate = (salesRows || []).reduce((latest, row) => {
    const date = String(row?.date || "");
    return /^\d{4}-\d{2}-\d{2}$/.test(date) && date > latest ? date : latest;
  }, "");
  const latestDataDate = /^\d{4}-\d{2}-\d{2}$/.test(String(salesMeta?.latestDataDate || ""))
    ? String(salesMeta.latestDataDate)
    : latestRowDate;
  return {
    openIssues: normalized.qualityIssues.filter(item => item.status !== "resolved").length,
    unmappedProducts: normalized.mappings.filter(item => item.dimensionType === "product" && item.status !== "confirmed").length,
    excludedRows: (salesRows || []).filter(row => !isOperationalPlatform(row?.platform)).length,
    lastSuccessfulSyncAt: salesMeta?.lastSuccessfulSyncAt || salesMeta?.imports?.[0]?.importedAt || "",
    latestDataDate,
    syncAttentionCount: countLatestSyncAttention(normalized.syncRuns)
  };
}
