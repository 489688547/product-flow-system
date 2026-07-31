import assert from "node:assert/strict";
import test from "node:test";
import {
  assertExtractComplete,
  parseExtractRows,
  parseStatPeriod,
  sumByBusinessDate
} from "../src/domain/douyinExtractRows.js";

// 下面三组表头与数据都照抄 2026-07-30/31 真实下载到的文件。
const SHOP_HEADER = ["统计日期", "日期", "店铺名称", "成交金额", "用户支付金额", "成交订单数", "成交人数", "净成交金额", "投放贡献成交金额", "投放贡献成交占比"];
const SHOP_ROWS = [
  ["20260725-20260729", "20260725", "TIYES提野星宠物用品旗舰店", "67159.12", "61872.47", "3418", "2810", "63585.47", "59354.26", "0.8837855528779982"],
  ["20260725-20260729", "20260726", "TIYES提野星宠物用品旗舰店", "64545.91", "59679.07", "3161", "2616", "61172.12", "58557.27", "0.9072189082158705"]
];

const LIVE_HEADER = ["统计日期", "直播间ID", "直播间名称", "店铺名称", "直播开始时间", "用户支付金额", "成交订单数", "成交人数"];
const LIVE_ROWS = [
  ["20260725-20260729", "7667732497156934438", "养鼠人集结就位", "TIYES", "2026/07/29 07:59:36", "11623.31", "582", "396"],
  ["20260725-20260729", "7667362112720882470", "养鼠人集结就位", "TIYES", "2026/07/28 08:02:04", "11406.01", "544", "373"],
  ["20260725-20260729", "7666619811463695154", "养鼠人集结就位", "TIYES", "2026/07/29 20:01:10", "10538.33", "503", "373"]
];

test("店铺：业务日取自「日期」列，一行一天", () => {
  const result = parseExtractRows(SHOP_HEADER, SHOP_ROWS, { dimension: "shop" });
  assert.equal(result.rows.length, 2);
  assert.equal(result.rows[0].businessDate, "2026-07-25");
  assert.equal(result.rows[0].transactionOrderCount, 3418);
  assert.equal(result.rows[0].transactionBuyerCount, 2810);
  assert.equal(result.rows[0].transactionAmount, 67159.12);
});

test("直播：业务日取自开播时间，不能靠「我请求的是这几天」去推断", () => {
  // 直播文件一行一个直播间，统计日期给的是整段区间（20260725-20260729）。
  // 若拿请求区间当业务日，这三行会被当成同一天入库，而且看起来和真数一样。
  const result = parseExtractRows(LIVE_HEADER, LIVE_ROWS, { dimension: "live" });
  assert.deepEqual(result.rows.map(row => row.businessDate), ["2026-07-29", "2026-07-28", "2026-07-29"]);
  assert.equal(result.rows[0].liveRoomId, "7667732497156934438");
});

test("直播一天多场，入日事实前按业务日合计", () => {
  const result = parseExtractRows(LIVE_HEADER, LIVE_ROWS, { dimension: "live" });
  const daily = sumByBusinessDate(result.rows, ["userPaymentAmount", "transactionOrderCount"]);
  assert.deepEqual(daily.map(row => row.businessDate), ["2026-07-28", "2026-07-29"]);
  assert.equal(daily[1].rowCount, 2);
  assert.equal(Math.round(daily[1].userPaymentAmount * 100) / 100, 22161.64);
});

test("缺少业务日来源列时整批拒绝", () => {
  // 直播文件若没勾 live_start_ts，就没有任何一列能定位业务日。
  const header = LIVE_HEADER.filter(name => name !== "直播开始时间");
  assert.throws(
    () => parseExtractRows(header, [], { dimension: "live" }),
    error => error.code === "DOUYIN_EXTRACT_DATE_COLUMN_MISSING"
  );
});

test("短视频：统计日期必须是单日区间，跨天的区间合计一律丢弃", () => {
  // 区间合计还原不到某一天。宁可整批不入库，也不能挑一天安上去。
  const header = ["统计日期", "视频标题", "店铺名称", "用户支付金额", "成交订单数"];
  const 单日 = parseExtractRows(header, [["20260729-20260729", "标题", "TIYES", "812.5", "37"]], { dimension: "video" });
  assert.equal(单日.rows[0].businessDate, "2026-07-29");

  const 跨天 = parseExtractRows(header, [["20260725-20260729", "标题", "TIYES", "812.5", "37"]], { dimension: "video" });
  assert.equal(跨天.rows.length, 0);
  assert.equal(跨天.unmapped.length, 1);
});

test("统计日期区间照原样解析，不做任何补齐", () => {
  assert.deepEqual(parseStatPeriod("20260725-20260729"), { from: "2026-07-25", to: "2026-07-29" });
  assert.equal(parseStatPeriod("20260725"), null);
});

test("请求了哪几天就必须拿到哪几天，少一天整批不入库", () => {
  const result = parseExtractRows(SHOP_HEADER, SHOP_ROWS, {
    dimension: "shop",
    businessDates: ["2026-07-25", "2026-07-26", "2026-07-27"]
  });
  assert.deepEqual(result.missing, ["2026-07-27"]);
  assert.throws(
    () => assertExtractComplete(result, ["2026-07-25", "2026-07-26", "2026-07-27"]),
    error => error.code === "DOUYIN_EXTRACT_DAYS_MISSING"
  );
});

test("数字必须显式转换：导出文件里连金额都是字符串", () => {
  const result = parseExtractRows(SHOP_HEADER, SHOP_ROWS, { dimension: "shop" });
  assert.equal(typeof result.rows[0].transactionAmount, "number");
  assert.equal(typeof result.rows[0].transactionOrderCount, "number");
});
