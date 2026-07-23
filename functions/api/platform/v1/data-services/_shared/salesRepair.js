import { detectLatestSalesAnomaly } from "../../../../../../src/domain/dataCenter.js";
import { scaleSalesFact } from "../../../../../../src/domain/demoSalesTransform.js";
import { ensureDataCenterTables } from "../../../../data-center/_shared/storage.js";
import { pullKuaimaiDay, resolveKuaimaiConfig } from "../../../../kuaimai/_shared/kuaimai.js";
import { ensureSalesTables } from "../../../../sales.js";

export const SALES_REPAIR_RULE_VERSION = "sales-completeness-v1";
export const SALES_REPAIR_ENTITY_TYPE = "systemSyncRuns";

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function repairRunId(date) {
  return `kuaimai-sales-repair:${date}:${SALES_REPAIR_RULE_VERSION}`;
}

export function summarizeRepairRows(rows = []) {
  return rows.reduce((summary, row) => ({
    sales: summary.sales + amount(row?.sales),
    qty: summary.qty + amount(row?.qty),
    rowCount: summary.rowCount + 1
  }), { sales: 0, qty: 0, rowCount: 0 });
}

export function evaluateSalesRepairCandidate({ latestDailyFacts = [], currentRows = [], pulledRows = [], complete = false } = {}) {
  if (!complete) {
    return { action: "failed", code: "SALES_REPAIR_PAGINATION_INCOMPLETE", message: "快麦分页未完整结束，已保留原数据。" };
  }
  const richFacts = currentRows.some(row => amount(row?.refund) !== 0 || amount(row?.preShipRefund ?? row?.pre_ship_refund) !== 0 || amount(row?.postShipRefund ?? row?.post_ship_refund) !== 0);
  if (richFacts) {
    return {
      action: "manual_required",
      code: "SALES_REPAIR_RICH_FACTS_PROTECTED",
      message: "当天已有退款明细，不能用快麦订单 API 覆盖，请重新导入官方文件。"
    };
  }
  const summary = summarizeRepairRows(pulledRows);
  const latestDate = String(latestDailyFacts.at(-1)?.date || pulledRows.at(-1)?.date || "");
  const candidateFacts = latestDailyFacts
    .filter(item => item.date !== latestDate)
    .concat({ date: latestDate, sales: summary.sales, qty: summary.qty });
  const after = detectLatestSalesAnomaly(candidateFacts);
  if (after.status !== "healthy") {
    return { action: "failed", code: "SALES_REPAIR_STILL_INCOMPLETE", message: "重新拉取后数据仍明显低于基准，已保留原数据。", after, summary };
  }
  return { action: "replace", code: "SALES_REPAIR_READY", message: "完整补拉已通过复核。", after, summary };
}

export async function ensureSalesRepairStorage(db) {
  await ensureSalesTables(db);
  await ensureDataCenterTables(db);
}

export async function readLatestDailyFacts(db) {
  const result = await db.prepare(`SELECT date, COALESCE(SUM(sales), 0) AS sales, COALESCE(SUM(qty), 0) AS qty
    FROM product_sales_daily
    WHERE TRIM(COALESCE(platform, '')) NOT IN ('', '其它', '其他', '未知', '未知平台')
    GROUP BY date ORDER BY date DESC LIMIT 8`).all();
  return (result?.results || []).map(row => ({ date: String(row.date || ""), sales: amount(row.sales), qty: amount(row.qty) })).reverse();
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

async function readDayRows(db, date) {
  const result = await db.prepare(`SELECT code, date, platform, qty, sales, net_sales, gross_profit, refund, cost, pre_ship_refund, post_ship_refund
    FROM product_sales_daily WHERE date = ?`).bind(date).all();
  return (result?.results || []).map(row => ({
    code: row.code,
    date: row.date,
    platform: row.platform,
    qty: amount(row.qty),
    sales: amount(row.sales),
    netSales: amount(row.net_sales),
    grossProfit: amount(row.gross_profit),
    refund: amount(row.refund),
    cost: amount(row.cost),
    preShipRefund: amount(row.pre_ship_refund),
    postShipRefund: amount(row.post_ship_refund)
  }));
}

async function readSalesMeta(db) {
  const row = await db.prepare("SELECT payload FROM product_sales_meta WHERE id = ?").bind("sales-meta").first();
  try {
    return row?.payload ? JSON.parse(row.payload) : { imports: [], titles: {} };
  } catch {
    return { imports: [], titles: {} };
  }
}

function insertStatements(db, rows) {
  const statements = [];
  for (let index = 0; index < rows.length; index += 9) {
    const chunk = rows.slice(index, index + 9);
    const placeholders = chunk.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ");
    const values = chunk.flatMap(row => [
      String(row.code || ""), String(row.date || ""), String(row.platform || "未知平台"),
      amount(row.qty), amount(row.sales), amount(row.netSales), amount(row.grossProfit),
      amount(row.refund), amount(row.cost), amount(row.preShipRefund), amount(row.postShipRefund)
    ]);
    statements.push(db.prepare(`INSERT INTO product_sales_daily
      (code, date, platform, qty, sales, net_sales, gross_profit, refund, cost, pre_ship_refund, post_ship_refund)
      VALUES ${placeholders}
      ON CONFLICT(code, date, platform) DO UPDATE SET
        qty = excluded.qty, sales = excluded.sales, net_sales = excluded.net_sales,
        gross_profit = excluded.gross_profit, refund = excluded.refund, cost = excluded.cost,
        pre_ship_refund = excluded.pre_ship_refund, post_ship_refund = excluded.post_ship_refund`).bind(...values));
  }
  return statements;
}

async function replaceSalesDay(db, { date, rows, titles = {}, requestedBy = "系统自动修复" }) {
  if (!rows.length || rows.length > 2000 || rows.some(row => !String(row.code || "").trim() || row.date !== date)) {
    throw Object.assign(new Error("补拉结果行无效或超过安全上限，已保留原数据。"), { code: "SALES_REPAIR_ROWS_INVALID" });
  }
  const meta = await readSalesMeta(db);
  const importedAt = new Date().toISOString();
  const nextMeta = {
    ...meta,
    titles: { ...(meta.titles || {}), ...titles },
    imports: [{
      id: `repair-${date}-${Date.now()}`,
      months: [date.slice(0, 7)],
      monthRows: { [date.slice(0, 7)]: rows.length },
      rows: rows.length,
      scope: "dates",
      source: `快麦API自动补拉 ${date}`,
      importedBy: requestedBy,
      importedAt
    }, ...(meta.imports || [])].slice(0, 60)
  };
  const statements = [
    db.prepare("DELETE FROM product_sales_daily WHERE date = ?").bind(date),
    ...insertStatements(db, rows),
    db.prepare(`INSERT INTO product_sales_meta (id, payload, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
      .bind("sales-meta", JSON.stringify(nextMeta), importedAt)
  ];
  await db.batch(statements);
}

function completedRun(run, patch) {
  const completedAt = new Date().toISOString();
  return { ...run, ...patch, updatedAt: completedAt, completedAt };
}

export async function executeSalesRepair({ db, env, date, run, dataEnvironment }) {
  try {
    const [config, latestDailyFacts, currentRows] = await Promise.all([
      resolveKuaimaiConfig(env),
      readLatestDailyFacts(db),
      readDayRows(db, date)
    ]);
    if (!config.ready) throw Object.assign(new Error("快麦接口尚未配置，无法自动补拉。"), { code: "SALES_REPAIR_PROVIDER_NOT_CONFIGURED" });
    const pulled = await pullKuaimaiDay(config, { date, pageNo: 1, maxPages: 40 });
    const candidateRows = dataEnvironment?.id === "display"
      ? pulled.rows.map(row => scaleSalesFact(row))
      : pulled.rows;
    const decision = evaluateSalesRepairCandidate({
      latestDailyFacts,
      currentRows,
      pulledRows: candidateRows,
      complete: !pulled.hasNext
    });
    if (decision.action === "replace") {
      await replaceSalesDay(db, { date, rows: candidateRows, titles: pulled.titles, requestedBy: run.requestedBy });
      return writeSalesRepairRun(db, completedRun(run, {
        status: "success",
        rowCount: pulled.rows.length,
        message: "自动补拉完成并通过完整性复核。",
        errorCode: "",
        before: detectLatestSalesAnomaly(latestDailyFacts),
        after: decision.after
      }));
    }
    return writeSalesRepairRun(db, completedRun(run, {
      status: decision.action,
      rowCount: pulled.rows.length,
      message: decision.message,
      errorCode: decision.code,
      before: detectLatestSalesAnomaly(latestDailyFacts),
      after: decision.after || null
    }));
  } catch (error) {
    return writeSalesRepairRun(db, completedRun(run, {
      status: "failed",
      message: error.message || "自动补拉失败，已保留原数据。",
      errorCode: error.code || "SALES_REPAIR_PROVIDER_FAILED"
    }));
  }
}

export const defaultSalesRepairDependencies = {
  ensure: ensureSalesRepairStorage,
  latestFacts: readLatestDailyFacts,
  getRun: readSalesRepairRun,
  putRun: writeSalesRepairRun,
  execute: executeSalesRepair
};
