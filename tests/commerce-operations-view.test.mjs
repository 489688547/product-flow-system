import assert from "node:assert/strict";
import test from "node:test";

import {
  buildStoreDailySummary,
  buildProductDailyTop10,
  buildContentDailySummary,
  dayOverDay
} from "../src/domain/commerceOperationsView.js";

test("dayOverDay reports direction, ratio and favorability with lower-is-better metrics", () => {
  const up = dayOverDay(120, 100);
  assert.equal(up.direction, "up");
  assert.equal(up.changeRatio, 0.2);
  assert.equal(up.favorable, true);

  const refundUp = dayOverDay(0.08, 0.05, { lowerIsBetter: true });
  assert.equal(refundUp.direction, "up");
  assert.equal(refundUp.favorable, false);

  assert.equal(dayOverDay(10, 0).changeRatio, null); // 除零降级
  assert.equal(dayOverDay(10, null).available, false); // 缺前一日降级
});

test("buildStoreDailySummary compares the latest business day against the previous one", () => {
  const facts = [
    { businessDate: "2026-07-22", transactionAmount: 8000, transactionOrderCount: 80, transactionBuyerCount: 70, derived: { averageOrderValue: 100, exposureClickRate: 0.1, refundRate: 0.06 } },
    { businessDate: "2026-07-23", transactionAmount: 10000, transactionOrderCount: 100, transactionBuyerCount: 90, derived: { averageOrderValue: 100, exposureClickRate: 0.12, refundRate: 0.05 } }
  ];
  const summary = buildStoreDailySummary(facts);
  assert.equal(summary.businessDate, "2026-07-23");
  assert.equal(summary.previousDate, "2026-07-22");
  const gmv = summary.metrics.find(metric => metric.key === "transactionAmount");
  assert.equal(gmv.value, 10000);
  assert.equal(gmv.comparison.direction, "up");
  assert.equal(gmv.comparison.changeRatio, 0.25);
  const refund = summary.metrics.find(metric => metric.key === "derived.refundRate");
  assert.equal(refund.comparison.direction, "down");
  assert.equal(refund.comparison.favorable, true); // 退款率下降为正向
});

test("buildProductDailyTop10 ranks by GMV and computes per-product day-over-day change", () => {
  const facts = [
    { businessDate: "2026-07-22", productId: "p1", productName: "A", transactionAmount: 500, transactionQuantity: 5, derived: { refundRate: 0.1 } },
    { businessDate: "2026-07-23", productId: "p1", productName: "A", transactionAmount: 1000, transactionQuantity: 9, derived: { refundRate: 0.1 } },
    { businessDate: "2026-07-23", productId: "p2", productName: "B", transactionAmount: 3000, transactionQuantity: 20, derived: { refundRate: 0.2 } }
  ];
  const { rows, businessDate } = buildProductDailyTop10(facts, 10);
  assert.equal(businessDate, "2026-07-23");
  assert.deepEqual(rows.map(row => row.productId), ["p2", "p1"]); // 按 GMV 降序
  const p1 = rows.find(row => row.productId === "p1");
  assert.equal(p1.comparison.direction, "up");
  assert.equal(p1.comparison.changeRatio, 1); // 500 -> 1000
  const p2 = rows.find(row => row.productId === "p2");
  assert.equal(p2.comparison.available, false); // 前一日无此商品
});

test("buildContentDailySummary aggregates the latest live and video day", () => {
  const live = [
    { businessDate: "2026-07-23", liveSessionId: "l1", transactionAmount: 1200, transactionOrderCount: 12 },
    { businessDate: "2026-07-23", liveSessionId: "l2", transactionAmount: 800, transactionOrderCount: 8 }
  ];
  const video = [
    { businessDate: "2026-07-23", videoId: "v1", transactionAmount: 300, playCount: 5000 }
  ];
  const summary = buildContentDailySummary(live, video);
  assert.equal(summary.live.sessionCount, 2);
  assert.equal(summary.live.transactionAmount, 2000);
  assert.equal(summary.video.videoCount, 1);
  assert.equal(summary.video.playCount, 5000);
});
