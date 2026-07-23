import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import { ensureSalesTables, salesDatabase } from "../sales.js";
import { normalizeDataCenterStorageError } from "./_shared/errors.js";

const VIEW_DEPARTMENTS = new Set(["总经办", "运营部", "财务部", "产品部", "供应链部", "供应链", "供应链团队", "采购部"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 370;

function department(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

function isExecutive(session = {}) {
  return session.role === "executive" || department(session).split("/").map(value => value.trim()).includes("总经办");
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

function mapRow(row) {
  return {
    code: row.code,
    date: row.date,
    platform: row.platform,
    qty: Number(row.qty) || 0,
    sales: Number(row.sales) || 0,
    netSales: Number(row.net_sales) || 0,
    grossProfit: Number(row.gross_profit) || 0,
    refund: Number(row.refund) || 0,
    cost: Number(row.cost) || 0,
    preShipRefund: Number(row.pre_ship_refund) || 0,
    postShipRefund: Number(row.post_ship_refund) || 0
  };
}

async function lastSuccessfulSyncAt(db) {
  const row = await db.prepare("SELECT payload FROM product_sales_meta WHERE id = ?").bind("sales-meta").first();
  if (!row?.payload) return "";
  try {
    return JSON.parse(row.payload)?.imports?.[0]?.importedAt || "";
  } catch {
    return "";
  }
}

async function latestDataDate(db) {
  const row = await db.prepare("SELECT MAX(date) AS latest_data_date FROM product_sales_daily").first();
  return String(row?.latest_data_date || "");
}

async function latestDailyFacts(db) {
  const result = await db.prepare(`SELECT date, COALESCE(SUM(sales), 0) AS sales, COALESCE(SUM(qty), 0) AS qty
    FROM product_sales_daily
    WHERE TRIM(COALESCE(platform, '')) NOT IN ('', '其它', '其他', '未知', '未知平台')
    GROUP BY date
    ORDER BY date DESC
    LIMIT 8`).all();
  return (result?.results || []).map(row => ({
    date: String(row.date || ""),
    sales: Number(row.sales) || 0,
    qty: Number(row.qty) || 0
  })).reverse();
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  if (!data.session) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
  if (!isExecutive(data.session) && !VIEW_DEPARTMENTS.has(department(data.session))) return errorResponse("当前部门无权读取销售数据。", 403, "PERMISSION_VIEW_DENIED");

  const url = new URL(request.url);
  const from = String(url.searchParams.get("from") || "");
  const to = String(url.searchParams.get("to") || "");
  const fromTime = Date.parse(`${from}T00:00:00+08:00`);
  const toTime = Date.parse(`${to}T00:00:00+08:00`);
  if (!validDate(from) || !validDate(to) || fromTime > toTime || (toTime - fromTime) / 86400000 > MAX_RANGE_DAYS) {
    return errorResponse("日期范围无效，最多查询 370 天。", 400, "DATA_DATE_RANGE_INVALID");
  }
  const db = salesDatabase(env, data);
  if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，销售数据暂不可用。", 501, "DATA_STORAGE_UNAVAILABLE");

  try {
    await ensureSalesTables(db);
    const result = await db.prepare(`SELECT code, date, platform, qty, sales, net_sales, gross_profit, refund, cost, pre_ship_refund, post_ship_refund
      FROM product_sales_daily
      WHERE date >= ? AND date <= ?
        AND TRIM(COALESCE(platform, '')) NOT IN ('', '其它', '其他', '未知', '未知平台')
      ORDER BY date, platform, code`).bind(from, to).all();
    const rows = (result?.results || []).map(mapRow);
    const [lastSyncAt, latestDate, dailyFacts] = await Promise.all([
      lastSuccessfulSyncAt(db),
      latestDataDate(db),
      latestDailyFacts(db)
    ]);
    return jsonResponse({
      synced: true,
      rows,
      meta: {
        from,
        to,
        rowCount: rows.length,
        timeBasis: "create_time",
        timezone: "Asia/Shanghai",
        excludeOther: true,
        lastSuccessfulSyncAt: lastSyncAt,
        latestDataDate: latestDate,
        latestDailyFacts: dailyFacts
      }
    });
  } catch (error) {
    const normalized = normalizeDataCenterStorageError(error, "销售数据读取失败。");
    return errorResponse(normalized.message, normalized.status, normalized.code, normalized.retryable);
  }
}
