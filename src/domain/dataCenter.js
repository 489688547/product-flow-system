export const DATA_CENTER_COLLECTIONS = [
  "sources",
  "runners",
  "syncRuns",
  "sourceFiles",
  "mappings",
  "metricDefinitions",
  "qualityIssues",
  "subscriptions",
  "auditLogs"
];

export const DATA_CENTER_STATUS = [
  "healthy",
  "running",
  "stale",
  "login_required",
  "schema_changed",
  "failed",
  "disabled"
];

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
  auditLogs: 500
};
const EXCLUDED_PLATFORMS = new Set(["", "其它", "其他", "未知", "未知平台"]);
const SALES_METRICS = ["qty", "sales", "netSales", "grossProfit", "refund", "cost"];

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

export function defaultDataCenterRange(today = new Date()) {
  const to = previousDay(shanghaiDate(today));
  return { from: `${to.slice(0, 7)}-01`, to };
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
        version: 1
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
        version: 1
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
  const operational = filterOperationalSales(rows);
  const filtered = operational.filter(row => (
    (!options.from || row.date >= options.from) && (!options.to || row.date <= options.to)
  ));
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
    byDay: groupSales(filtered, "date").sort((a, b) => a.date.localeCompare(b.date)),
    byPlatform: groupSales(filtered, "platform").sort((a, b) => b.netSales - a.netSales),
    byProduct: groupSales(filtered, "code").sort((a, b) => b.netSales - a.netSales),
    excludedRows: rows.length - operational.length,
    rowCount: filtered.length
  };
}

export function buildDataQualitySummary({ state, salesMeta, salesRows } = {}) {
  const normalized = normalizeDataCenterState(state);
  return {
    openIssues: normalized.qualityIssues.filter(item => item.status !== "resolved").length,
    unmappedProducts: normalized.mappings.filter(item => item.dimensionType === "product" && item.status !== "confirmed").length,
    excludedRows: (salesRows || []).filter(row => !isOperationalPlatform(row?.platform)).length,
    lastSuccessfulSyncAt: salesMeta?.lastSuccessfulSyncAt || salesMeta?.imports?.[0]?.importedAt || ""
  };
}
