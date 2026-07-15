import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeProductPlans,
  planIntersectsYear,
  timelineSegment,
  validateProductPlan
} from "../src/domain/productPlanning.js";

test("planning records normalize and intersect every displayed year they touch", () => {
  const [plan] = normalizeProductPlans([{
    id: "plan-1",
    demandId: "d1",
    demandSnapshot: { name: "跨年新品", image: "cover.jpg" },
    developmentStart: "2026-12-15",
    developmentEnd: "2027-01-20",
    launchStart: "2027-02-01",
    launchEnd: "2027-02-10"
  }]);

  assert.equal(plan.demandSnapshot.name, "跨年新品");
  assert.equal(planIntersectsYear(plan, 2026), true);
  assert.equal(planIntersectsYear(plan, 2027), true);
  assert.equal(planIntersectsYear(plan, 2028), false);
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

test("planning validation requires four ordered ISO date values", () => {
  assert.deepEqual(validateProductPlan({}), { valid: false, reason: "请完整填写预计开发和上线时间。" });
  assert.deepEqual(validateProductPlan({
    developmentStart: "2026-04-10",
    developmentEnd: "2026-04-01",
    launchStart: "2026-05-01",
    launchEnd: "2026-05-20"
  }), { valid: false, reason: "预计开发结束时间不能早于开始时间。" });
  assert.equal(validateProductPlan({
    developmentStart: "2026-04-01",
    developmentEnd: "2026-05-15",
    launchStart: "2026-05-01",
    launchEnd: "2026-05-20"
  }).valid, true);
});
