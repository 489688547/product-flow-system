import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildDashboardProductSummaries, buildProductScheduleSummary } from "../src/domain/dashboardSummary.js";

const dashboardSource = readFileSync(new URL("../src/features/dashboard/DashboardPage.jsx", import.meta.url), "utf8");
const stylesSource = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const products = [
  { id: "p1", name: "增长产品", level: "P1 增长级", stage: 2 },
  { id: "p0", name: "战略产品", level: "P0 战略级", stage: 3 },
  { id: "p2", name: "已上市产品", level: "P2 验证级", stage: 4 },
  { id: "p3", name: "未排期产品", level: "P3 常规级", stage: 1 }
];

const demands = [
  { id: "d1", productId: "p1" },
  { id: "d0", productId: "p0" },
  { id: "d2", productId: "p2" }
];

const plans = [
  { id: "plan-1", demandId: "d1", developmentStart: "2026-07-01", launchDate: "2026-07-31", demandSnapshot: {} },
  { id: "plan-0", demandId: "d0", developmentStart: "2026-06-01", launchDate: "2026-07-10", demandSnapshot: {} },
  { id: "plan-2", demandId: "d2", developmentStart: "2026-06-01", launchDate: "2026-07-10", demandSnapshot: {} }
];

test("dashboard products sort by level priority before launch date", () => {
  const summaries = buildDashboardProductSummaries(products, plans, demands, "2026-07-15");
  assert.deepEqual(summaries.map(item => item.product.id), ["p0", "p1", "p2", "p3"]);
});

test("dashboard schedule marks unfinished products overdue after expected launch", () => {
  const summaries = buildDashboardProductSummaries(products, plans, demands, "2026-07-15");
  const overdue = summaries.find(item => item.product.id === "p0").schedule;
  assert.equal(overdue.state, "overdue");
  assert.equal(overdue.percent, 100);
  assert.equal(overdue.label, "逾期 5 天");
});

test("dashboard schedule treats products in launch stage as complete", () => {
  const summaries = buildDashboardProductSummaries(products, plans, demands, "2026-07-15");
  const launched = summaries.find(item => item.product.id === "p2").schedule;
  assert.equal(launched.state, "complete");
  assert.equal(launched.percent, 100);
  assert.equal(launched.label, "已进入上市");
});

test("dashboard schedule keeps products without a plan neutral", () => {
  const summaries = buildDashboardProductSummaries(products, plans, demands, "2026-07-15");
  const unplanned = summaries.find(item => item.product.id === "p3").schedule;
  assert.equal(unplanned.state, "unplanned");
  assert.equal(unplanned.percent, null);
  assert.equal(unplanned.label, "未排期");
});

test("shared product schedule stays neutral when development starts in the future", () => {
  const summary = buildProductScheduleSummary(
    products[1],
    [{ id: "plan-future", demandId: "d0", developmentStart: "2026-07-20", launchDate: "2026-08-20", demandSnapshot: {} }],
    demands,
    "2026-07-15"
  );
  assert.equal(summary.schedule.state, "scheduled");
  assert.equal(summary.schedule.percent, 0);
  assert.equal(summary.schedule.label, "07/20 开始");
  assert.equal(summary.schedule.daysRemaining, 36);
});

test("shared product schedule warns during the final seven days", () => {
  const summary = buildProductScheduleSummary(
    products[1],
    [{ id: "plan-upcoming", demandId: "d0", developmentStart: "2026-07-01", launchDate: "2026-07-20", demandSnapshot: {} }],
    demands,
    "2026-07-15"
  );
  assert.equal(summary.schedule.state, "upcoming");
  assert.equal(summary.schedule.percent, 74);
  assert.equal(summary.schedule.label, "剩余 5 天");
  assert.equal(summary.schedule.developmentStart, "2026-07-01");
});

test("dashboard overview makes products the scrollable primary summary", () => {
  assert.match(dashboardSource, /buildDashboardProductSummaries/);
  assert.match(dashboardSource, /dashboard-overview-strip/);
  assert.match(dashboardSource, /flow-product-rail/);
  assert.match(dashboardSource, /schedule-ring/);
  assert.match(dashboardSource, /流程中的产品/);
  assert.doesNotMatch(dashboardSource, /按产品优先级排序/);
  assert.match(stylesSource, /\.flow-product-rail\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(stylesSource, /\.flow-summary\s*\{[^}]*display:\s*flex/s);
  assert.match(stylesSource, /\.dashboard-compact-metric\s*\{[^}]*grid-template-columns:\s*28px\s+minmax\(0,\s*1fr\)/s);
  assert.match(stylesSource, /\.dashboard-overview-strip\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});
