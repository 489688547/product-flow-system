import assert from "node:assert/strict";
import test from "node:test";
import {
  compareDataCenterMetric,
  dataCenterPresetRange,
  dataCenterRangeDays,
  previousDataCenterRange
} from "../src/domain/dataCenter.js";

test("data overview presets use complete Shanghai days ending yesterday", () => {
  const today = new Date("2026-07-22T04:00:00.000Z");
  assert.deepEqual(dataCenterPresetRange(7, today), { from: "2026-07-15", to: "2026-07-21" });
  assert.deepEqual(dataCenterPresetRange(15, today), { from: "2026-07-07", to: "2026-07-21" });
  assert.deepEqual(dataCenterPresetRange(30, today), { from: "2026-06-22", to: "2026-07-21" });
});

test("comparison range is the immediately previous period with equal inclusive days", () => {
  const current = { from: "2026-07-01", to: "2026-07-15" };
  assert.equal(dataCenterRangeDays(current), 15);
  assert.deepEqual(previousDataCenterRange(current), { from: "2026-06-16", to: "2026-06-30" });

  const leapDayRange = { from: "2024-02-28", to: "2024-03-01" };
  assert.equal(dataCenterRangeDays(leapDayRange), 3);
  assert.deepEqual(previousDataCenterRange(leapDayRange), { from: "2024-02-25", to: "2024-02-27" });
});

test("value metrics compare by relative percent and rate metrics by percentage points", () => {
  assert.deepEqual(
    compareDataCenterMetric(
      { value: 120, coverageRate: 1, status: "complete" },
      { value: 100, coverageRate: 1, status: "complete" },
      { comparison: "relative", favorable: "increase" }
    ),
    { available: true, direction: "up", favorable: true, value: 20, unit: "percent", reasonCode: "" }
  );
  assert.deepEqual(
    compareDataCenterMetric(
      { value: 8, coverageRate: 1, status: "complete" },
      { value: 10, coverageRate: 1, status: "complete" },
      { comparison: "percentage_point", favorable: "decrease" }
    ),
    { available: true, direction: "down", favorable: true, value: 2, unit: "percentage_point", reasonCode: "" }
  );
});

test("comparison handles flat values, zero baselines and incomplete previous results without invented ratios", () => {
  assert.deepEqual(
    compareDataCenterMetric({ value: 0 }, { value: 0 }, { comparison: "relative", favorable: "increase" }),
    { available: true, direction: "flat", favorable: true, value: 0, unit: "percent", reasonCode: "" }
  );
  assert.equal(
    compareDataCenterMetric({ value: 10 }, { value: 0 }, { comparison: "relative" }).reasonCode,
    "PREVIOUS_VALUE_ZERO"
  );
  assert.equal(
    compareDataCenterMetric({ value: 10 }, null, { comparison: "relative" }).reasonCode,
    "PREVIOUS_RESULT_NOT_AVAILABLE"
  );
  assert.equal(
    compareDataCenterMetric(
      { value: 10, coverageRate: 1 },
      { value: 8, coverageRate: 0.8 },
      { comparison: "relative" }
    ).reasonCode,
    "PREVIOUS_DATA_NOT_COVERED"
  );
});
