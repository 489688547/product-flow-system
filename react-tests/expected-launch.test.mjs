import test from "node:test";
import assert from "node:assert/strict";
import {
  expectedLaunchMonthOptions,
  formatExpectedLaunchMonth,
  isSelectableExpectedLaunchMonth,
  normalizeExpectedLaunchMonth
} from "../src/domain/expectedLaunch.js";

test("expected launch month options start with the current month and never include past months", () => {
  const now = new Date("2026-07-16T08:00:00+08:00");
  assert.deepEqual(expectedLaunchMonthOptions(now, 3).map(option => option.value), ["2026-07", "2026-08", "2026-09"]);
  assert.equal(isSelectableExpectedLaunchMonth("2026-06", now), false);
  assert.equal(isSelectableExpectedLaunchMonth("2026-07", now), true);
  assert.equal(isSelectableExpectedLaunchMonth("2027-01", now), true);
});

test("expected launch months normalize and render as Chinese calendar months", () => {
  assert.equal(normalizeExpectedLaunchMonth("2026-08"), "2026-08");
  assert.equal(normalizeExpectedLaunchMonth("2026-13"), "");
  assert.equal(formatExpectedLaunchMonth("2026-08"), "2026年8月");
  assert.equal(formatExpectedLaunchMonth(""), "未填写");
});
