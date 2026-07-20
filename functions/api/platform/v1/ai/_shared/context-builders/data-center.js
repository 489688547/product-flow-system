import { readDataCenterState } from "../../../../../data-center/_shared/storage.js";

function select(record = {}, keys = []) {
  return Object.fromEntries(keys.filter(key => record[key] !== undefined).map(key => [key, record[key]]));
}

export async function buildDataQualityContext(db) {
  const stored = await readDataCenterState(db);
  return {
    records: {
      qualityIssues: stored.state.qualityIssues.slice(0, 80)
        .map(item => select(item, ["id", "title", "status", "severity", "sourceId", "createdAt", "updatedAt"])),
      syncRuns: stored.state.syncRuns.slice(0, 40)
        .map(item => select(item, ["id", "sourceId", "status", "rangeFrom", "rangeTo", "rowCount", "startedAt", "completedAt"]))
    },
    updatedAt: stored.updatedAt || ""
  };
}

export async function buildSalesOperationsContext(db) {
  const result = await db.prepare(`SELECT date, platform, SUM(qty) AS qty, SUM(sales) AS sales
    FROM product_sales_daily
    WHERE date >= date('now', '-31 day')
      AND TRIM(COALESCE(platform, '')) NOT IN ('', '其它', '其他', '未知', '未知平台')
    GROUP BY date, platform
    ORDER BY date DESC, sales DESC
    LIMIT 300`).all();
  const records = result?.results || [];
  return { records, updatedAt: records[0]?.date || "" };
}
