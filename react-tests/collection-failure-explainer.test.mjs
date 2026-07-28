import assert from "node:assert/strict";
import test from "node:test";
import {
  COLLECTION_FAILURE_KIND,
  explainCollectionFailure,
  productionErrorCodes
} from "../src/domain/collectionFailureExplainer.js";

test("页面交互类失败说明卡点并允许自助重试", () => {
  // 生产占比最高的一类：9 次 DOUYIN_DATE_RANGE_NOT_APPLIED。
  const explained = explainCollectionFailure("DOUYIN_DATE_RANGE_NOT_APPLIED", { stage: "exporting" });
  assert.equal(explained.kind, COLLECTION_FAILURE_KIND.pageInteraction);
  assert.match(explained.summary, /日期/);
  assert.equal(explained.summary.includes("DOUYIN_DATE_RANGE_NOT_APPLIED"), false, "结论里不得再印机器码");
  assert.match(explained.stuckAt, /导出/);
  assert.equal(explained.retryable, true);
  assert.equal(explained.needsHuman, false);
});

test("页面结构变化不允许自助重试，因为重试必然再失败", () => {
  const explained = explainCollectionFailure("KUAIMAI_ORDER_PAGE_SCHEMA_CHANGED", { stage: "collecting" });
  assert.equal(explained.kind, COLLECTION_FAILURE_KIND.schemaChanged);
  assert.equal(explained.retryable, false);
  assert.match(explained.action, /适配|反馈/);
});

test("需要人工的失败明确指出要在公司 Mac 上做什么", () => {
  const login = explainCollectionFailure("KUAIMAI_LOGIN_REQUIRED", { stage: "opening" });
  assert.equal(login.kind, COLLECTION_FAILURE_KIND.needsHuman);
  assert.equal(login.needsHuman, true);
  assert.match(login.action, /登录/);
  assert.match(login.action, /公司 Mac/);
});

test("入库类失败指向重新入库而不是重新采集", () => {
  const explained = explainCollectionFailure("ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT", { stage: "ingesting" });
  assert.equal(explained.kind, COLLECTION_FAILURE_KIND.ingest);
  assert.match(explained.stuckAt, /入库/);
  assert.match(explained.action, /重新入库/);
  // 文件已在本机，重新采集是白费；文案必须明确排除这条路而不是指示它。
  assert.equal(/请重新采集|去重新采集/.test(explained.action), false);
  assert.match(explained.action, /不需要重新采集/);
});

test("扩展环境类失败指向 Chrome 而不是快麦或抖店页面", () => {
  const explained = explainCollectionFailure("EXTENSION_CONTENT_SCRIPT_UNAVAILABLE", { stage: "opening" });
  assert.equal(explained.kind, COLLECTION_FAILURE_KIND.extension);
  assert.match(explained.action, /Chrome/);
});

test("未登记的错误码保留原码但仍给出可读结构，不假装认识", () => {
  const explained = explainCollectionFailure("SOME_BRAND_NEW_CODE", { stage: "exporting" });
  assert.equal(explained.kind, COLLECTION_FAILURE_KIND.unknown);
  assert.match(explained.summary, /未登记|尚未收录/);
  assert.match(explained.summary, /SOME_BRAND_NEW_CODE/, "未知码必须原样保留供排查");
  assert.equal(explained.retryable, true, "未知失败允许试一次");
});

test("空错误码不产生解释", () => {
  assert.equal(explainCollectionFailure("", { stage: "" }), null);
});

test("生产上出现过的错误码全部已登记", () => {
  // 取自 2026-07-28 生产 48 个任务与 86 条运行记录的实际分布。
  const seen = [
    "DOUYIN_DATE_RANGE_NOT_APPLIED", "DOUYIN_DATE_CONTROL_MISSING", "DOUYIN_PAGE_SCHEMA_CHANGED",
    "KUAIMAI_TIME_RANGE_NOT_APPLIED", "KUAIMAI_LOGIN_REQUIRED", "KUAIMAI_HUMAN_VERIFICATION_REQUIRED",
    "KUAIMAI_SALES_EXPORT_CONFIRM_MISSING", "KUAIMAI_EXPORT_REQUIRED_COLUMNS_MISSING",
    "KUAIMAI_ORDER_PAGE_SCHEMA_CHANGED", "EXTENSION_DOWNLOAD_TIMEOUT",
    "EXTENSION_CONTENT_SCRIPT_UNAVAILABLE", "EXTENSION_ACTION_NOT_REGISTERED",
    "ERP_COLLECTION_INTERNAL_ERROR", "ERP_COLLECTION_UPLOAD_FAILED",
    "ERP_COLLECTION_ARCHIVE_PROCESSING_TIMEOUT"
  ];
  const missing = seen.filter(code => !productionErrorCodes().includes(code));
  assert.deepEqual(missing, [], `以下生产错误码尚未登记：${missing.join(", ")}`);
  for (const code of seen) {
    const explained = explainCollectionFailure(code, { stage: "exporting" });
    assert.notEqual(explained.kind, COLLECTION_FAILURE_KIND.unknown, `${code} 应有明确分类`);
  }
});
