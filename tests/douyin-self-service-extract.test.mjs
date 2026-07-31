import assert from "node:assert/strict";
import test from "node:test";
import {
  DIMENSIONS_PENDING_METRICS,
  GRANULARITY_BY_DIMENSION,
  METRICS_BY_DIMENSION,
  MAX_RANGE_DAYS,
  PRIMARY_DIMENSIONS,
  TASK_TIMEOUT_MS,
  buildExtractPlan,
  buildTaskName,
  planExtractWait,
  selectExtractTask,
  splitExtractRange
} from "../src/domain/douyinSelfServiceExtract.js";

test("四个资源都登记了主要维度", () => {
  assert.deepEqual(PRIMARY_DIMENSIONS, {
    store_daily: "shop", product_daily: "product", live_daily: "live", video_daily: "video"
  });
});

test("粒度登记 value 而不只是文案：回读 checked 才能确认真选中了", () => {
  assert.equal(GRANULARITY_BY_DIMENSION.shop.value, "day");
  assert.equal(GRANULARITY_BY_DIMENSION.live.value, "live_start_date");
  assert.equal(buildExtractPlan({ resourceType: "live_daily", from: "2026-07-29", to: "2026-07-29" }).granularityValue, "live_start_date");
});

test("时间粒度随维度取值，不能一律用自然日累计", () => {
  // 四个维度的粒度选项并不通用（2026-07-30 在专用浏览器逐个实测）：
  // 店铺/商品有自然日累计，直播只有开播日期累计与分钟级，短视频只有挂车/非挂车/统计日期累计。
  // 原先写死自然日累计，直播与短视频根本没有该选项，报的却是 GRANULARITY_MISSING，
  // 与真正原因隔了好几步。
  assert.equal(buildExtractPlan({ resourceType: "store_daily", from: "2026-07-25", to: "2026-07-29" }).granularity, "自然日累计");
  assert.equal(GRANULARITY_BY_DIMENSION.product.label, "自然日累计"); // 商品的指标尚未实测，只断言粒度登记
  assert.equal(buildExtractPlan({ resourceType: "live_daily", from: "2026-07-25", to: "2026-07-29" }).granularity, "开播日期累计");
  assert.equal(buildExtractPlan({ resourceType: "video_daily", from: "2026-07-29", to: "2026-07-29" }).granularity, "统计日期累计");
});

test("短视频跨天必须拒绝：它只有区间合计粒度", () => {
  // 跨多天会把几天混成一行，无法还原到业务日——落库后就是一天的数字冒充多天。
  assert.throws(
    () => buildExtractPlan({ resourceType: "video_daily", from: "2026-07-25", to: "2026-07-29" }),
    error => error.code === "DOUYIN_EXTRACT_SINGLE_DAY_REQUIRED"
  );
  assert.doesNotThrow(() => buildExtractPlan({ resourceType: "video_daily", from: "2026-07-29", to: "2026-07-29" }));
});

test("任务名称可回找，且区分资源与区间", () => {
  // 任务列表只有名称、创建人、状态、创建日期四列，没有业务字段，
  // 靠名称回找是唯一可行的关联方式。
  assert.equal(buildTaskName({ resourceType: "live_daily", from: "2026-07-25", to: "2026-07-29" }), "采集-live-20260725-20260729");
  assert.notEqual(
    buildTaskName({ resourceType: "live_daily", from: "2026-07-25", to: "2026-07-29" }),
    buildTaskName({ resourceType: "video_daily", from: "2026-07-25", to: "2026-07-29" })
  );
});

test("超过单次上限的区间直接拒绝，不发起注定失败的任务", () => {
  assert.throws(
    () => buildExtractPlan({ resourceType: "store_daily", from: "2026-01-01", to: "2026-07-29" }),
    error => error.code === "DOUYIN_EXTRACT_RANGE_TOO_LONG"
  );
});

test("长区间按上限切段，段间不重不漏", () => {
  const segments = splitExtractRange({ from: "2026-01-01", to: "2026-07-29" });
  assert.ok(segments.length > 1);
  assert.equal(segments[0].from, "2026-01-01");
  assert.equal(segments.at(-1).to, "2026-07-29");
  for (let i = 1; i < segments.length; i += 1) {
    const prevEnd = Date.parse(`${segments[i - 1].to}T00:00:00Z`);
    const thisStart = Date.parse(`${segments[i].from}T00:00:00Z`);
    assert.equal(thisStart - prevEnd, 86400000, "段之间必须正好衔接一天，不重不漏");
  }
  for (const seg of segments) {
    const span = Math.round((Date.parse(`${seg.to}T00:00:00Z`) - Date.parse(`${seg.from}T00:00:00Z`)) / 86400000) + 1;
    assert.ok(span <= MAX_RANGE_DAYS, `段长 ${span} 天超过上限`);
  }
});

test("按任务名称回找，绝不取最新一条", () => {
  // 全平台队列里随时有别人的任务，取最新会拿错别人的结果。
  const rows = [
    { taskName: "别人的任务", status: "取数完成" },
    { taskName: "采集-live-20260725-20260729", status: "排队中 12/78" }
  ];
  assert.deepEqual(selectExtractTask(rows, "采集-live-20260725-20260729"), { state: "pending", status: "排队中12/78" });
  assert.deepEqual(selectExtractTask(rows, "不存在的任务"), { state: "missing" });
});

test("取数完成才下载，失败明确区分", () => {
  assert.equal(selectExtractTask([{ taskName: "A", status: "取数完成" }], "A").state, "ready");
  assert.equal(selectExtractTask([{ taskName: "A", status: "取数失败" }], "A").state, "failed");
});

test("超时说明是队列繁忙而非需要改代码", () => {
  const wait = planExtractWait({ startedAt: 0, now: TASK_TIMEOUT_MS + 1, state: "pending", status: "排队中 60/78" });
  assert.equal(wait.action, "fail");
  assert.equal(wait.errorCode, "DOUYIN_EXTRACT_TIMEOUT");
  assert.match(wait.message, /稍后重试/);
});

test("未超时继续等，不重复创建任务", () => {
  // 队列全平台共用，把还在排队的任务判成失败再重建，只会让队列更长。
  assert.deepEqual(planExtractWait({ startedAt: 0, now: 60_000, state: "pending" }), { action: "wait" });
});

test("指标按维度登记，直播与短视频不得冒充成交金额", () => {
  // 同名指标在不同维度下 value 不同；更要紧的是直播与短视频没有「成交金额」，
  // 只有「用户支付金额」，两者口径不同，混填会造出看起来权威的错值。
  assert.equal(METRICS_BY_DIMENSION.shop.metrics.transactionOrderCount, "pay_cnt");
  assert.equal(METRICS_BY_DIMENSION.live.metrics.transactionOrderCount, "live_room_pay_cnt");
  assert.equal(METRICS_BY_DIMENSION.video.metrics.transactionOrderCount, "video_pay_cnt");
  assert.equal("transactionAmount" in METRICS_BY_DIMENSION.live.metrics, false);
  assert.equal("transactionAmount" in METRICS_BY_DIMENSION.video.metrics, false);
});

test("店铺仍带上成交人数与投放金额：它们是面板撤下指标的唯一可信来源", () => {
  const plan = buildExtractPlan({ resourceType: "store_daily", from: "2026-07-29", to: "2026-07-29" });
  assert.ok(plan.metricValues.includes("pay_ucnt"));
  assert.ok(plan.metricValues.includes("ad_receive_amt"), "投放金额是支出与广告费用的来源");
  assert.equal(plan.metricCategory, "成交");
});

test("未实测的维度必须拒绝取数，不能凭猜测下单", () => {
  // 商品维度的成交分类当时点不动（点击落在 label 空白处），指标没取到。
  // 猜一组 value 不会报错，只会采回错位的数字。
  assert.ok(DIMENSIONS_PENDING_METRICS.includes("product"));
  assert.throws(
    () => buildExtractPlan({ resourceType: "product_daily", from: "2026-07-29", to: "2026-07-29" }),
    error => error.code === "DOUYIN_EXTRACT_METRICS_UNVERIFIED"
  );
});
