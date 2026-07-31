import assert from "node:assert/strict";
import test from "node:test";
import {
  TASK_STATUS,
  assertConfigSupportsPlan,
  assertPreviewCovers,
  configQuery,
  parseExtractConfig,
  selectMetrics,
  buildSubmitPayload,
  dayEndSeconds,
  dayStartSeconds,
  parseTaskList,
  selectApiTask
} from "../src/domain/douyinExtractApi.js";
import { buildExtractPlan } from "../src/domain/douyinSelfServiceExtract.js";
import { PREVIEW_REQUIRED_COLUMNS } from "../src/domain/douyinExtractRows.js";

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
  const selection = { categories: ["1", "2", "3", "5"], metrics: ["income_amt", "pay_amt", "pay_cnt", "pay_ucnt", "net_income_amt", "ad_receive_amt", "ad_receive_amt_ratio"] };
  assert.deepEqual(buildSubmitPayload(plan, selection), {
    main_dimension: "shop",
    main_metrics: ["1", "2", "3", "5"],
    metrics: ["income_amt", "pay_amt", "pay_cnt", "pay_ucnt", "net_income_amt", "ad_receive_amt", "ad_receive_amt_ratio"],
    begin_date: 1784908800,
    end_date: 1785340799,
    date_type: "day",
    video_type: "",
    name: "采集-shop-20260725-20260729"
  });
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

// 指标改成「店铺/商品全选、直播/短视频选定」后，分类编号与指标存在性的把关都移到了
// selectMetrics，配置核对只剩粒度一项——见下方 selectMetrics 的用例。
test("平台还给这些就放行", () => {
  const plan = buildExtractPlan({ resourceType: "store_daily", from: "2026-07-30", to: "2026-07-30" });
  assert.equal(assertConfigSupportsPlan(parseExtractConfig(config()), plan), true);
});


test("粒度被平台下掉也当场拒绝", () => {
  const plan = buildExtractPlan({ resourceType: "store_daily", from: "2026-07-30", to: "2026-07-30" });
  assert.throws(
    () => assertConfigSupportsPlan(parseExtractConfig(config({ dates: ["all", "week", "month"] })), plan),
    error => error.code === "DOUYIN_EXTRACT_CONFIG_DRIFTED" && /自然日|day/.test(error.message)
  );
});


test("店铺与商品全选指标，直播与短视频只能选定", () => {
  // 直播/短视频全选会把「基础信息」里的达人字段带上，行的身份就从直播间/短视频
  // 变成达人——preview 实测全选后列里根本没有「直播间ID」。那不是少一列，
  // 是整张表的含义变了。
  const 全 = parseExtractConfig(config({ groups: { 1: ["a", "b"], 2: ["c"] } }));
  assert.deepEqual(selectMetrics(全, "shop"), { categories: ["1", "2"], metrics: ["a", "b", "c"] });

  const 直播配置 = parseExtractConfig(config({
    dates: ["live_start_date"],
    groups: { 1: ["live_start_ts", "author_id", "nickname"], 2: ["live_room_pay_amt", "live_room_pay_cnt", "live_room_pay_ucnt", "live_room_pay_combo_cnt"] }
  }));
  const 直播 = selectMetrics(直播配置, "live");
  assert.equal(直播.metrics.includes("author_id"), false, "达人字段会把行的身份换掉");
  assert.ok(直播.metrics.includes("live_start_ts"), "开播时间必须要，业务日靠它归集");
});

test("选定集里的指标被平台下掉时当场拒绝", () => {
  const 少了开播时间 = parseExtractConfig(config({
    dates: ["live_start_date"],
    groups: { 1: ["author_id"], 2: ["live_room_pay_amt", "live_room_pay_cnt", "live_room_pay_ucnt", "live_room_pay_combo_cnt"] }
  }));
  assert.throws(
    () => selectMetrics(少了开播时间, "live"),
    error => error.code === "DOUYIN_EXTRACT_CONFIG_DRIFTED" && /live_start_ts/.test(error.message)
  );
});

test("preview 只核对指标列，身份列另有把关", () => {
  // preview 报的不是导出文件的完整表头：实测直播导出有「直播间ID」而 preview 没有，
  // 反过来 preview 有「日期」而文件里没有。让一道检查假装管两件事，
  // 就会像今天这样：直播明明是好的，却被判成「缺少必需列」。
  const 直播列 = [
    { key: "date_range", label: "统计日期" },
    { key: "live_start_ts", label: "直播开始时间" },
    { key: "live_room_pay_amt", label: "用户支付金额" },
    { key: "live_room_pay_cnt", label: "成交订单数" }
  ];
  assert.equal(assertPreviewCovers(直播列, "live", PREVIEW_REQUIRED_COLUMNS.live), true);
  assert.equal(PREVIEW_REQUIRED_COLUMNS.live.includes("直播间ID"), false);

  assert.throws(
    () => assertPreviewCovers(直播列.slice(0, 2), "live", PREVIEW_REQUIRED_COLUMNS.live),
    error => error.code === "DOUYIN_EXTRACT_COLUMNS_DRIFTED" && /成交订单数/.test(error.message)
  );
});
