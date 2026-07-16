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

const tasks = [
  { id: "p1-s1-a", productId: "p1", stage: 1, done: true },
  { id: "p1-s1-b", productId: "p1", stage: 1, done: true },
  { id: "p1-s2-a", productId: "p1", stage: 2, done: true },
  { id: "p1-s2-b", productId: "p1", stage: 2, done: false },
  { id: "p1-future", productId: "p1", stage: 3, done: true },
  { id: "p0-s1", productId: "p0", stage: 1, done: true },
  { id: "p0-s2", productId: "p0", stage: 2, done: true },
  { id: "p0-s3-a", productId: "p0", stage: 3, done: true },
  { id: "p0-s3-b", productId: "p0", stage: 3, done: false },
  { id: "p2-s1", productId: "p2", stage: 1, done: true },
  { id: "p2-s2", productId: "p2", stage: 2, done: true },
  { id: "p2-s3-a", productId: "p2", stage: 3, done: true },
  { id: "p2-s3-b", productId: "p2", stage: 3, done: false },
  { id: "p2-s4", productId: "p2", stage: 4, done: true },
  { id: "p3-s1-a", productId: "p3", stage: 1, done: true },
  { id: "p3-s1-b", productId: "p3", stage: 1, done: false }
];

test("dashboard products sort by level priority before launch date", () => {
  const summaries = buildDashboardProductSummaries(products, plans, demands, "2026-07-15", tasks);
  assert.deepEqual(summaries.map(item => item.product.id), ["p0", "p1", "p2", "p3"]);
});

test("dashboard schedule marks unfinished products overdue after expected launch", () => {
  const summaries = buildDashboardProductSummaries(products, plans, demands, "2026-07-15", tasks);
  const overdue = summaries.find(item => item.product.id === "p0").schedule;
  assert.equal(overdue.state, "overdue");
  assert.equal(overdue.percent, 55);
  assert.equal(overdue.label, "逾期 5 天");
});

test("launch status stays separate from incomplete task progress", () => {
  const summaries = buildDashboardProductSummaries(products, plans, demands, "2026-07-15", tasks);
  const launched = summaries.find(item => item.product.id === "p2").schedule;
  assert.equal(launched.state, "complete");
  assert.equal(launched.percent, 90);
  assert.equal(launched.label, "已进入上市");
});

test("products without a plan still show actual task progress", () => {
  const summaries = buildDashboardProductSummaries(products, plans, demands, "2026-07-15", tasks);
  const unplanned = summaries.find(item => item.product.id === "p3").schedule;
  assert.equal(unplanned.state, "unplanned");
  assert.equal(unplanned.percent, 10);
  assert.equal(unplanned.label, "未排期");
});

test("task progress uses 20, 25, 20 and 35 percent stage weights without counting future work", () => {
  const summary = buildProductScheduleSummary(products[0], plans, demands, "2026-07-15", tasks);
  assert.equal(summary.schedule.percent, 33);
  assert.equal(summary.schedule.state, "active");
});

test("shared product schedule stays neutral when development starts in the future", () => {
  const summary = buildProductScheduleSummary(
    products[1],
    [{ id: "plan-future", demandId: "d0", developmentStart: "2026-07-20", launchDate: "2026-08-20", demandSnapshot: {} }],
    demands,
    "2026-07-15",
    tasks
  );
  assert.equal(summary.schedule.state, "scheduled");
  assert.equal(summary.schedule.percent, 55);
  assert.equal(summary.schedule.label, "07/20 开始");
  assert.equal(summary.schedule.daysRemaining, 36);
});

test("shared product schedule warns during the final seven days", () => {
  const summary = buildProductScheduleSummary(
    products[1],
    [{ id: "plan-upcoming", demandId: "d0", developmentStart: "2026-07-01", launchDate: "2026-07-20", demandSnapshot: {} }],
    demands,
    "2026-07-15",
    tasks
  );
  assert.equal(summary.schedule.state, "upcoming");
  assert.equal(summary.schedule.percent, 55);
  assert.equal(summary.schedule.label, "剩余 5 天");
  assert.equal(summary.schedule.developmentStart, "2026-07-01");
});

test("dashboard overview makes products the scrollable primary summary", () => {
  assert.match(dashboardSource, /buildDashboardProductSummaries/);
  assert.match(dashboardSource, /dashboard-overview-strip/);
  assert.match(dashboardSource, /flow-product-rail/);
  assert.match(dashboardSource, /schedule-ring/);
  assert.match(dashboardSource, /实际进度/);
  assert.match(dashboardSource, /流程中的产品/);
  assert.doesNotMatch(dashboardSource, /按产品优先级排序/);
  assert.match(stylesSource, /\.flow-product-rail\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(stylesSource, /\.flow-summary\s*\{[^}]*display:\s*flex/s);
  assert.match(stylesSource, /\.dashboard-compact-metric\s*\{[^}]*grid-template-columns:\s*28px\s+minmax\(0,\s*1fr\)/s);
  assert.match(stylesSource, /\.dashboard-overview-strip\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/s);
});
