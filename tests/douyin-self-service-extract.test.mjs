import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_METRIC_VALUES,
  EXTRACT_METRICS,
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

test("时间粒度必须是自然日累计", () => {
  // 统计日期累计给的是区间合计，无法还原到业务日；一行一天才能入库。
  assert.equal(buildExtractPlan({ resourceType: "live_daily", from: "2026-07-25", to: "2026-07-29" }).granularity, "自然日累计");
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

test("指标按语义化 value 选择，不按标签文字", () => {
  // 文案随时可能改，value 是接口字段名，稳定得多。
  assert.equal(EXTRACT_METRICS.transactionOrderCount, "pay_cnt");
  assert.equal(EXTRACT_METRICS.transactionBuyerCount, "pay_ucnt");
  assert.ok(DEFAULT_METRIC_VALUES.includes("ad_receive_amt"), "默认应带上投放金额，它是支出与广告费用的来源");
});

test("默认指标覆盖已撤下的订单数与人数", () => {
  // 这两个指标因 store_daily 抓错已从面板撤下（曾显示 314 万单、257 万人，
  // 实际 GMV 仅 6.5 万）。罗盘首页接口不返回它们，自助取数是已知唯一可信来源，
  // 因此必须默认取到，否则面板永远补不回这两列。
  assert.ok(DEFAULT_METRIC_VALUES.includes("pay_cnt"));
  assert.ok(DEFAULT_METRIC_VALUES.includes("pay_ucnt"));
});
