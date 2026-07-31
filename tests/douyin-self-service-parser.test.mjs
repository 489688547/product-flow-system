import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readDouyinSelfServiceReport } from "../scripts/web-data-collector/providers/douyin/parser.mjs";

const SHOP_HEADER = ["统计日期", "日期", "店铺名称", "成交金额", "用户支付金额", "成交订单数", "成交人数"];
const LIVE_HEADER = ["统计日期", "直播间ID", "直播间名称", "店铺名称", "直播开始时间", "用户支付金额", "成交订单数", "成交人数"];
const 参数 = { resourceType: "store_daily", businessDate: "2026-07-30", storeId: "90862283" };

async function csv(rows, name = "采集-shop-20260730-20260730.csv") {
  const dir = await mkdtemp(join(tmpdir(), "douyin-self-service-"));
  const path = join(dir, name);
  await writeFile(path, rows.map(row => row.join(",")).join("\n"), "utf8");
  return path;
}

test("店铺：按「日期」列定业务日，不碰「统计日期」", async () => {
  // 逐页导出那套别名匹配把「统计日期」也当日期别名，而这里它是区间 20260730-20260730。
  // 先命中谁用谁的话，业务日会变成一段区间字符串，而且不会报错。
  // 数值取自 2026-07-30 真实下载到的文件。
  const file = await csv([SHOP_HEADER, ["20260730-20260730", "20260730", "TIYES", "65449.76", "60342.64", "3265", "2676"]]);
  const result = await readDouyinSelfServiceReport(file, 参数);
  assert.equal(result.reportVersion, "douyin-self-service-v1");
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].businessDate, "2026-07-30");
  assert.equal(result.facts[0].transactionOrderCount, 3265);
  assert.equal(result.facts[0].transactionBuyerCount, 2676);
});

test("文件里混进别的业务日就整批拒绝", async () => {
  // 「返回了数据」不等于「返回了这一天的数据」。
  const file = await csv([SHOP_HEADER, ["20260729-20260730", "20260729", "TIYES", "1", "1", "1", "1"]]);
  await assert.rejects(readDouyinSelfServiceReport(file, 参数));
});

test("直播：一行一场，按开播时间归业务日，不合并", async () => {
  // live_daily 的事实以 liveSessionId 为身份，合并成一条日事实就没有身份了，
  // 也丢掉了场次粒度。
  const file = await csv([
    LIVE_HEADER,
    ["20260730-20260730", "111", "场次甲", "TIYES", "2026/07/30 08:00:00", "1000.5", "50", "40"],
    ["20260730-20260730", "222", "场次乙", "TIYES", "2026/07/30 20:00:00", "2000.5", "70", "55"]
  ], "采集-live-20260730-20260730.csv");
  const result = await readDouyinSelfServiceReport(file, { ...参数, resourceType: "live_daily" });
  assert.equal(result.facts.length, 2);
  assert.deepEqual(result.facts.map(fact => fact.liveSessionId), ["111", "222"]);
  assert.equal(result.facts[0].userPaymentAmount, 1000.5);
  assert.equal(result.facts[1].transactionOrderCount, 70);
  assert.equal(result.facts[1].transactionBuyers, 55, "买家数在直播口径叫 transactionBuyers");
});

test("直播不得凭用户支付金额冒充成交金额", async () => {
  // 自助取数的直播维度根本没有「成交金额」，两者口径不同，混填会造出权威的错值。
  const file = await csv([LIVE_HEADER, ["20260730-20260730", "111", "甲", "TIYES", "2026/07/30 08:00:00", "1000.5", "50", "40"]], "采集-live-20260730-20260730.csv");
  const result = await readDouyinSelfServiceReport(file, { ...参数, resourceType: "live_daily" });
  assert.equal(result.facts[0].transactionAmount, null);
});

test("未登记入库口径的资源直接拒绝，不猜", async () => {
  const file = await csv([SHOP_HEADER, ["20260730-20260730", "20260730", "TIYES", "1", "1", "1", "1"]]);
  await assert.rejects(
    readDouyinSelfServiceReport(file, { ...参数, resourceType: "orders" }),
    error => error.code === "DOUYIN_RESOURCE_NOT_COVERED"
  );
});

test("短视频：列名是「短视频用户支付金额」，且绝不填进成交金额", async () => {
  // 三个维度三套列名。短视频给的是用户支付金额，与成交金额是两个口径——
  // 表里原先没有对应列，只能丢数或冒充成交金额，后者会造出看起来权威的错值。
  // 数值取自 2026-07-30 真实下载到的文件。
  const file = await csv([
    ["统计日期", "成交订单数", "短视频ID", "店铺名称", "视频类型", "短视频用户支付金额"],
    ["20260730-20260730", "166", "7656752002734728307", "TIYES", "挂车", "4113.11"]
  ], "采集-video-ecom_video-20260730-20260730.csv");
  const result = await readDouyinSelfServiceReport(file, { ...参数, resourceType: "video_daily" });
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].videoId, "7656752002734728307");
  assert.equal(result.facts[0].userPaymentAmount, 4113.11);
  assert.equal(result.facts[0].transactionOrderCount, 166);
  assert.equal(result.facts[0].transactionAmount, null, "成交金额没采就是没采");
});

test("商品：一行一个商品，业务日仍取「日期」列", async () => {
  // 表头与数值取自 2026-07-30 真实下载到的文件。
  const file = await csv([
    ["统计日期", "日期", "商品ID", "商品名称", "用户支付金额", "成交订单数", "成交人数", "成交件数"],
    ["20260730-20260730", "20260730", "3814810793887794009", "提野星仓鼠垫料", "9273.49", "385", "380", "389"]
  ], "采集-product-20260730-20260730.csv");
  const result = await readDouyinSelfServiceReport(file, { ...参数, resourceType: "product_daily" });
  assert.equal(result.facts.length, 1);
  assert.equal(result.facts[0].productId, "3814810793887794009");
  assert.equal(result.facts[0].businessDate, "2026-07-30");
  assert.equal(result.facts[0].transactionBuyers, 380, "买家数在商品口径叫 transactionBuyers");
  assert.equal(result.facts[0].transactionQuantity, 389);
  assert.equal(result.facts[0].transactionAmount, null, "商品维度没有成交金额");
});

test("店铺日事实带上花出去的钱：广告费、支出、佣金", async () => {
  // 原先表里只有收进来的钱，算不了投放费比，也答不了「广告费多少」。
  // 列名以 preview 为准（2026-07-31 核对）。
  const header = [
    "统计日期", "日期", "店铺名称", "成交金额", "用户支付金额", "成交订单数", "成交人数",
    "投放消耗（店铺被投）", "支出金额（店铺被投）", "平台佣金（财务已结算）", "达人佣金（财务已结算）",
    "投放贡献成交金额", "净成交金额"
  ];
  const file = await csv([
    header,
    ["20260730-20260730", "20260730", "TIYES", "65449.76", "60342.64", "3265", "2676",
      "18320.55", "21044.10", "1962.40", "780.00", "61825.86", "61817.99"]
  ]);
  const fact = (await readDouyinSelfServiceReport(file, 参数)).facts[0];
  assert.equal(fact.adCostAmount, 18320.55);
  assert.equal(fact.expenseAmount, 21044.10);
  assert.equal(fact.platformCommission, 1962.40);
  assert.equal(fact.influencerCommission, 780);
  assert.equal(fact.adContributedAmount, 61825.86);
  // 费比不落库：平台自己有「剔除退款」等多个变体，口径不一，
  // 存一个说不清是哪种口径的比率比不存更糟。由这里的金额按明确定义现算。
  assert.equal("adCostRatio" in fact, false);
});

test("店铺日事实带上结算与退款：面板的退款率靠它们算", async () => {
  const header = [
    "统计日期", "日期", "店铺名称", "成交金额", "成交订单数", "成交人数",
    "结算金额", "退款金额（支付时间）", "退款金额（退款时间）",
    "退款订单数（支付时间）", "退款订单数（退款时间）", "商品曝光人数", "商品点击人数"
  ];
  const file = await csv([
    header,
    ["20260730-20260730", "20260730", "TIYES", "65449.76", "3265", "2676",
      "58210.30", "4120.55", "3980.10", "210", "198", "182033", "41255"]
  ]);
  const fact = (await readDouyinSelfServiceReport(file, 参数)).facts[0];
  assert.equal(fact.settlementAmount, 58210.30);
  assert.equal(fact.refundAmountByPaymentDate, 4120.55);
  assert.equal(fact.refundOrderCountByRefundDate, 198);
  assert.equal(fact.productExposureUsers, 182033);
  assert.equal(fact.productClickUsers, 41255);
});
