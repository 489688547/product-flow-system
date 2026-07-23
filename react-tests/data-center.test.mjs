import test from "node:test";
import assert from "node:assert/strict";
import {
  DATA_CENTER_PERSISTED_COLLECTIONS,
  buildDataCenterSalesFactViews,
  buildDataQualitySummary,
  createDefaultDataCenterState,
  defaultDataCenterRange,
  detectLatestSalesAnomaly,
  filterOperationalSales,
  normalizeDataCenterState,
  reduceDataCenterState,
  summarizeDataCenterSales
} from "../src/domain/dataCenter.js";

test("latest sales day is incomplete only when GMV and quantity are both below 25 percent of the seven-day median", () => {
  const facts = [
    ["2026-07-14", 100, 10],
    ["2026-07-15", 120, 12],
    ["2026-07-16", 110, 11],
    ["2026-07-17", 130, 13],
    ["2026-07-18", 90, 9],
    ["2026-07-19", 105, 10],
    ["2026-07-20", 115, 12],
    ["2026-07-21", 20, 2]
  ].map(([date, sales, qty]) => ({ date, sales, qty }));

  assert.deepEqual(detectLatestSalesAnomaly(facts), {
    status: "anomaly",
    code: "SALES_LATEST_DAY_INCOMPLETE",
    date: "2026-07-21",
    sales: 20,
    qty: 2,
    baselineDays: 7,
    salesMedian: 110,
    qtyMedian: 11,
    salesRatio: 0.1818,
    qtyRatio: 0.1818,
    threshold: 0.25
  });

  const onlySalesLow = facts.map(item => item.date === "2026-07-21" ? { ...item, qty: 4 } : item);
  assert.equal(detectLatestSalesAnomaly(onlySalesLow).status, "healthy");
});

test("latest sales completeness does not infer an anomaly without three baseline days", () => {
  assert.deepEqual(detectLatestSalesAnomaly([
    { date: "2026-07-20", sales: 100, qty: 10 },
    { date: "2026-07-21", sales: 1, qty: 1 }
  ]), {
    status: "insufficient_baseline",
    code: "SALES_COMPLETENESS_BASELINE_INSUFFICIENT",
    date: "2026-07-21",
    baselineDays: 1,
    threshold: 0.25
  });
});

test("data center keeps legacy metric definitions read-only and out of generic persistence", () => {
  assert.ok(createDefaultDataCenterState().metricDefinitions.length > 0);
  assert.ok(!DATA_CENTER_PERSISTED_COLLECTIONS.includes("metricDefinitions"));
});

test("data center defaults to the month containing yesterday in Shanghai", () => {
  assert.deepEqual(defaultDataCenterRange(new Date("2026-07-18T04:00:00.000Z")), {
    from: "2026-07-01",
    to: "2026-07-17"
  });
  assert.deepEqual(defaultDataCenterRange(new Date("2026-08-01T01:00:00.000Z")), {
    from: "2026-07-01",
    to: "2026-07-31"
  });
});

test("normal operations exclude Other without deleting raw rows", () => {
  const raw = [
    { date: "2026-07-17", platform: "抖音", netSales: 80 },
    { date: "2026-07-17", platform: "其它", netSales: 20 },
    { date: "2026-07-17", platform: "未知平台", netSales: 10 },
    { date: "2026-07-17", platform: "", netSales: 5 }
  ];
  assert.deepEqual(filterOperationalSales(raw).map(row => row.platform), ["抖音"]);
  assert.equal(raw.length, 4);
});

test("sales summary exposes totals coverage and contribution", () => {
  const summary = summarizeDataCenterSales([
    { code: "6977173969783", date: "2026-07-16", platform: "抖音", qty: 2, sales: 100, netSales: 90, grossProfit: 40, refund: 10, cost: 50 },
    { code: "6977173969783", date: "2026-07-17", platform: "抖音", qty: 1, sales: 50, netSales: 45, grossProfit: 20, refund: 5, cost: 25 },
    { code: "6978705011352", date: "2026-07-17", platform: "天猫", qty: 3, sales: 120, netSales: 110, grossProfit: 55, refund: 10, cost: 55 },
    { code: "6900000000000", date: "2026-07-17", platform: "其它", qty: 9, sales: 900, netSales: 900, grossProfit: 1, refund: 0, cost: 0 }
  ], { from: "2026-07-16", to: "2026-07-17" });
  assert.equal(summary.totals.netSales, 245);
  assert.equal(summary.totals.qty, 6);
  assert.equal(summary.totals.refund, 25);
  assert.equal(summary.totals.refundRate, 9.26);
  assert.equal(summary.totals.grossMarginRate, 46.94);
  assert.equal(summary.byDay.length, 2);
  assert.deepEqual(summary.byPlatform.map(row => row.platform), ["抖音", "天猫"]);
  assert.equal(summary.excludedRows, 1);
});

test("sales fact views expose daily platform GMV details and rank platform distribution by GMV", () => {
  const views = buildDataCenterSalesFactViews([
    { date: "2026-07-20", platform: "抖音", qty: 2, sales: 200, netSales: 160, grossProfit: 80 },
    { date: "2026-07-20", platform: "天猫", qty: 1, sales: 120, netSales: 110, grossProfit: 44 },
    { date: "2026-07-21", platform: "天猫", qty: 3, sales: 300, netSales: 240, grossProfit: 96 },
    { date: "2026-07-21", platform: "其它", qty: 9, sales: 900, netSales: 900, grossProfit: 1 }
  ], { from: "2026-07-01", to: "2026-07-21" });

  assert.deepEqual(views.byDay[0].platforms.map(item => [item.platform, item.sales]), [
    ["抖音", 200],
    ["天猫", 120]
  ]);
  assert.equal(views.byDay[0].qty, 3);
  assert.equal(views.byDay[0].grossProfit, 124);
  assert.deepEqual(views.byPlatform.map(item => [item.platform, item.sales]), [
    ["天猫", 420],
    ["抖音", 200]
  ]);
});

test("sales trend preserves every selected date and marks dates without facts as empty", () => {
  const views = buildDataCenterSalesFactViews([
    { date: "2026-07-20", platform: "抖音", qty: 2, sales: 200, netSales: 160, grossProfit: 80 },
    { date: "2026-07-21", platform: "天猫", qty: 3, sales: 300, netSales: 240, grossProfit: 96 }
  ], { from: "2026-07-20", to: "2026-07-22" });

  assert.deepEqual(views.trendByDay.map(day => [day.date, day.hasData, day.sales]), [
    ["2026-07-20", true, 200],
    ["2026-07-21", true, 300],
    ["2026-07-22", false, 0]
  ]);
  assert.deepEqual(views.trendByDay[2].platforms, []);
  assert.equal(views.byDay.length, 2);
});

test("source records reject credential-like fields", () => {
  const normalized = normalizeDataCenterState({
    sources: [{
      id: "km",
      name: "快麦",
      pageUrl: "https://erp.example",
      password: "secret",
      cookie: "sid=1",
      accessToken: "secret-token",
      apiToken: "api-secret",
      verificationCode: "123456",
      credentials: { password: "nested-secret", cookie: "nested-cookie" }
    }]
  });
  assert.equal(normalized.sources[0].password, undefined);
  assert.equal(normalized.sources[0].cookie, undefined);
  assert.equal(normalized.sources[0].accessToken, undefined);
  assert.equal(normalized.sources[0].apiToken, undefined);
  assert.equal(normalized.sources[0].verificationCode, undefined);
  assert.deepEqual(normalized.sources[0].credentials, {});
  assert.equal(normalized.sources[0].pageUrl, "https://erp.example");
});

test("source changes are audited", () => {
  const next = reduceDataCenterState(createDefaultDataCenterState(), {
    type: "upsert_source",
    actor: "数据管理员",
    timestamp: "2026-07-18T08:00:00.000Z",
    record: {
      id: "kuaimai-sales",
      platform: "快麦",
      name: "快麦销售",
      pageUrl: "https://erp.superboss.cc/index.html#/index/",
      status: "disabled"
    }
  });
  assert.equal(next.sources[0].name, "快麦销售");
  assert.equal(next.auditLogs[0].actor, "数据管理员");
  assert.equal(next.auditLogs[0].action, "upsert_source");
  assert.equal(next.auditLogs[0].createdAt, "2026-07-18T08:00:00.000Z");
});

test("quality summary separates excluded rows and unresolved mappings", () => {
  const quality = buildDataQualitySummary({
    state: {
      qualityIssues: [{ id: "q1", status: "open" }, { id: "q2", status: "resolved" }],
      mappings: [{ id: "m1", dimensionType: "product", status: "pending" }],
      syncRuns: [
        { id: "old-failure", sourceId: "kuaimai", status: "failed", completedAt: "2026-07-17T07:00:00.000Z" },
        { id: "latest-success", sourceId: "kuaimai", status: "success", completedAt: "2026-07-18T07:30:00.000Z" },
        { id: "latest-failure", sourceId: "douyin", status: "failed", completedAt: "2026-07-18T08:00:00.000Z" }
      ]
    },
    salesRows: [{ date: "2026-07-20", platform: "抖音" }, { date: "2026-07-21", platform: "其它" }],
    salesMeta: { lastSuccessfulSyncAt: "2026-07-18T07:30:00.000Z" }
  });
  assert.deepEqual(quality, {
    openIssues: 1,
    unmappedProducts: 1,
    excludedRows: 1,
    lastSuccessfulSyncAt: "2026-07-18T07:30:00.000Z",
    latestDataDate: "2026-07-21",
    syncAttentionCount: 1
  });
});
