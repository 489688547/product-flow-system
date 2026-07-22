import { jsonResponse, optionsResponse } from "../../../dingtalk/_shared/dingtalk.js";
import { ensureSalesTables, salesDatabase } from "../../../sales.js";

const VIEW_DEPARTMENTS = new Set(["总经办", "运营部", "财务部", "产品部", "供应链部", "供应链", "供应链团队", "采购部"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 3660;
const EXCLUDED_PLATFORMS_SQL = "'', '其它', '其他', '未知', '未知平台'";

function department(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

function canView(session = {}) {
  if (session.role === "executive") return true;
  return department(session).split("/").map(value => value.trim()).some(value => VIEW_DEPARTMENTS.has(value));
}

function errorResponse(message, status, code, retryable = false) {
  const requestId = globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({ synced: false, message, error: { code, message, requestId, retryable } }, status);
}

function validDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function validRange(from, to) {
  if (!validDate(from) || !validDate(to) || from > to) return false;
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= MAX_RANGE_DAYS;
}

async function lastSuccessfulSyncAt(db) {
  const row = await db.prepare("SELECT payload FROM product_sales_meta WHERE id = ?").bind("sales-meta").first();
  try {
    return JSON.parse(row?.payload || "{}")?.imports?.[0]?.importedAt || "";
  } catch {
    return "";
  }
}

async function availability(db) {
  const [coverage, months] = await Promise.all([
    db.prepare(`SELECT MIN(date) AS earliest_date, MAX(date) AS latest_date, COUNT(*) AS total_rows
      FROM product_sales_daily
      WHERE TRIM(COALESCE(platform, '')) NOT IN (${EXCLUDED_PLATFORMS_SQL})`).first(),
    db.prepare(`SELECT substr(date, 1, 7) AS month, COUNT(*) AS row_count
      FROM product_sales_daily
      WHERE TRIM(COALESCE(platform, '')) NOT IN (${EXCLUDED_PLATFORMS_SQL})
      GROUP BY substr(date, 1, 7)
      ORDER BY month DESC`).all()
  ]);
  return {
    earliestDate: coverage?.earliest_date || "",
    latestDate: coverage?.latest_date || "",
    totalRows: Number(coverage?.total_rows) || 0,
    availableMonths: (months?.results || []).map(row => ({ month: row.month, rowCount: Number(row.row_count) || 0 }))
  };
}

async function summary(db, from, to) {
  const row = await db.prepare(`SELECT COUNT(*) AS row_count, COALESCE(SUM(qty), 0) AS quantity,
      COALESCE(SUM(net_sales), 0) AS net_sales, COUNT(DISTINCT platform) AS platform_count,
      MIN(date) AS earliest_date, MAX(date) AS latest_date
    FROM product_sales_daily
    WHERE date >= ? AND date <= ?
      AND TRIM(COALESCE(platform, '')) NOT IN (${EXCLUDED_PLATFORMS_SQL})`).bind(from, to).first();
  return {
    rowCount: Number(row?.row_count) || 0,
    quantity: Number(row?.quantity) || 0,
    netSales: Number(row?.net_sales) || 0,
    platformCount: Number(row?.platform_count) || 0,
    earliestDate: row?.earliest_date || "",
    latestDate: row?.latest_date || ""
  };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  if (!data.session) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
  if (!canView(data.session)) return errorResponse("当前部门无权读取销售数据服务。", 403, "PERMISSION_VIEW_DENIED");

  const url = new URL(request.url);
  const from = String(url.searchParams.get("from") || "");
  const to = String(url.searchParams.get("to") || "");
  const hasRange = Boolean(from || to);
  if (hasRange && !validRange(from, to)) return errorResponse("日期范围无效，请完整选择开始和截止日期。", 400, "DATA_SERVICE_DATE_RANGE_INVALID");

  const db = salesDatabase(env);
  if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，销售数据服务暂不可用。", 501, "DATA_STORAGE_UNAVAILABLE");
  try {
    await ensureSalesTables(db);
    const contract = { dataset: "sales.daily", timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true };
    if (hasRange) return jsonResponse({ synced: true, contract, query: { from, to }, summary: await summary(db, from, to) });
    return jsonResponse({ synced: true, contract, availability: await availability(db), lastSuccessfulSyncAt: await lastSuccessfulSyncAt(db) });
  } catch (error) {
    return errorResponse(error.message || "销售数据服务读取失败。", 500, "DATA_SERVICE_QUERY_FAILED", true);
  }
}
