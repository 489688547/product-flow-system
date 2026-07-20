import { aggregateProductCatalogSales, productCatalogSalesRange } from "../../../../../../src/domain/productCatalogSales.js";

const EXCLUDED_PLATFORMS = ["", "其它", "其他", "未知", "未知平台"];

function salesRangeError(message) {
  const error = new Error(message);
  error.status = 400;
  error.code = "PRODUCT_CATALOG_SALES_RANGE_INVALID";
  error.retryable = false;
  return error;
}

export function catalogSalesQuery(url) {
  const from = String(url.searchParams.get("from") || "").trim();
  const to = String(url.searchParams.get("to") || "").trim();
  if (!from && !to) return null;
  if (!from || !to) throw salesRangeError("请同时选择销量开始和结束日期。");
  try {
    productCatalogSalesRange("custom", { from, to });
  } catch (error) {
    throw salesRangeError(error.message || "销量日期范围无效。");
  }
  const platform = String(url.searchParams.get("platform") || "").trim();
  if (platform.length > 80 || /[\u0000-\u001f]/.test(platform)) throw salesRangeError("平台筛选无效。");
  return { from, to, platform };
}

async function lastSuccessfulSalesSyncAt(db) {
  const row = await db.prepare("SELECT payload FROM product_sales_meta WHERE id = ?").bind("sales-meta").first();
  if (!row?.payload) return "";
  try {
    return JSON.parse(row.payload)?.imports?.[0]?.importedAt || "";
  } catch {
    return "";
  }
}

export async function readCatalogSales(db, items, query) {
  const excludedPlaceholders = EXCLUDED_PLATFORMS.map(() => "?").join(", ");
  const where = ["date >= ?", "date <= ?"];
  const values = [query.from, query.to];
  if (query.platform) {
    where.push("platform = ?");
    values.push(query.platform);
  } else {
    where.push(`TRIM(COALESCE(platform, '')) NOT IN (${excludedPlaceholders})`);
    values.push(...EXCLUDED_PLATFORMS);
  }
  const [salesResult, platformResult, lastSuccessfulSyncAt] = await Promise.all([
    db.prepare(`SELECT code, platform, SUM(qty) AS qty, SUM(net_sales) AS net_sales, MAX(date) AS latest_date
      FROM product_sales_daily
      WHERE ${where.join(" AND ")}
      GROUP BY code, platform`).bind(...values).all(),
    db.prepare(`SELECT DISTINCT platform
      FROM product_sales_daily
      WHERE date >= ? AND date <= ?
        AND TRIM(COALESCE(platform, '')) NOT IN (${excludedPlaceholders})
      ORDER BY platform`).bind(query.from, query.to, ...EXCLUDED_PLATFORMS).all(),
    lastSuccessfulSalesSyncAt(db)
  ]);
  const rows = (salesResult?.results || []).map(row => ({
    code: row.code,
    platform: row.platform,
    qty: Number(row.qty) || 0,
    netSales: Number(row.net_sales) || 0,
    latestDataDate: String(row.latest_date || "")
  }));
  const aggregated = aggregateProductCatalogSales(items, rows);
  return {
    items: aggregated.items,
    meta: {
      ...aggregated.meta,
      from: query.from,
      to: query.to,
      platform: query.platform,
      availablePlatforms: (platformResult?.results || []).map(row => String(row.platform || "").trim()).filter(Boolean),
      timeBasis: "create_time",
      timezone: "Asia/Shanghai",
      excludeOther: !query.platform,
      latestDataDate: rows.reduce((latest, row) => row.latestDataDate > latest ? row.latestDataDate : latest, ""),
      lastSuccessfulSyncAt
    }
  };
}
