import assert from "node:assert/strict";
import test from "node:test";
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
  assert.deepEqual(keys, ["transactionAmount", "derived.exposureClickRate", "derived.refundRate"]);
});
