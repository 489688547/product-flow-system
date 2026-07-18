import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import { ensureSalesTables, salesDatabase } from "../sales.js";

const VIEW_DEPARTMENTS = new Set(["总经办", "运营部", "财务部", "产品部", "供应链部", "供应链", "供应链团队", "采购部"]);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 370;

function department(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

function errorResponse(message, status, code, retryable = false) {
  const requestId = globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
  return jsonResponse({ synced: false, message, error: { code, message, requestId, retryable } }, status);
}

function validDate(value) {
  return DATE_PATTERN.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00+08:00`));
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

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  if (!data.session) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
  if (!VIEW_DEPARTMENTS.has(department(data.session))) return errorResponse("当前部门无权读取销售数据。", 403, "PERMISSION_VIEW_DENIED");

  const url = new URL(request.url);
  const from = String(url.searchParams.get("from") || "");
  const to = String(url.searchParams.get("to") || "");
  const fromTime = Date.parse(`${from}T00:00:00+08:00`);
  const toTime = Date.parse(`${to}T00:00:00+08:00`);
  if (!validDate(from) || !validDate(to) || fromTime > toTime || (toTime - fromTime) / 86400000 > MAX_RANGE_DAYS) {
    return errorResponse("日期范围无效，最多查询 370 天。", 400, "DATA_DATE_RANGE_INVALID");
  }
  const db = salesDatabase(env);
  if (!db) return errorResponse("缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，销售数据暂不可用。", 501, "DATA_STORAGE_UNAVAILABLE");

  try {
    await ensureSalesTables(db);
    const result = await db.prepare(`SELECT code, date, platform, qty, sales, net_sales, gross_profit, refund, cost, pre_ship_refund, post_ship_refund
      FROM product_sales_daily
      WHERE date >= ? AND date <= ?
        AND TRIM(COALESCE(platform, '')) NOT IN ('', '其它', '其他', '未知', '未知平台')
      ORDER BY date, platform, code`).bind(from, to).all();
    const rows = (result?.results || []).map(mapRow);
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
        lastSuccessfulSyncAt: await lastSuccessfulSyncAt(db)
      }
    });
  } catch (error) {
    return errorResponse(error.message || "销售数据读取失败。", error.status || 500, "INTERNAL_UNEXPECTED", true);
  }
}
