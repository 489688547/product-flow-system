import { jsonResponse, optionsResponse } from "../../../../dingtalk/_shared/dingtalk.js";
import { requestBusinessDatabase } from "../../../_shared/dataEnvironment.js";

const VIEW_DEPARTMENTS = new Set([
  "总经办", "运营部", "财务部", "财务", "产品部", "供应链部", "供应链",
  "供应链团队", "采购部", "质量管理部", "仓库", "仓储部", "数据中心", "数据部"
]);
const EXCLUDED_PLATFORMS = ["", "其它", "其他", "未知", "未知平台"];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 500;

function departments(session = {}) {
  return [...new Set([
    session.department,
    session.departmentName,
    ...(Array.isArray(session.departments) ? session.departments : []),
    ...(Array.isArray(session.departmentNames) ? session.departmentNames : [])
  ].flatMap(value => String(value || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/)).map(value => value.trim()).filter(Boolean))];
}

function canView(session = {}) {
  if (session.role === "executive") return true;
  return departments(session).some(value => VIEW_DEPARTMENTS.has(value));
}

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `sales-daily-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function errorResponse(message, status, code, retryable = false) {
  const id = requestId();
  return jsonResponse({
    synced: false,
    message,
    error: { code, message, requestId: id, retryable }
  }, status);
}

function validDate(value) {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function validRange(from, to) {
  if (!validDate(from) || !validDate(to) || from > to) return false;
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= 370;
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function uniqueMapping(target, code, value) {
  if (!code || !value) return;
  if (!target.has(code)) target.set(code, value);
  else if (target.get(code) !== value) target.set(code, null);
}

async function inventoryUnitMappings(db) {
  const [skus, manual] = await Promise.all([
    db.prepare(`SELECT id, item_id, merchant_sku_code, barcode
      FROM product_catalog_skus WHERE active = 1`).all(),
    db.prepare(`SELECT code, product_id
      FROM product_catalog_sales_mappings WHERE active = 1`).all()
  ]);
  const byCode = new Map();
  const byInventoryUnitId = new Map();
  const codesByProduct = new Map();
  for (const row of skus?.results || []) {
    const item = {
      productId: String(row.item_id || "") || null,
      inventoryUnitId: String(row.id || "") || null
    };
    byInventoryUnitId.set(item.inventoryUnitId, item);
    uniqueMapping(byCode, String(row.barcode || "").trim(), item);
    uniqueMapping(byCode, String(row.merchant_sku_code || "").trim(), item);
    if (item.productId) {
      const codes = codesByProduct.get(item.productId) || new Set();
      if (row.barcode) codes.add(String(row.barcode).trim());
      if (row.merchant_sku_code) codes.add(String(row.merchant_sku_code).trim());
      codesByProduct.set(item.productId, codes);
    }
  }
  for (const row of manual?.results || []) {
    const code = String(row.code || "").trim();
    const productId = String(row.product_id || "").trim();
    if (!code || !productId) continue;
    const current = byCode.get(code);
    byCode.set(code, {
      productId,
      inventoryUnitId: current?.productId === productId ? current.inventoryUnitId : null
    });
    const codes = codesByProduct.get(productId) || new Set();
    codes.add(code);
    codesByProduct.set(productId, codes);
  }
  return { byCode, byInventoryUnitId, codesByProduct };
}

async function lastSuccessfulSyncAt(db) {
  const row = await db.prepare("SELECT payload FROM product_sales_meta WHERE id = ?").bind("sales-meta").first();
  try {
    return JSON.parse(row?.payload || "{}")?.imports?.[0]?.importedAt || null;
  } catch {
    return null;
  }
}

function salesFact(row, mapping) {
  return {
    date: String(row.date || ""),
    productId: mapping?.productId || null,
    inventoryUnitId: mapping?.inventoryUnitId || null,
    inventoryUnitCode: String(row.code || ""),
    platform: String(row.platform || ""),
    grossQuantity: amount(row.qty),
    returnQuantity: null,
    netQuantity: null,
    grossSales: amount(row.sales),
    netSales: amount(row.net_sales),
    salesCost: amount(row.cost),
    refundAmount: amount(row.refund),
    promotionIds: []
  };
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return errorResponse("Method not allowed", 405, "VALIDATION_METHOD_NOT_ALLOWED");
  if (!data.session) return errorResponse("请先使用钉钉登录。", 401, "AUTH_SESSION_REQUIRED");
  if (!canView(data.session)) return errorResponse("当前部门无权读取销售日需求。", 403, "PERMISSION_VIEW_DENIED");

  const url = new URL(request.url);
  const from = String(url.searchParams.get("from") || "");
  const to = String(url.searchParams.get("to") || "");
  const platform = String(url.searchParams.get("platform") || "").trim();
  const productId = String(url.searchParams.get("productId") || "").trim();
  const inventoryUnitId = String(url.searchParams.get("inventoryUnitId") || "").trim();
  const cursor = String(url.searchParams.get("cursor") || "").trim();
  const offset = cursor ? Number(cursor) : 0;
  if (
    !validRange(from, to)
    || [platform, productId, inventoryUnitId].some(value => value.length > 160)
    || !Number.isInteger(offset)
    || offset < 0
  ) {
    return errorResponse("日期范围或筛选参数无效。", 400, "DATA_SERVICE_DATE_RANGE_INVALID");
  }
  const db = requestBusinessDatabase({ env, data });
  if (!db) return errorResponse("销售业务数据库暂不可用。", 501, "DATA_STORAGE_UNAVAILABLE");

  try {
    const mappings = await inventoryUnitMappings(db);
    let allowedCodes = null;
    if (inventoryUnitId) {
      allowedCodes = new Set([...mappings.byCode.entries()]
        .filter(([, mapping]) => mapping?.inventoryUnitId === inventoryUnitId)
        .map(([code]) => code));
    } else if (productId) {
      allowedCodes = mappings.codesByProduct.get(productId) || new Set();
    }
    const conditions = [
      "date >= ?",
      "date <= ?",
      "TRIM(COALESCE(platform, '')) NOT IN ('', '其它', '其他', '未知', '未知平台')"
    ];
    const bindings = [from, to];
    if (platform) {
      conditions.push("platform = ?");
      bindings.push(platform);
    }
    if (allowedCodes) {
      if (!allowedCodes.size) {
        return jsonResponse({
          synced: true,
          contract: {
            timeBasis: "create_time",
            timezone: "Asia/Shanghai",
            excludeOther: true,
            grain: ["date", "inventoryUnitId", "platform"]
          },
          items: [],
          quality: {
            status: "partial",
            lastSuccessfulSyncAt: await lastSuccessfulSyncAt(db),
            coverage: 0,
            confidence: "insufficient",
            missing: ["productMapping", "returnQuantity", "promotionIds"]
          },
          page: { nextCursor: null },
          meta: { query: { from, to, productId: productId || null, inventoryUnitId: inventoryUnitId || null, platform: platform || null } }
        });
      }
      conditions.push(`code IN (${[...allowedCodes].map(() => "?").join(", ")})`);
      bindings.push(...allowedCodes);
    }
    const result = await db.prepare(`SELECT code, date, platform, qty, sales, net_sales, refund, cost
      FROM product_sales_daily
      WHERE ${conditions.join(" AND ")}
      ORDER BY date, code, platform
      LIMIT ${PAGE_SIZE + 1} OFFSET ${offset}`).bind(...bindings).all();
    const sourceRows = (result?.results || []).filter(row => (
      !allowedCodes || allowedCodes.has(String(row.code || "").trim())
    ));
    const hasNext = sourceRows.length > PAGE_SIZE;
    const pageRows = hasNext ? sourceRows.slice(0, PAGE_SIZE) : sourceRows;
    const items = pageRows.map(row => salesFact(row, mappings.byCode.get(String(row.code || "").trim())));
    const mapped = items.filter(item => item.productId && item.inventoryUnitId).length;
    const mappingCoverage = items.length ? mapped / items.length : 0;
    const missing = ["returnQuantity", "promotionIds"];
    if (mappingCoverage < 1) missing.push("productMapping");
    return jsonResponse({
      synced: true,
      contract: {
        timeBasis: "create_time",
        timezone: "Asia/Shanghai",
        excludeOther: true,
        grain: ["date", "inventoryUnitId", "platform"]
      },
      items,
      quality: {
        status: items.length && mappingCoverage === 1 ? "partial" : items.length ? "partial" : "unavailable",
        lastSuccessfulSyncAt: await lastSuccessfulSyncAt(db),
        coverage: mappingCoverage,
        confidence: mappingCoverage === 1 ? "partial" : mappingCoverage ? "partial" : "insufficient",
        missing
      },
      page: { nextCursor: hasNext ? String(offset + PAGE_SIZE) : null },
      meta: {
        query: {
          from,
          to,
          productId: productId || null,
          inventoryUnitId: inventoryUnitId || null,
          platform: platform || null
        }
      }
    });
  } catch {
    return errorResponse("销售日需求读取失败。", 500, "DATA_SERVICE_QUERY_FAILED", true);
  }
}
