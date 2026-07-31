import assert from "node:assert/strict";
import test from "node:test";

import {
  WEB_COLLECTION_STATES,
  assertWebCollectionTransition,
  createDailyPlan,
  nextCursorForSuccessfulJob,
  notificationIntents,
  webCollectionRetryDecision,
  webCollectionJobKey
} from "../src/domain/webCollection.js";
import { WEB_COLLECTION_ADAPTERS } from "../scripts/web-data-collector/providers/index.mjs";

const kuaimai = {
  id: "kuaimai",
  enabled: true,
  resources: [
    { type: "orders", rangeKind: "daily_fact", scheduleVersion: "v1" },
    { type: "order_items", rangeKind: "daily_fact", scheduleVersion: "v1" },
    { type: "inventory", rangeKind: "current_snapshot", scheduleVersion: "v2" }
  ]
};

test("daily plan waits until 05:00 Shanghai time", () => {
  assert.deepEqual(createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T09:59:59+08:00" }), []);
});

test("daily plan creates yesterday facts and current snapshots after 10:00", () => {
  const plan = createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T10:01:00+08:00" });
  assert.deepEqual(plan.map(job => [job.resourceType, job.businessDate, job.rangeKind]), [
    ["orders", "2026-07-21", "daily_fact"],
    ["order_items", "2026-07-21", "daily_fact"],
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
  const first = createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T10:01:00+08:00" });
  const late = createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T12:30:00+08:00" });
  assert.deepEqual(late.map(webCollectionJobKey), first.map(webCollectionJobKey));
});

test("store-scoped adapters create isolated daily jobs for every registered store", () => {
  const douyin = {
    id: "douyin-ecommerce",
    stores: [{ id: "store-a" }, { id: "store-b" }],
    resources: [{ type: "product_daily", rangeKind: "daily_fact", scheduleVersion: "v1" }]
  };
  const plan = createDailyPlan({ adapters: [douyin], now: "2026-07-22T10:01:00+08:00" });

  assert.deepEqual(plan.map(job => [job.storeId, job.businessDate]), [
    ["store-a", "2026-07-21"],
    ["store-b", "2026-07-21"]
  ]);
  assert.deepEqual(plan.map(webCollectionJobKey), [
    "douyin-ecommerce:store-a:product_daily:2026-07-21:v1",
    "douyin-ecommerce:store-b:product_daily:2026-07-21:v1"
  ]);
});

test("disabled adapters and resources are not scheduled", () => {
  const plan = createDailyPlan({
    adapters: [
      { ...kuaimai, enabled: false },
      { ...kuaimai, id: "active", resources: [{ ...kuaimai.resources[0], enabled: false }] }
    ],
    now: "2026-07-22T10:01:00+08:00"
  });
  assert.deepEqual(plan, []);
});

test("transient failures retry after bounded backoff while human states and exhausted jobs stop", () => {
  const now = new Date("2026-07-23T10:00:00.000Z");
  assert.deepEqual(webCollectionRetryDecision({
    status: "failed",
    attempt: 1,
    errorCode: "EXTENSION_DOWNLOAD_TIMEOUT",
    updatedAt: "2026-07-23T09:54:59.000Z"
  }, { now }), { retry: true, delayMinutes: 5 });
  assert.deepEqual(webCollectionRetryDecision({
    status: "failed",
    attempt: 2,
    errorCode: "WEB_COLLECTION_LOCAL_PROCESSING_FAILED",
    updatedAt: "2026-07-23T09:50:00.000Z"
  }, { now }), { retry: false, delayMinutes: 15 });
  assert.deepEqual(webCollectionRetryDecision({
    status: "failed",
    attempt: 3,
    errorCode: "EXTENSION_DOWNLOAD_TIMEOUT",
    updatedAt: "2026-07-23T09:00:00.000Z"
  }, { now }), { retry: false, delayMinutes: null });
  assert.deepEqual(webCollectionRetryDecision({
    status: "waiting_human",
    attempt: 1,
    errorCode: "KUAIMAI_LOGIN_REQUIRED",
    updatedAt: "2026-07-23T09:00:00.000Z"
  }, { now }), { retry: false, delayMinutes: null });
});

test("a repaired sales adapter publishes a new schedule version instead of mutating old failed jobs", () => {
  const plan = createDailyPlan({ adapters: WEB_COLLECTION_ADAPTERS, now: "2026-07-23T10:01:00+08:00" });
  const sales = plan.find(job => job.resourceType === "sales_items");
  assert.equal(sales.scheduleVersion, "v3");
  assert.equal(sales.idempotencyKey, "kuaimai:sales_items:2026-07-22:v3");
});

test("Kuaimai daily plan includes all three current product snapshots", () => {
  const plan = createDailyPlan({ adapters: WEB_COLLECTION_ADAPTERS, now: "2026-07-24T10:01:00+08:00" });
  assert.deepEqual(
    plan
      .filter(job => ["products", "product_kits", "product_combinations"].includes(job.resourceType))
      .map(job => [job.resourceType, job.businessDate, job.rangeKind]),
    [
      ["products", "2026-07-24", "current_snapshot"],
      ["product_kits", "2026-07-24", "current_snapshot"],
      ["product_combinations", "2026-07-24", "current_snapshot"]
    ]
  );
});

test("Kuaimai daily plan includes the current inventory snapshot after 10:00", () => {
  const before = createDailyPlan({
    adapters: WEB_COLLECTION_ADAPTERS,
    now: "2026-07-26T09:59:59+08:00"
  });
  const after = createDailyPlan({
    adapters: WEB_COLLECTION_ADAPTERS,
    now: "2026-07-26T10:00:00+08:00"
  });

  assert.equal(before.some(job => job.resourceType === "inventory"), false);
  assert.deepEqual(
    after
      .filter(job => job.resourceType === "inventory")
      .map(job => [job.businessDate, job.rangeKind, job.scheduleVersion]),
    [["2026-07-26", "current_snapshot", "v1"]]
  );
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
  const job = createDailyPlan({ adapters: [kuaimai], now: "2026-07-22T10:01:00+08:00" })[0];
  assert.equal(nextCursorForSuccessfulJob({ ...job, status: "failed" }, { id: "run-1" }), null);
  assert.deepEqual(nextCursorForSuccessfulJob({ ...job, id: "job-1", status: "success" }, {
    id: "run-2",
    batchId: "batch-1",
    completedAt: "2026-07-22T05:20:00.000Z"
  }), {
    providerId: "kuaimai",
    storeId: "",
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

test("failure notifications remain isolated by store", () => {
  const jobs = ["store-a", "store-b"].map((storeId, index) => ({
    id: `job-${index}`,
    providerId: "douyin-ecommerce",
    storeId,
    resourceType: "product_daily",
    businessDate: "2026-07-23",
    status: "failed",
    stage: "exporting",
    errorCode: "DOUYIN_EXPORT_TIMEOUT"
  }));
  const intents = notificationIntents({ jobs, now: "2026-07-24T05:30:00+08:00" });

  assert.equal(intents.length, 2);
  assert.equal(new Set(intents.map(item => item.dedupeKey)).size, 2);
  assert.deepEqual(intents.map(item => item.storeId), ["store-a", "store-b"]);
});

test("每日排程不得早于上午 10 点", () => {
  // 凌晨采集会拿到半成品。快麦销售主题报表虽标称 T+1，但清晨聚合尚未完成：
  // 2026-07-29 同一业务日、同一套代码、同一个采集器，05:07 采到 188 行 ¥8,880，
  // 11:55 重采得到 549 行 ¥129,223，只差采集时间。
  // 半成品最危险的地方是任务显示成功——缺数看得见，半成品会被当成真数。
  const 上午九点 = createDailyPlan({ adapters: WEB_COLLECTION_ADAPTERS, now: "2026-07-26T09:59:59+08:00" });
  assert.deepEqual(上午九点, [], "10 点之前不得排程，上游聚合可能还没完成");

  const 上午十点 = createDailyPlan({ adapters: WEB_COLLECTION_ADAPTERS, now: "2026-07-26T10:00:00+08:00" });
  assert.ok(上午十点.length > 0, "10 点起应正常排程");
});

test("抖音日事实标记走自助取数，其它保持原样", () => {
  // 逐页导出拿不到成交订单数与成交人数，页面标签又抓错过；
  // 自助取数是这两项目前已知的唯一可信来源。
  const plan = createDailyPlan({
    now: new Date("2026-07-30T12:00:00+08:00"),
    adapters: [
      {
        id: "douyin-ecommerce",
        storeId: "90862283",
        resources: [
          { type: "store_daily", rangeKind: "daily_fact" },
          { type: "product_list", rangeKind: "current_snapshot" }
        ]
      },
      { id: "kuaimai", storeId: "1", resources: [{ type: "sales_items", rangeKind: "daily_fact" }] }
    ]
  });
  const 抖音日事实 = plan.find(job => job.providerId === "douyin-ecommerce" && job.resourceType === "store_daily");
  const 抖音快照 = plan.find(job => job.resourceType === "product_list");
  const 快麦 = plan.find(job => job.providerId === "kuaimai");
  assert.equal(抖音日事实.viaSelfService, true);
  assert.equal("viaSelfService" in 抖音快照, false, "快照类不走自助取数");
  assert.equal("viaSelfService" in 快麦, false, "别的平台不受影响");
});
