import { detectLatestSalesAnomaly } from "../../../../../../src/domain/dataCenter.js";

export const SALES_REPAIR_RULE_VERSION = "sales-completeness-v1";
export const SALES_REPAIR_ENTITY_TYPE = "systemSyncRuns";
export const SALES_REPAIR_RESOLUTION_OFFICIAL_IMPORT = "official_import_recheck";

const REPAIR_RUN_ID_PREFIX = "kuaimai-sales-repair:";
const OPEN_REPAIR_STATUSES = new Set(["manual_required", "failed"]);

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function repairRunId(date) {
  return `${REPAIR_RUN_ID_PREFIX}${date}:${SALES_REPAIR_RULE_VERSION}`;
}

export async function readSalesRepairRun(db, date) {
  const row = await db.prepare("SELECT payload FROM data_sync_runs WHERE entity_type = ? AND id = ?")
    .bind(SALES_REPAIR_ENTITY_TYPE, repairRunId(date)).first();
  try {
    return row?.payload ? JSON.parse(row.payload) : null;
  } catch {
    return null;
  }
}

export async function writeSalesRepairRun(db, run) {
  const timestamp = run.updatedAt || new Date().toISOString();
  await db.prepare(`INSERT INTO data_sync_runs (entity_type, id, payload, updated_at, updated_by)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(entity_type, id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(SALES_REPAIR_ENTITY_TYPE, run.id, JSON.stringify(run), timestamp, run.requestedBy || "系统自动修复").run();
  return run;
}

function normalizeResolutionDates(dates) {
  return [...new Set((Array.isArray(dates) ? dates : [])
    .map(value => String(value || "").trim())
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort();
}

async function readOpenRepairRuns(db, dates) {
  const wanted = new Set(dates);
  const result = await db.prepare(`SELECT id, payload FROM data_sync_runs
    WHERE entity_type = ? AND id LIKE 'kuaimai-sales-repair:%'`).bind(SALES_REPAIR_ENTITY_TYPE).all();
  const runs = [];
  for (const row of result?.results || []) {
    try {
      const run = JSON.parse(row.payload || "{}");
      if (!String(run.id || row.id || "").startsWith(REPAIR_RUN_ID_PREFIX)) continue;
      if (!OPEN_REPAIR_STATUSES.has(String(run.status || ""))) continue;
      if (!wanted.has(String(run.date || ""))) continue;
      runs.push(run);
    } catch {
      // 跳过无法解析的历史记录，其余记录照常复核。
    }
  }
  return runs.sort((left, right) => String(left.date).localeCompare(String(right.date)));
}

async function readDailyFactsUntil(db, date) {
  const result = await db.prepare(`SELECT date, COALESCE(SUM(sales), 0) AS sales, COALESCE(SUM(qty), 0) AS qty
    FROM product_sales_daily
    WHERE date <= ? AND TRIM(COALESCE(platform, '')) NOT IN ('', '其它', '其他', '未知', '未知平台')
    GROUP BY date ORDER BY date DESC LIMIT 8`).bind(date).all();
  return (result?.results || []).map(row => ({ date: String(row.date || ""), sales: amount(row.sales), qty: amount(row.qty) })).reverse();
}

export async function resolveRepairedSalesDays(db, { dates = [], resolvedBy = "" } = {}) {
  const normalizedDates = normalizeResolutionDates(dates);
  if (!db || !normalizedDates.length) return { resolved: [], stillOpen: [] };
  const openRuns = await readOpenRepairRuns(db, normalizedDates);
  const resolved = [];
  const stillOpen = [];
  for (const run of openRuns) {
    const verdict = detectLatestSalesAnomaly(await readDailyFactsUntil(db, run.date));
    if (verdict.status === "healthy" && verdict.date === run.date) {
      const completedAt = new Date().toISOString();
      const closed = await writeSalesRepairRun(db, {
        ...run,
        status: "success",
        message: "官方文件导入后复核通过，自动结案。",
        errorCode: "",
        after: verdict,
        resolution: SALES_REPAIR_RESOLUTION_OFFICIAL_IMPORT,
        ...(resolvedBy ? { resolvedBy: String(resolvedBy).slice(0, 80) } : {}),
        completedAt,
        updatedAt: completedAt
      });
      resolved.push({ id: closed.id, date: closed.date });
    } else {
      stillOpen.push({
        id: run.id,
        date: run.date,
        status: run.status,
        check: { status: verdict.status, code: verdict.code || "" }
      });
    }
  }
  return { resolved, stillOpen };
}
