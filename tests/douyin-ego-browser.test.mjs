import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyDouyinEgoSnapshot,
  parseDouyinStoreIdentityText,
  validateDouyinEgoTask
} from "../scripts/web-data-collector/browser/providers/douyinEgoState.mjs";

const task = Object.freeze({
  jobId: "job-ego-1",
  providerId: "douyin-ecommerce",
  storeId: "90862283",
  storeName: "TIYES提野星宠物用品旗舰店",
  resourceType: "video_daily",
  businessDate: "2026-08-03",
  status: "opening",
  attempt: 1,
  scheduleVersion: "v1",
  workspace: "/var/tmp/product-flow/job-ego-1"
});

function context(overrides = {}) {
  return {
    elapsedMs: 1_000,
    loadTimeoutMs: 45_000,
    expectedStoreId: "90862283",
    actualStoreId: "90862283",
    identityVerified: true,
    ...overrides
  };
}

const stablePage = Object.freeze({
  origin: "https://compass.jinritemai.com",
  path: "/shop/video/overview",
  title: "短视频分析-抖音电商罗盘",
  body: "短视频明细 日期 下载报表",
  readyState: "complete",
  networkIdle: true,
  hasPassword: false,
  hasRegisteredResourceSentinels: true
});

test("Ego Douyin task accepts only registered local execution fields", () => {
  assert.deepEqual(validateDouyinEgoTask(task), task);
  for (const unsafe of [
    { ...task, url: "https://evil.example" },
    { ...task, selector: "body" },
    { ...task, script: "document.cookie" },
    { ...task, explicitHumanRetry: true },
    { ...task, resourceType: "orders" },
    { ...task, workspace: "relative/downloads" }
  ]) {
    assert.throws(
      () => validateDouyinEgoTask(unsafe),
      error => /^DOUYIN_EGO_TASK_/.test(String(error?.code || ""))
    );
  }
});

test("Ego Douyin store identity parser requires one labelled stable store ID", () => {
  assert.deepEqual(parseDouyinStoreIdentityText(`主体信息
店铺名称：TIYES提野星宠物用品旗舰店
店铺 ID：90862283
经营类目：宠物用品`), {
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    storeName: "TIYES提野星宠物用品旗舰店"
  });
  assert.deepEqual(parseDouyinStoreIdentityText(`店铺名称
TIYES提野星宠物用品旗舰店
商家编号
90862283`), {
    providerId: "douyin-ecommerce",
    storeId: "90862283",
    storeName: "TIYES提野星宠物用品旗舰店"
  });
  assert.equal(parseDouyinStoreIdentityText("店铺名称：旗舰店\n账号 ID：90862283"), null);
  assert.equal(parseDouyinStoreIdentityText("店铺 ID：90862283\n店铺编号：99887766"), null);
});

test("empty report shell followed by login is not a schema change", () => {
  assert.deepEqual(classifyDouyinEgoSnapshot({
    ...stablePage,
    body: "帮助 获取菜单失败",
    readyState: "interactive",
    networkIdle: false,
    hasRegisteredResourceSentinels: false
  }, context({ elapsedMs: 12_000 })), { state: "loading" });

  assert.deepEqual(classifyDouyinEgoSnapshot({
    ...stablePage,
    path: "/login",
    title: "抖店登录",
    body: "手机号登录",
    hasPassword: true,
    hasRegisteredResourceSentinels: false
  }, context({ elapsedMs: 15_000 })), {
    state: "login_required",
    errorCode: "DOUYIN_LOGIN_REQUIRED"
  });
});

test("Ego Douyin state classification separates every terminal cause", () => {
  const cases = [
    [
      { ...stablePage, body: "请拖动滑块完成安全验证", hasRegisteredResourceSentinels: false },
      context(),
      { state: "human_verification", errorCode: "DOUYIN_HUMAN_VERIFICATION_REQUIRED" }
    ],
    [
      { ...stablePage, origin: "https://evil.example" },
      context(),
      { state: "unexpected_navigation", errorCode: "DOUYIN_NAVIGATION_UNEXPECTED" }
    ],
    [
      stablePage,
      context({ actualStoreId: "99887766", identityVerified: false }),
      { state: "store_mismatch", errorCode: "DOUYIN_STORE_MISMATCH", actualStoreId: "99887766" }
    ],
    [
      stablePage,
      context({ actualStoreId: "", identityVerified: false }),
      { state: "store_identity_unavailable", errorCode: "DOUYIN_STORE_IDENTITY_UNAVAILABLE" }
    ],
    [
      { ...stablePage, body: "", readyState: "loading", networkIdle: false, hasRegisteredResourceSentinels: false },
      context({ elapsedMs: 45_000 }),
      { state: "load_timeout", errorCode: "DOUYIN_PAGE_LOAD_TIMEOUT" }
    ],
    [
      { ...stablePage, hasRegisteredResourceSentinels: false },
      context(),
      { state: "schema_changed", errorCode: "DOUYIN_PAGE_SCHEMA_CHANGED" }
    ],
    [
      stablePage,
      context(),
      { state: "ready", storeId: "90862283" }
    ]
  ];

  for (const [snapshot, classificationContext, expected] of cases) {
    assert.deepEqual(classifyDouyinEgoSnapshot(snapshot, classificationContext), expected);
  }
});
