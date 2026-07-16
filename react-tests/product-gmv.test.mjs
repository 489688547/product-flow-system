import test from "node:test";
import assert from "node:assert/strict";
import {
  buildProductGmvProgress,
  normalizeMonthlyGmvTarget,
  suggestAnnualGmvScore
} from "../src/domain/productGmv.js";

const SKU = [{ code: "6977173969783", price: 29.9 }];

test("average monthly GMV produces the annual grading reference score", () => {
  assert.deepEqual(suggestAnnualGmvScore(20_000), { annualGmv: 240_000, score: 1, label: "＜30万" });
  assert.deepEqual(suggestAnnualGmvScore(50_000), { annualGmv: 600_000, score: 2, label: "30-100万" });
  assert.deepEqual(suggestAnnualGmvScore(150_000), { annualGmv: 1_800_000, score: 3, label: "100-300万" });
  assert.deepEqual(suggestAnnualGmvScore(400_000), { annualGmv: 4_800_000, score: 4, label: "300-600万" });
  assert.deepEqual(suggestAnnualGmvScore(600_000), { annualGmv: 7_200_000, score: 5, label: "＞600万" });
  assert.equal(suggestAnnualGmvScore(0), null);
});

test("monthly GMV targets normalize to positive currency values", () => {
  assert.equal(normalizeMonthlyGmvTarget("100000.126"), 100000.13);
  assert.equal(normalizeMonthlyGmvTarget(0), null);
  assert.equal(normalizeMonthlyGmvTarget("not-a-number"), null);
});

test("GMV progress uses buyer-paid sales and can exceed 100 percent", () => {
  const summary = buildProductGmvProgress({
    product: { monthlyGmvTarget: 100_000, skuCodes: SKU },
    dailyRows: [
      { code: SKU[0].code, date: "2026-06-20", sales: 130_000 },
      { code: SKU[0].code, date: "2026-07-02", sales: 80_000 },
      { code: SKU[0].code, date: "2026-07-15", sales: 40_000 },
      { code: SKU[0].code, date: "2026-08-01", sales: 999_999 }
    ],
    launchDate: "2026-06-10",
    today: new Date("2026-07-16T08:00:00+08:00")
  });

  assert.equal(summary.state, "ready");
  assert.equal(summary.current.actual, 120_000);
  assert.equal(summary.current.target, 100_000);
  assert.equal(summary.current.percent, 120);
  assert.equal(summary.cumulative.actual, 250_000);
  assert.equal(summary.cumulative.target, 200_000);
  assert.equal(summary.cumulative.percent, 125);
  assert.equal(summary.cumulative.months, 2);
});

test("GMV progress exposes actionable missing-data states", () => {
  const missingTarget = buildProductGmvProgress({ product: { skuCodes: SKU }, dailyRows: [] });
  assert.equal(missingTarget.state, "missing-target");

  const missingSku = buildProductGmvProgress({ product: { monthlyGmvTarget: 100_000 }, dailyRows: [] });
  assert.equal(missingSku.state, "missing-sku");

  const missingSchedule = buildProductGmvProgress({
    product: { monthlyGmvTarget: 100_000, skuCodes: SKU },
    dailyRows: [{ code: SKU[0].code, date: "2026-07-02", sales: 10_000 }],
    today: new Date("2026-07-16T08:00:00+08:00")
  });
  assert.equal(missingSchedule.state, "ready");
  assert.equal(missingSchedule.current.percent, 10);
  assert.equal(missingSchedule.cumulative.state, "missing-schedule");

  const empty = buildProductGmvProgress({
    product: { monthlyGmvTarget: 100_000, skuCodes: SKU },
    dailyRows: [],
    launchDate: "2026-06-10",
    today: new Date("2026-07-16T08:00:00+08:00")
  });
  assert.equal(empty.salesState, "empty");
  assert.equal(empty.current.percent, 0);
});
