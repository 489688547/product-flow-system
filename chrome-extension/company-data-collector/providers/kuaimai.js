export const KUAIMAI_ALLOWED_ORIGINS = Object.freeze([
  "https://erp.superboss.cc",
  "https://erpb.superboss.cc"
]);

export const KUAIMAI_ORDER_ROUTE = "/index.html#/trade/searchlist/";

export const KUAIMAI_DOWNLOAD_CENTER_ROUTE = "/index.html#/index/download_center/";

export const KUAIMAI_DOWNLOAD_CENTER_SELECTORS = Object.freeze({
  row: ".m-data-item",
  exportTime: ".exportTime",
  content: ".content",
  status: ".schedule",
  refresh: ".j-search",
  download: ".J-download"
});

export const KUAIMAI_SELECTORS = Object.freeze({
  timeContainer: ".order-time-search-vue-container",
  timeBasis: ".order-time-search-vue-container .common-query-widget-type input[placeholder='请选择']",
  startTime: ".order-time-search-vue-container input[placeholder='起始时间']",
  endTime: ".order-time-search-vue-container input[placeholder='结束时间']",
  selectOption: ".el-select-dropdown__item",
  queryButton: "button.btn.btn-primary[type='submit']",
  exportLink: ".J_Click.toolbar-menu_item",
  exportConfirmButton: ".modal-dialog button, .el-dialog button"
});

export function matchesKuaimaiControlText(text, label) {
  const normalized = String(text || "").replace(/\s+/g, " ").trim();
  const expected = String(label || "").trim();
  if (!expected || !normalized.endsWith(expected)) return false;
  if (expected === "导出订单" && normalized.endsWith("导出订单明细")) return false;
  return true;
}

function parseKuaimaiExportTime(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return Number.NaN;
  const [, year, month, day, hour, minute, second] = match;
  return Date.parse(`${year}-${month}-${day}T${hour}:${minute}:${second}+08:00`);
}

function matchesKuaimaiExportResource(resourceType, value) {
  const content = String(value || "").trim();
  if (resourceType === "order_items") {
    return content.startsWith("快麦ERP交易订单明细导出");
  }
  if (resourceType === "orders") {
    return content.startsWith("快麦ERP交易订单导出")
      && !content.startsWith("快麦ERP交易订单明细导出");
  }
  return false;
}

export function selectKuaimaiDownloadRow({ resourceType, startedAt, rows = [] } = {}) {
  const taskStartedAt = Number(startedAt);
  if (!Number.isFinite(taskStartedAt)) return { state: "missing", rowIndex: null };

  const matchingRows = rows
    .map((row, rowIndex) => ({
      row,
      rowIndex,
      exportedAt: parseKuaimaiExportTime(row?.exportTime)
    }))
    .filter(candidate =>
      Number.isFinite(candidate.exportedAt)
      && candidate.exportedAt >= taskStartedAt - 1_000
      && matchesKuaimaiExportResource(resourceType, candidate.row?.content)
    )
    .sort((left, right) => right.exportedAt - left.exportedAt);

  const selected = matchingRows[0];
  if (!selected) return { state: "missing", rowIndex: null };

  const status = String(selected.row?.status || "").replace(/\s+/g, "");
  if (status.includes("失败")) {
    return {
      state: "failed",
      rowIndex: selected.rowIndex,
      errorCode: "KUAIMAI_EXPORT_GENERATION_FAILED"
    };
  }
  if (status.includes("导出完成")) {
    return { state: "ready", rowIndex: selected.rowIndex };
  }
  return { state: "pending", rowIndex: selected.rowIndex };
}

const REQUIRED_READY_MARKERS = Object.freeze([
  "timeBasis",
  "startTime",
  "endTime",
  "queryButton",
  "exportOrders",
  "exportOrderItems"
]);

function validOrigin(url) {
  try {
    return KUAIMAI_ALLOWED_ORIGINS.includes(new URL(url).origin);
  } catch {
    return false;
  }
}

export function classifyKuaimaiPage({ url = "", markers = {} } = {}) {
  if (!validOrigin(url)) return { state: "blocked_origin", errorCode: "KUAIMAI_ORIGIN_BLOCKED" };
  if (markers.humanVerification) return { state: "waiting_human", errorCode: "KUAIMAI_HUMAN_VERIFICATION_REQUIRED" };
  if (markers.loginPage || /\/login(?:[/?#]|$)/i.test(url)) {
    return { state: "waiting_login", errorCode: "KUAIMAI_LOGIN_REQUIRED" };
  }
  if (REQUIRED_READY_MARKERS.every(marker => markers[marker] === true)) return { state: "ready" };
  return { state: "schema_changed", errorCode: "KUAIMAI_ORDER_PAGE_SCHEMA_CHANGED" };
}

function assertBusinessDate(value) {
  const businessDate = String(value || "");
  const match = businessDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    const error = new Error("业务日期格式无效。");
    error.code = "EXTENSION_TASK_BUSINESS_DATE_INVALID";
    throw error;
  }
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (
    parsed.getUTCFullYear() !== Number(year)
    || parsed.getUTCMonth() !== Number(month) - 1
    || parsed.getUTCDate() !== Number(day)
  ) {
    const error = new Error("业务日期不存在。");
    error.code = "EXTENSION_TASK_BUSINESS_DATE_INVALID";
    throw error;
  }
  return businessDate;
}

export function buildKuaimaiActionPlan(task) {
  const businessDate = assertBusinessDate(task?.businessDate);
  const exportAction = task?.resourceType === "orders"
    ? "export_orders"
    : task?.resourceType === "order_items"
      ? "export_order_items"
      : null;
  if (!exportAction) {
    const error = new Error("快麦资源尚未登记。");
    error.code = "EXTENSION_TASK_NOT_REGISTERED";
    throw error;
  }
  return [
    { action: "select_time_basis", value: "下单时间" },
    { action: "set_start_time", value: `${businessDate} 00:00:00` },
    { action: "set_end_time", value: `${businessDate} 23:59:59` },
    {
      action: "verify_time_range",
      startValue: `${businessDate} 00:00:00`,
      endValue: `${businessDate} 23:59:59`
    },
    { action: "submit_query" },
    { action: "wait_for_results" },
    { action: exportAction },
    { action: "confirm_export" },
    { action: "download_from_center", resourceType: task.resourceType }
  ];
}

export const kuaimaiResources = Object.freeze({
  orders: Object.freeze({
    providerId: "kuaimai",
    resourceType: "orders",
    origin: "https://erpb.superboss.cc",
    route: KUAIMAI_ORDER_ROUTE,
    rangeKind: "daily_fact",
    scheduleVersion: "v1",
    downloadExtensions: [".xlsx", ".xls", ".csv"],
    downloadFilePrefixes: ["快麦ERP交易订单导出"]
  }),
  order_items: Object.freeze({
    providerId: "kuaimai",
    resourceType: "order_items",
    origin: "https://erpb.superboss.cc",
    route: KUAIMAI_ORDER_ROUTE,
    rangeKind: "daily_fact",
    scheduleVersion: "v1",
    downloadExtensions: [".xlsx", ".xls", ".csv"],
    downloadFilePrefixes: ["快麦ERP交易订单明细导出"]
  })
});
