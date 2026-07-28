import assert from "node:assert/strict";
import test from "node:test";
import { buildDataSyncRunRows } from "../src/domain/dataSyncRunRows.js";

const now = new Date("2026-07-28T09:00:00.000Z");

// 全部取自生产真实数据：抖店 07-23 三个资源成功、快麦 order_items 成功、
// 抖店 07-27 导出阶段失败、快麦 07-27 入库超时。
const jobs = [
  { id: "j-dy-live", providerId: "douyin-ecommerce", storeId: "90862283", resourceType: "live_daily", businessDate: "2026-07-23", status: "success" },
  { id: "j-km-items", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-24", status: "success" },
  { id: "j-dy-fail", providerId: "douyin-ecommerce", storeId: "90862283", resourceType: "video_daily", businessDate: "2026-07-27", status: "failed" },
  { id: "j-km-ingest", providerId: "kuaimai", resourceType: "order_items", businessDate: "2026-07-27", status: "success" }
];

const runs = [
  {
    id: "r1", jobId: "j-dy-live", status: "success", stage: "ingesting", rowCount: 226,
    archiveId: "630b1908abc0b0bcac586b630acbb426336bc12496b4d72e0345bef9f99fe0a4",
    batchId: "douyin-live_daily-630b1908abc0", completedAt: "2026-07-24T01:00:00.000Z"
  },
  {
    id: "r2", jobId: "j-km-items", status: "success", stage: "ingesting", rowCount: 10218,
    archiveId: "963a5eb08f95502ee92159f0c7712543b88aadf2a1ee9bc32b2a4d538b9aff0c",
    batchId: "kuaimai-order_items-963a5e", completedAt: "2026-07-25T01:00:00.000Z"
  },
  {
    id: "r3", jobId: "j-dy-fail", status: "failed", stage: "exporting", rowCount: null,
    errorCode: "DOUYIN_DATE_RANGE_NOT_APPLIED", completedAt: "2026-07-28T07:15:42.618Z"
  }
];

// 归档索引只覆盖快麦；抖店有自己的目录结构，不在这张表里。
const archives = [{
  id: "kuaimai-archive-963a5eb08f95502ee92159f0",
  contentHash: "963a5eb08f95502ee92159f0c7712543b88aadf2a1ee9bc32b2a4d538b9aff0c",
  resourceType: "order_items",
  relativePath: "原始归档/order_items/2026-07/963a5eb0__快麦ERP交易订单明细导出.xlsx",
  status: "processed"
}];

function rows(extra = {}) {
  return buildDataSyncRunRows({ legacyRuns: [], jobs, runs, archives, now, ...extra });
}

test("失败行给出可执行的重试动作，而不是只报状态", () => {
  const row = rows().find(item => item.id === "web:r3");
  assert.equal(row.status, "failed");
  assert.deepEqual(row.retryTarget, {
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    resourceType: "video_daily",
    businessDate: "2026-07-27"
  });
  assert.equal(row.canRetry, true);
});

test("快麦成功行按 contentHash 关联归档索引给出文件位置", () => {
  // run.archiveId 实际存的是 contentHash 而非归档 id：按 id 关联在生产上命中 0 条。
  const row = rows().find(item => item.id === "web:r2");
  assert.equal(row.status, "success");
  assert.equal(row.artifactPath, "原始归档/order_items/2026-07/963a5eb0__快麦ERP交易订单明细导出.xlsx");
  assert.equal(row.artifactSource, "archive-index");
  assert.equal(row.rowCount, 10218);
});

test("抖店成功行按目录规则推出文件位置，不依赖快麦归档索引", () => {
  // 规则已用生产文件验证：<根>/<provider>/<store>/<resource>/<年>/<月>/<业务日>/<hash>.xlsx
  const row = rows().find(item => item.id === "web:r1");
  assert.equal(
    row.artifactPath,
    "抖店罗盘/douyin-ecommerce/90862283/live_daily/2026/07/2026-07-23/630b1908abc0b0bcac586b630acbb426336bc12496b4d72e0345bef9f99fe0a4.xlsx"
  );
  assert.equal(row.artifactSource, "derived-path");
});

test("缺少归档标识时不编造路径", () => {
  const row = rows({
    runs: [{ id: "r9", jobId: "j-km-items", status: "success", stage: "ingesting", rowCount: 5, archiveId: null, batchId: "b" }]
  }).find(item => item.id === "web:r9");
  assert.equal(row.artifactPath, "");
  assert.equal(row.artifactSource, "");
});

test("失败行不给文件位置，因为没有产出物", () => {
  const row = rows().find(item => item.id === "web:r3");
  assert.equal(row.artifactPath, "");
});

test("归档索引里查无此文件时如实留空，不退化成猜测", () => {
  const row = rows({ archives: [] }).find(item => item.id === "web:r2");
  assert.equal(row.artifactPath, "");
  assert.equal(row.artifactSource, "");
});

test("页面结构变化不给重试按钮，只给处理建议", () => {
  const row = buildDataSyncRunRows({
    jobs, archives, now,
    runs: [{ id: "rs", jobId: "j-dy-fail", status: "failed", stage: "collecting", errorCode: "DOUYIN_PAGE_SCHEMA_CHANGED" }]
  }).find(item => item.id === "web:rs");
  assert.equal(row.canRetry, false, "重试必然再失败，不该给按钮");
  assert.match(row.retryHint, /适配/);
  assert.equal(row.message.includes("DOUYIN_PAGE_SCHEMA_CHANGED"), false, "结果列不再直接印机器码");
  assert.match(row.message, /页面结构已变化/);
  assert.match(row.message, /卡在/);
});

test("需要人工登录时不给重试按钮，先让人处理", () => {
  const row = buildDataSyncRunRows({
    jobs, archives, now,
    runs: [{ id: "rl", jobId: "j-km-ingest", status: "failed", stage: "opening", errorCode: "KUAIMAI_LOGIN_REQUIRED" }]
  }).find(item => item.id === "web:rl");
  assert.equal(row.canRetry, false);
  assert.equal(row.failure.needsHuman, true);
  assert.match(row.retryHint, /登录/);
});
