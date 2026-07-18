import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDataQualitySummary,
  createDefaultDataCenterState,
  defaultDataCenterRange,
  filterOperationalSales,
  normalizeDataCenterState,
  reduceDataCenterState,
  summarizeDataCenterSales
} from "../src/domain/dataCenter.js";

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

test("source records reject credential-like fields", () => {
  const normalized = normalizeDataCenterState({
    sources: [{
      id: "km",
      name: "快麦",
      pageUrl: "https://erp.example",
      password: "secret",
      cookie: "sid=1",
      accessToken: "secret-token",
      verificationCode: "123456"
    }]
  });
  assert.equal(normalized.sources[0].password, undefined);
  assert.equal(normalized.sources[0].cookie, undefined);
  assert.equal(normalized.sources[0].accessToken, undefined);
  assert.equal(normalized.sources[0].verificationCode, undefined);
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
      mappings: [{ id: "m1", dimensionType: "product", status: "pending" }]
    },
    salesRows: [{ platform: "抖音" }, { platform: "其它" }],
    salesMeta: { lastSuccessfulSyncAt: "2026-07-18T07:30:00.000Z" }
  });
  assert.deepEqual(quality, {
    openIssues: 1,
    unmappedProducts: 1,
    excludedRows: 1,
    lastSuccessfulSyncAt: "2026-07-18T07:30:00.000Z"
  });
});
