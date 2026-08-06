import assert from "node:assert/strict";
import test from "node:test";
import { isDistrustedSource, selectTrustedDailyFacts } from "../src/domain/commerceFacts.js";

const 页面抓取 = "douyin-store-capture-2026-07-24";

test("页面抓取来源整体不可信，不挑着信", () => {
  // 有几天看着是对的，但它们是同一套代码抓的，只是那天没撞上拼接。
  // 凭「看着合理」留下一行，等于把没验证过的数字当真。
  assert.equal(isDistrustedSource(页面抓取), true);
  assert.equal(isDistrustedSource("douyin-self-service-v1"), false);
  assert.equal(isDistrustedSource("douyin-homepage-v1"), false);
});

test("不可信来源的行不参与展示，哪怕那天只有它", () => {
  // 宁可页面上缺这几天，也不要显示一个错的。缺数看得见，错数会被当真。
  const rows = [
    { businessDate: "2026-07-29", transactionOrderCount: 3147743, sourceVersion: 页面抓取, batchCompletedAt: "2026-07-30T02:00:00Z" }
  ];
  assert.deepEqual(selectTrustedDailyFacts(rows), []);
});

test("同一天多行时取批次完成时间最新的那条", () => {
  // 事实行的 id 里含批次，重采不覆盖旧行而是再插一条：07-27 实际有三行，
  // 其中两行是采早了的半成品（成交订单数为空）。原先按 id 排序取第一条，
  // 取到哪条全看哈希。
  const rows = [
    { businessDate: "2026-07-27", transactionAmount: 61400, transactionOrderCount: null, sourceVersion: "douyin-self-service-v1", batchCompletedAt: "2026-07-27T05:00:00Z" },
    { businessDate: "2026-07-27", transactionAmount: 61447.45, transactionOrderCount: 2947, sourceVersion: "douyin-self-service-v1", batchCompletedAt: "2026-07-27T11:00:00Z" }
  ];
  const picked = selectTrustedDailyFacts(rows);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].transactionOrderCount, 2947, "取重采后的那条，不是清晨的半成品");
});

test("多天按业务日排序返回", () => {
  const rows = [
    { businessDate: "2026-07-30", sourceVersion: "douyin-homepage-v1", batchCompletedAt: "2026-07-31T02:00:00Z" },
    { businessDate: "2026-07-29", sourceVersion: "douyin-self-service-v1", batchCompletedAt: "2026-07-30T02:00:00Z" }
  ];
  assert.deepEqual(selectTrustedDailyFacts(rows).map(row => row.businessDate), ["2026-07-29", "2026-07-30"]);
});
