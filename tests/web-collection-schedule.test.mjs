import assert from "node:assert/strict";
import test from "node:test";

import {
  WEB_COLLECTION_STATES,
  assertWebCollectionTransition,
  createDailyPlan,
  nextCursorForSuccessfulJob,
  notificationIntents,
  webCollectionJobKey
} from "../src/domain/webCollection.js";

const kuaimai = {
  id: "kuaimai",
  enabled: true,
  resources: [
    { type: "orders", rangeKind: "daily_fact", scheduleVersion: "v1" },
    { type: "sales_items", rangeKind: "daily_fact", scheduleVersion: "v1" },
    { type: "inventory", rangeKind: "current_snapshot", scheduleVersion: "v2" }
  ]
};

test("daily plan waits until 05:00 Shanghai time", () => {
  assert.deepEqual(createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T04:59:59+08:00" }), []);
});

test("daily plan creates yesterday facts and current snapshots after 05:00", () => {
  const plan = createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T05:01:00+08:00" });
  assert.deepEqual(plan.map(job => [job.resourceType, job.businessDate, job.rangeKind]), [
    ["orders", "2026-07-21", "daily_fact"],
    ["sales_items", "2026-07-21", "daily_fact"],
    ["inventory", "2026-07-22", "current_snapshot"]
  ]);
  assert.deepEqual(plan[0].range, {
    start: "2026-07-21T00:00:00+08:00",
    end: "2026-07-21T23:59:59+08:00",
    timeZone: "Asia/Shanghai"
  });
  assert.equal(webCollectionJobKey(plan[0]), "kuaimai:orders:2026-07-21:v1");
});

test("late Mac startup produces the same idempotent catch-up plan", () => {
  const first = createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T05:01:00+08:00" });
  const late = createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T12:30:00+08:00" });
  assert.deepEqual(late.map(webCollectionJobKey), first.map(webCollectionJobKey));
});

test("disabled adapters and resources are not scheduled", () => {
  const plan = createDailyPlan({
    adapters: [
      { ...kuaimai, enabled: false },
      { ...kuaimai, id: "active", resources: [{ ...kuaimai.resources[0], enabled: false }] }
    ],
    now: "2026-07-22T05:01:00+08:00"
  });
  assert.deepEqual(plan, []);
});

test("state transitions reject skipped stages and terminal recovery", () => {
  assert.equal(WEB_COLLECTION_STATES.includes("waiting_human"), true);
  assert.equal(assertWebCollectionTransition("queued", "claimed"), true);
  assert.equal(assertWebCollectionTransition("opening", "waiting_human"), true);
  assert.equal(assertWebCollectionTransition("waiting_human", "queued"), true);
  assert.throws(() => assertWebCollectionTransition("queued", "success"), /非法采集状态转换/);
  assert.throws(() => assertWebCollectionTransition("success", "queued"), /非法采集状态转换/);
});

test("only a successful run advances the resource cursor", () => {
  const job = createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T05:01:00+08:00" })[0];
  assert.equal(nextCursorForSuccessfulJob({ ...job, status: "failed" }, { id: "run-1" }), null);
  assert.deepEqual(nextCursorForSuccessfulJob({ ...job, id: "job-1", status: "success" }, {
    id: "run-2",
    batchId: "batch-1",
    completedAt: "2026-07-22T05:20:00.000Z"
  }), {
    providerId: "kuaimai",
    resourceType: "orders",
    businessDate: "2026-07-21",
    jobId: "job-1",
    runId: "run-2",
    batchId: "batch-1",
    completedAt: "2026-07-22T05:20:00.000Z"
  });
});

test("notifications emit first failure once and one 06:30 summary", () => {
  const jobs = [
    { id: "job-1", providerId: "kuaimai", resourceType: "orders", businessDate: "2026-07-21", status: "failed", stage: "exporting", errorCode: "DOWNLOAD_TIMEOUT" },
    { id: "job-2", providerId: "kuaimai", resourceType: "inventory", businessDate: "2026-07-22", status: "waiting_human", stage: "opening", errorCode: "LOGIN_REQUIRED" }
  ];
  const first = notificationIntents({ jobs, now: "2026-07-22T05:30:00+08:00" });
  assert.deepEqual(first.map(item => item.kind), ["failure", "failure"]);
  const sent = first.map(item => ({ dedupeKey: item.dedupeKey }));
  assert.deepEqual(notificationIntents({ jobs, notifications: sent, now: "2026-07-22T05:45:00+08:00" }), []);
  const summary = notificationIntents({ jobs, notifications: sent, now: "2026-07-22T06:30:00+08:00" });
  assert.equal(summary.length, 1);
  assert.equal(summary[0].kind, "daily_summary");
  assert.equal(summary[0].count, 2);
  assert.match(summary[0].dedupeKey, /^2026-07-22:daily-summary$/);
});

