import assert from "node:assert/strict";
import test from "node:test";
import {
  TASK_STATUS,
  assertConfigSupportsPlan,
  configQuery,
  parseExtractConfig,
  buildSubmitPayload,
  dayEndSeconds,
  dayStartSeconds,
  parseTaskList,
  selectApiTask
} from "../src/domain/douyinExtractApi.js";
import { buildExtractPlan } from "../src/domain/douyinSelfServiceExtract.js";

// 抓包实测的一行（2026-07-30）：列表每格都裹三层。
function cell(field, value) {
  return { [field]: { [`${field}_value`]: { cell_type: 1, value: { unit: 1, value_str: value } } } };
}

function row({ name, status, rank = "", id = "7668268096463781889" }) {
  return {
    cell_info: {
      ...cell("task_id", id),
      ...cell("task_name", name),
      ...cell("task_status", status),
      ...cell("pending_rank", rank),
      ...cell("download_url", `https://compass.jinritemai.com/data_factory/download_file?task_id=${id}`),
      ...cell("create_time", "2026/07/30 18:36:36")
    }
  };
}

test("时间戳按 Asia/Shanghai 自然日边界，不看运行机器的时区", () => {
  // 抓包实测 begin=1784908800 端点为 2026-07-25 00:00:00+08:00，
  // end=1785340799 端点为 2026-07-29 23:59:59+08:00。
  assert.equal(dayStartSeconds("2026-07-25"), 1784908800);
  assert.equal(dayEndSeconds("2026-07-29"), 1785340799);
});

test("提交载荷与抓包一致，字段取自各维度的登记表", () => {
  const plan = buildExtractPlan({ resourceType: "store_daily", from: "2026-07-25", to: "2026-07-29" });
  assert.deepEqual(buildSubmitPayload(plan), {
    main_dimension: "shop",
    main_metrics: ["1"],
    metrics: ["income_amt", "pay_amt", "pay_cnt", "pay_ucnt", "net_income_amt", "ad_receive_amt", "ad_receive_amt_ratio"],
    begin_date: 1784908800,
    end_date: 1785340799,
    date_type: "day",
    video_type: "",
    name: "采集-shop-20260725-20260729"
  });
});

test("指标分类编号按维度取，直播与短视频的成交不是 1", () => {
  // 它们的 1 是「基础信息」，只用 1 会取回一堆达人 ID 而不是成交数据，且不会报错。
  assert.deepEqual(buildExtractPlan({ resourceType: "store_daily", from: "2026-07-30", to: "2026-07-30" }).metricCategories, ["1"]);
  assert.deepEqual(buildExtractPlan({ resourceType: "live_daily", from: "2026-07-30", to: "2026-07-30" }).metricCategories, ["1", "2"]);
});

test("列表解析逐格取值，不猜结构", () => {
  const rows = parseTaskList({ data: [row({ name: "采集-shop-20260725-20260729", status: "0", rank: "3/4" })] });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].taskName, "采集-shop-20260725-20260729");
  assert.equal(rows[0].statusCode, "0");
  assert.equal(rows[0].pendingRank, "3/4");
  assert.match(rows[0].downloadUrl, /task_id=\d+/);
});

test("排队中的任务不能当完成——它同样带着下载地址", () => {
  // 这是最要命的一条：刚建好、排队 3/4 的任务，列表里 download_url 就已经有了。
  // 拿地址判完成会下回半成品，而半成品入库后看起来和真数一模一样。
  const rows = parseTaskList({ data: [row({ name: "甲", status: TASK_STATUS.QUEUED, rank: "3/4" })] });
  const found = selectApiTask(rows, "甲");
  assert.equal(found.state, "pending");
  assert.match(found.status, /排队中/);
  assert.match(found.downloadUrl, /task_id=\d+/, "地址确实在，但不足以判定完成");
});

test("只有状态码 2 算完成，未知码继续等并带上原始码", () => {
  // 0=排队中、1=取数中、2=取数完成，都是逐个拿页面中文状态标定的；
  // 失败码从未遇到过，没见过就不假装知道。
  assert.equal(selectApiTask(parseTaskList({ data: [row({ name: "甲", status: "2" })] }), "甲").state, "ready");
  const 取数中 = selectApiTask(parseTaskList({ data: [row({ name: "甲", status: "1" })] }), "甲");
  assert.equal(取数中.state, "pending");
  assert.match(取数中.status, /取数中/);
  const unknown = selectApiTask(parseTaskList({ data: [row({ name: "甲", status: "9" })] }), "甲");
  assert.equal(unknown.state, "pending");
  assert.match(unknown.status, /未知状态码 9/);
});

test("按名称精确回找，队列里别人的任务不能串", () => {
  const rows = parseTaskList({ data: [row({ name: "别人的任务", status: "2" }), row({ name: "甲", status: "0" })] });
  assert.equal(selectApiTask(rows, "甲").state, "pending");
  assert.equal(selectApiTask(rows, "不存在").state, "missing");
});

// 平台配置接口的真实形状（2026-07-31 抓取，指标挂在 childrens，平台拼写如此）。
function config({ dates = ["all", "day", "week", "month"], groups = { 1: ["income_amt", "pay_amt", "pay_cnt", "pay_ucnt", "net_income_amt", "ad_receive_amt", "ad_receive_amt_ratio"] } } = {}) {
  return {
    data: {
      date_type: dates.map(key => ({ key, label: key })),
      metrics: Object.entries(groups).map(([key, metrics]) => ({
        key, label: key, childrens: metrics.map(m => ({ key: m, label: m, childrens: [] }))
      }))
    }
  };
}

test("配置接口按维度与粒度取，参数与抓包一致", () => {
  const plan = buildExtractPlan({ resourceType: "live_daily", from: "2026-07-30", to: "2026-07-30" });
  assert.equal(
    configQuery(plan),
    "/data_factory/download/config?main_dimension=live&dimensions=&date_type=live_start_date&video_type=&edition=2"
  );
});

test("平台还给这些就放行", () => {
  const plan = buildExtractPlan({ resourceType: "store_daily", from: "2026-07-30", to: "2026-07-30" });
  assert.equal(assertConfigSupportsPlan(parseExtractConfig(config()), plan), true);
});

test("指标被平台下掉就当场拒绝，并说清是哪一个", () => {
  // 少一个指标就是导出文件里少一列，落到事实表里是一个静默的 null。
  // 宁可不提交，也不要排完二十分钟队才发现。
  const plan = buildExtractPlan({ resourceType: "store_daily", from: "2026-07-30", to: "2026-07-30" });
  const 少了成交人数 = config({ groups: { 1: ["income_amt", "pay_amt", "pay_cnt", "net_income_amt", "ad_receive_amt", "ad_receive_amt_ratio"] } });
  assert.throws(
    () => assertConfigSupportsPlan(parseExtractConfig(少了成交人数), plan),
    error => error.code === "DOUYIN_EXTRACT_CONFIG_DRIFTED" && /pay_ucnt/.test(error.message)
  );
});

test("粒度被平台下掉也当场拒绝", () => {
  const plan = buildExtractPlan({ resourceType: "store_daily", from: "2026-07-30", to: "2026-07-30" });
  assert.throws(
    () => assertConfigSupportsPlan(parseExtractConfig(config({ dates: ["all", "week", "month"] })), plan),
    error => error.code === "DOUYIN_EXTRACT_CONFIG_DRIFTED" && /自然日|day/.test(error.message)
  );
});

test("整个分类没了时只报分类，不刷一屏指标", () => {
  const plan = buildExtractPlan({ resourceType: "store_daily", from: "2026-07-30", to: "2026-07-30" });
  try {
    assertConfigSupportsPlan(parseExtractConfig(config({ groups: { 9: ["x"] } })), plan);
    assert.fail("应当拒绝");
  } catch (error) {
    assert.equal(error.code, "DOUYIN_EXTRACT_CONFIG_DRIFTED");
    assert.match(error.message, /指标分类 1 已不存在/);
    assert.equal(/income_amt/.test(error.message), false, "分类没了就别再逐个指标报");
  }
});
