import assert from "node:assert/strict";
import test from "node:test";
import { deriveCommerceMetrics } from "../src/domain/commerceFacts.js";
import { STORE_DAILY_METRICS } from "../src/domain/commerceOperationsView.js";

test("成交订单数、成交人数、客单价不得出现在店铺经营面板", () => {
  // 这三个数在当前取数路径下是错的，而且错得不报错：2026-07-29 面板显示
  // 成交订单数 3,147,743、成交人数 2,575,726、客单价 ¥0，当日 GMV 只有 ¥65,761。
  // store_daily 靠页面标签文字找旁边的数字，罗盘改版后串位；而罗盘首页接口
  // 返回的 12 个指标里根本没有订单数与人数，说明当前路径拿不到可信来源。
  // 错数比缺数危险——缺数看得见，错数会被当真。
  const keys = STORE_DAILY_METRICS.map(metric => metric.key);
  for (const forbidden of ["transactionOrderCount", "transactionBuyerCount", "derived.averageOrderValue"]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} 尚无可信来源，不得展示`);
  }
});

test("仍保留有可信来源的指标", () => {
  const keys = STORE_DAILY_METRICS.map(metric => metric.key);
  assert.deepEqual(keys, [
    "transactionAmount",
    "derived.exposureClickRate",
    "derived.refundRate",
    "adCostAmount",
    "derived.adCostRatio"
  ]);
});

test("成交订单数与成交人数仍不上面板：库里旧行还是页面抓来的错值", () => {
  // 自助取数已经能给出可信的这两项（实测 07-30 是 3265 单 / 2676 人），但库里既有的
  // store_daily 行来自页面抓取，正是显示过 314 万单 / 257 万人的那批。现在放回面板，
  // 面板会照旧把错值显示出来。恢复的前提是先按 sourceVersion 区分来源，或把历史回补掉。
  const keys = STORE_DAILY_METRICS.map(metric => metric.key);
  assert.equal(keys.includes("transactionOrderCount"), false);
  assert.equal(keys.includes("transactionBuyerCount"), false);
});

test("面板给出广告费与投放费比", () => {
  // 「广告费多少」原先答不了：表里只有收进来的钱。费比按 投放消耗 / 成交金额 现算，
  // 不用平台那几个口径不一的变体（剔除退款 / 综合费比）。
  const keys = STORE_DAILY_METRICS.map(metric => metric.key);
  assert.ok(keys.includes("adCostAmount"));
  assert.ok(keys.includes("derived.adCostRatio"));

  const derived = deriveCommerceMetrics("store_daily", { adCostAmount: 18320.55, transactionAmount: 65449.76 });
  assert.equal(Math.round(derived.adCostRatio * 10000) / 10000, 0.2799);
  // 没采到就是没采到，不拿 0 冒充。
  assert.equal(deriveCommerceMetrics("store_daily", { transactionAmount: 100 }).adCostRatio, null);
});
