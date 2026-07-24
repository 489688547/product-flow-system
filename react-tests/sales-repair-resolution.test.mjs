import assert from "node:assert/strict";
import test from "node:test";

import { buildDataQualitySummary } from "../src/domain/dataCenter.js";
import { repairRunId, resolveRepairedSalesDays } from "../functions/api/platform/v1/data-services/_shared/salesRepairResolution.js";
import { onRequest } from "../functions/api/sales.js";
import { ingestErpCollection } from "../functions/api/platform/v1/erp-collection/_shared/storage.js";
import { createErpCollectionD1Mock } from "../tests/helpers/erp-collection-d1-mock.mjs";

function openRepairRun(date, status = "manual_required") {
  return {
    id: repairRunId(date),
    sourceId: "kuaimai",
    sourceName: "快麦 ERP",
    date,
    from: date,
    to: date,
    status,
    attempts: 1,
    trigger: "sales_completeness_auto_repair",
    ruleVersion: "sales-completeness-v1",
    message: "当天已有退款明细，不能用快麦订单 API 覆盖，请重新导入官方文件。",
    errorCode: "SALES_REPAIR_RICH_FACTS_PROTECTED",
    requestedBy: "系统自动修复",
    startedAt: "2026-07-22T01:00:00.000Z",
    updatedAt: "2026-07-22T01:05:00.000Z",
    completedAt: "2026-07-22T01:05:00.000Z"
  };
}

const baselineFacts = [
  ["2026-07-14", 100, 10],
  ["2026-07-15", 120, 12],
  ["2026-07-16", 110, 11],
  ["2026-07-17", 130, 13],
  ["2026-07-18", 90, 9],
  ["2026-07-19", 105, 10],
  ["2026-07-20", 115, 12]
].map(([date, sales, qty]) => ({ date, sales, qty }));

function factsWithLatest(latest) {
  return [...baselineFacts, latest];
}

function createSalesDb({ repairRuns = [], factsByDate = {}, throwOn = "" } = {}) {
  const writtenRuns = [];
  const insertedFactRows = [];
  return {
    writtenRuns,
    insertedFactRows,
    prepare(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      if (throwOn && normalized.includes(throwOn)) throw new Error(`模拟 ${throwOn} 查询失败`);
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (normalized.startsWith("insert into data_sync_runs")) {
            writtenRuns.push({ id: statement.values[1], run: JSON.parse(statement.values[2]) });
          }
          if (normalized.startsWith("insert into product_sales_daily")) {
            insertedFactRows.push(statement.values);
          }
          return { success: true };
        },
        async first() {
          return null;
        },
        async all() {
          if (normalized.includes("from data_sync_runs")) {
            return { results: repairRuns.map(run => ({ id: run.id, payload: JSON.stringify(run) })) };
          }
          if (normalized.includes("from product_sales_daily") && normalized.includes("group by date")) {
            const date = statement.values[0];
            const results = [...(factsByDate[date] || [])]
              .sort((left, right) => right.date.localeCompare(left.date))
              .slice(0, 8);
            return { results };
          }
          return { results: [] };
        }
      };
      return statement;
    },
    async batch(statements) {
      for (const statement of statements) await statement.run();
      return statements.map(() => ({ success: true }));
    }
  };
}

test("empty or invalid dates never touch the database", async () => {
  const db = {
    prepare() {
      throw new Error("空日期列表不得查询数据库");
    }
  };
  assert.deepEqual(await resolveRepairedSalesDays(db, { dates: [] }), { resolved: [], stillOpen: [] });
  assert.deepEqual(await resolveRepairedSalesDays(db, { dates: ["2026/07/21", ""] }), { resolved: [], stillOpen: [] });
});

test("official import closes a manual_required repair run once the day rechecks healthy", async () => {
  const openRun = openRepairRun("2026-07-21");
  assert.equal(buildDataQualitySummary({ state: { syncRuns: [openRun] } }).syncAttentionCount, 1);

  const db = createSalesDb({
    repairRuns: [openRun],
    factsByDate: { "2026-07-21": factsWithLatest({ date: "2026-07-21", sales: 120, qty: 12 }) }
  });
  const result = await resolveRepairedSalesDays(db, { dates: ["2026-07-21"], resolvedBy: "运营同事" });

  assert.deepEqual(result.stillOpen, []);
  assert.deepEqual(result.resolved, [{ id: openRun.id, date: "2026-07-21" }]);
  assert.equal(db.writtenRuns.length, 1);
  const closed = db.writtenRuns[0].run;
  assert.equal(closed.status, "success");
  assert.equal(closed.message, "官方文件导入后复核通过，自动结案。");
  assert.equal(closed.errorCode, "");
  assert.equal(closed.resolution, "official_import_recheck");
  assert.equal(closed.resolvedBy, "运营同事");
  assert.equal(closed.after.status, "healthy");
  assert.ok(closed.completedAt && closed.updatedAt);
  // 结案后数据总览健康徽章口径不再把该来源计入待处理。
  assert.equal(buildDataQualitySummary({ state: { syncRuns: [closed] } }).syncAttentionCount, 0);
});

test("a day still below the 25% threshold keeps the repair run open", async () => {
  const openRun = openRepairRun("2026-07-21");
  const db = createSalesDb({
    repairRuns: [openRun],
    factsByDate: { "2026-07-21": factsWithLatest({ date: "2026-07-21", sales: 20, qty: 2 }) }
  });
  const result = await resolveRepairedSalesDays(db, { dates: ["2026-07-21"] });

  assert.deepEqual(result.resolved, []);
  assert.equal(result.stillOpen.length, 1);
  assert.equal(result.stillOpen[0].date, "2026-07-21");
  assert.equal(result.stillOpen[0].check.status, "anomaly");
  assert.equal(db.writtenRuns.length, 0);
});

test("unrelated, already-closed or out-of-scope runs are left untouched", async () => {
  const db = createSalesDb({
    repairRuns: [
      { ...openRepairRun("2026-07-21"), id: "manual-note:2026-07-21" },
      openRepairRun("2026-07-21", "success"),
      openRepairRun("2026-07-19")
    ],
    factsByDate: { "2026-07-21": factsWithLatest({ date: "2026-07-21", sales: 120, qty: 12 }) }
  });
  const result = await resolveRepairedSalesDays(db, { dates: ["2026-07-21"] });

  assert.deepEqual(result, { resolved: [], stillOpen: [] });
  assert.equal(db.writtenRuns.length, 0);
});

test("date-scoped official sales import resolves the open repair run best-effort", async () => {
  const db = createSalesDb({
    repairRuns: [openRepairRun("2026-07-21")],
    factsByDate: { "2026-07-21": factsWithLatest({ date: "2026-07-21", sales: 120, qty: 12 }) }
  });
  const response = await onRequest({
    request: new Request("https://example.test/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        replaceScope: "dates",
        source: "快麦官方销售报表",
        importedBy: "运营同事",
        rows: [{
          code: "6978705011208",
          date: "2026-07-21",
          platform: "天猫",
          qty: 12,
          sales: 120,
          netSales: 108,
          grossProfit: 60,
          refund: 3,
          cost: 48
        }]
      })
    }),
    env: { PRODUCT_FLOW_DB: db }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.synced, true);
  assert.equal(payload.repairRunsResolved, 1);
  assert.equal(db.insertedFactRows.length, 1);
  assert.equal(db.writtenRuns[0].run.status, "success");
});

test("whole-month official sales import resolves open repair runs by row dates", async () => {
  const db = createSalesDb({
    repairRuns: [openRepairRun("2026-07-21")],
    factsByDate: { "2026-07-21": factsWithLatest({ date: "2026-07-21", sales: 120, qty: 12 }) }
  });
  const response = await onRequest({
    request: new Request("https://example.test/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source: "快麦官方销售报表",
        rows: [
          { code: "6978705011208", date: "2026-07-21", platform: "天猫", qty: 12, sales: 120 },
          { code: "6978705011208", date: "2026-07-20", platform: "天猫", qty: 11, sales: 115 }
        ]
      })
    }),
    env: { PRODUCT_FLOW_DB: db }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.repairRunsResolved, 1);
  assert.equal(db.writtenRuns[0].run.status, "success");
});

test("a failing resolution never breaks the official import", async () => {
  const db = createSalesDb({
    repairRuns: [openRepairRun("2026-07-21")],
    factsByDate: { "2026-07-21": factsWithLatest({ date: "2026-07-21", sales: 120, qty: 12 }) },
    throwOn: "from data_sync_runs"
  });
  const response = await onRequest({
    request: new Request("https://example.test/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        replaceScope: "dates",
        rows: [{ code: "6978705011208", date: "2026-07-21", platform: "天猫", qty: 12, sales: 120 }]
      })
    }),
    env: { PRODUCT_FLOW_DB: db }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.equal(payload.synced, true);
  assert.equal(payload.rows, 1);
  assert.equal(payload.repairRunsResolved, 0);
  assert.equal(db.insertedFactRows.length, 1);
  assert.equal(db.writtenRuns.length, 0);
});

test("ERP collection projection resolves open repair runs after writing sales facts", async () => {
  const controlDb = createErpCollectionD1Mock();
  const businessDb = createSalesDb({
    repairRuns: [openRepairRun("2026-07-21")],
    factsByDate: { "2026-07-21": factsWithLatest({ date: "2026-07-21", sales: 120, qty: 12 }) }
  });
  const result = await ingestErpCollection(controlDb, {
    idempotencyKey: "batch-resolve-1",
    batch: {
      id: "batch-resolve-1",
      platformId: "kuaimai",
      resourceType: "sales_items",
      sourceFileName: "销售主题分析-按订单商品明细.xlsx",
      contentHash: "e".repeat(64),
      schemaVersion: "1",
      rangeStart: "2026-07-21",
      rangeEnd: "2026-07-21",
      rowCount: 1,
      status: "completed",
      collectedAt: "2026-07-23T08:00:00.000Z"
    },
    archive: null,
    records: [{
      id: "record-1",
      sourceKey: "row-1",
      occurredAt: "2026-07-21T10:00:00+08:00",
      modifiedAt: "2026-07-22T10:00:00+08:00",
      shopId: null,
      warehouseId: null,
      contentHash: "f".repeat(64),
      payload: { 条形码: "6978705011208", 平台: "天猫", 商品买家已付金额: 120, 销售数量: 12 }
    }],
    issues: []
  }, {
    actor: "运营同事",
    businessDb,
    target: { environmentId: "production", environmentVersion: 1 }
  });

  assert.equal(result.projection.salesRows, 1);
  assert.deepEqual(result.projection.salesDates, ["2026-07-21"]);
  assert.equal(result.projection.repairRunsResolved, 1);
  assert.equal(businessDb.writtenRuns.length, 1);
  assert.equal(businessDb.writtenRuns[0].run.status, "success");
  assert.equal(businessDb.writtenRuns[0].run.resolution, "official_import_recheck");
});
