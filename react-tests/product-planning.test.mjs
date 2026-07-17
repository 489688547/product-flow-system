import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanningCandidates,
  normalizeProductPlans,
  planIntersectsYear,
  timelineSegment,
  validateProductPlan
} from "../src/domain/productPlanning.js";

test("planning candidates combine demand opportunities with active products and exclude review-stage products", () => {
  const candidates = buildPlanningCandidates(
    [
      { id: "d-pool", name: "需求池新品", status: "待讨论", expectedLaunchMonth: "2026-10" },
      { id: "d-active", name: "来源机会", status: "已转开发", productId: "p-active", expectedLaunchMonth: "2026-11" },
      { id: "d-review", name: "复盘来源", status: "已转开发", productId: "p-review", expectedLaunchMonth: "2026-12" }
    ],
    [
      { id: "p-active", name: "流程中产品", stage: 3, level: "P1 增长级", levelConfirmed: true, image: "active.jpg", productManager: "赵雨涵", productManagerUserId: "u-zhao", productManagerUnionId: "union-zhao" },
      { id: "p-review", name: "已复盘产品", stage: 5, level: "P0 战略级", levelConfirmed: true }
    ]
  );

  assert.deepEqual(candidates.map(item => item.id), ["d-pool", "d-active"]);
  assert.equal(candidates[0].planningLevel, "未定级");
  assert.equal(candidates[0].planningLevelIsReference, false);
  assert.equal(candidates[0].expectedLaunchMonth, "2026-10");
  assert.equal(candidates[1].name, "流程中产品");
  assert.equal(candidates[1].planningLevel, "P1 增长级");
  assert.equal(candidates[1].planningLevelIsReference, false);
  assert.equal(candidates[1].planningSource, "progress");
  assert.equal(candidates[1].productManager, "赵雨涵");
  assert.equal(candidates[1].productManagerUserId, "u-zhao");
  assert.equal(candidates[1].productManagerUnionId, "union-zhao");
});

test("planning records normalize and intersect every displayed year they touch", () => {
  const [plan] = normalizeProductPlans([{
    id: "plan-1",
    demandId: "d1",
    demandSnapshot: { name: "跨年新品", image: "cover.jpg", productManager: "赵雨涵", productManagerUserId: "u-zhao", productManagerUnionId: "union-zhao" },
    developmentStart: "2026-12-15",
    developmentEnd: "2027-01-20",
    launchStart: "2027-02-01",
    launchEnd: "2027-02-10"
  }]);

  assert.equal(plan.demandSnapshot.name, "跨年新品");
  assert.equal(plan.demandSnapshot.productManager, "赵雨涵");
  assert.equal(plan.demandSnapshot.productManagerUserId, "u-zhao");
  assert.equal(plan.demandSnapshot.productManagerUnionId, "union-zhao");
  assert.equal(plan.developmentStart, "2026-12-15");
  assert.equal(plan.launchDate, "2027-02-10");
  assert.equal("developmentEnd" in plan, false);
  assert.equal("launchStart" in plan, false);
  assert.equal(planIntersectsYear(plan, 2026), true);
  assert.equal(planIntersectsYear(plan, 2027), true);
  assert.equal(planIntersectsYear(plan, 2028), false);
});

test("planning migration keeps the latest duplicate and falls back from an invalid new launch date", () => {
  const plans = normalizeProductPlans([
    {
      id: "older",
      demandId: "d1",
      developmentStart: "2026-06-01",
      launchDate: "not-a-date",
      launchEnd: "2026-07-15",
      updatedAt: "2026-06-01T00:00:00.000Z"
    },
    {
      id: "newer",
      demandId: "d1",
      developmentStart: "2026-08-01",
      launchDate: "2026-09-20",
      updatedAt: "2026-07-01T00:00:00.000Z"
    }
  ]);

  assert.equal(plans.length, 1);
  assert.equal(plans[0].id, "newer");
  assert.equal(plans[0].launchDate, "2026-09-20");

  const [legacyFallback] = normalizeProductPlans([{
    id: "legacy-fallback",
    demandId: "d2",
    developmentStart: "2026-06-01",
    launchDate: "not-a-date",
    launchEnd: "2026-07-15"
  }]);
  assert.equal(legacyFallback.launchDate, "2026-07-15");
});

test("timeline segments clip cross-year ranges into the visible annual track", () => {
  const segment = timelineSegment("2025-12-15", "2026-02-10", 2026);

  assert.equal(segment.visible, true);
  assert.equal(segment.start, "2026-01-01");
  assert.equal(segment.end, "2026-02-10");
  assert.ok(segment.left >= 0);
  assert.ok(segment.width > 0);
  assert.ok(segment.left + segment.width <= 100);
});

test("planning validation requires one ordered development-to-launch period", () => {
  assert.deepEqual(validateProductPlan({}), { valid: false, reason: "请填写开发开始日期和预计上线日期。" });
  assert.deepEqual(validateProductPlan({
    developmentStart: "2026-04-10",
    launchDate: "2026-04-01"
  }), { valid: false, reason: "预计上线日期不能早于开发开始日期。" });
  assert.equal(validateProductPlan({
    developmentStart: "2026-04-01",
    launchDate: "2026-05-20"
  }).valid, true);
});
