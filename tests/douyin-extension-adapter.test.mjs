import assert from "node:assert/strict";
import test from "node:test";

const adapterUrl = new URL(
  "../chrome-extension/company-data-collector/providers/douyin.js",
  import.meta.url
);

const baseTask = Object.freeze({
  jobId: "douyin-job-1",
  providerId: "douyin-ecommerce",
  storeId: "store-1",
  resourceType: "store_daily",
  businessDate: "2026-07-23",
  status: "leased",
  attempt: 1,
  scheduleVersion: "v1"
});

test("Douyin adapter allows only fixed official origins and four registered resources", async () => {
  const {
    DOUYIN_ALLOWED_ORIGINS,
    douyinResources,
    projectDouyinTask
  } = await import(adapterUrl);

  assert.deepEqual(DOUYIN_ALLOWED_ORIGINS, [
    "https://fxg.jinritemai.com",
    "https://compass.jinritemai.com"
  ]);
  assert.deepEqual(Object.keys(douyinResources).sort(), [
    "live_daily",
    "product_daily",
    "store_daily",
    "video_daily"
  ]);
  assert.deepEqual(projectDouyinTask(baseTask), baseTask);
  assert.throws(
    () => projectDouyinTask({ ...baseTask, url: "https://example.com/report" }),
    error => error?.code === "DOUYIN_TASK_UNSAFE_FIELDS"
  );
  assert.throws(
    () => projectDouyinTask({ ...baseTask, resourceType: "orders" }),
    error => error?.code === "DOUYIN_RESOURCE_NOT_REGISTERED"
  );
});

test("Douyin adapter classifies login and verification as human work without bypassing it", async () => {
  const { classifyDouyinPage } = await import(adapterUrl);

  assert.deepEqual(classifyDouyinPage({
    url: "https://fxg.jinritemai.com/login/common?channel=zhaoshang",
    markers: { loginPage: true }
  }), {
    state: "waiting_human",
    errorCode: "DOUYIN_LOGIN_REQUIRED",
    safeSummary: "请在公司 Chrome 登录抖店后重试。"
  });
  for (const marker of ["captcha", "slider", "scan", "deviceVerification", "smsVerification"]) {
    assert.equal(classifyDouyinPage({
      url: "https://compass.jinritemai.com/",
      markers: { [marker]: true }
    }).state, "waiting_human");
  }
  assert.equal(classifyDouyinPage({
    url: "https://evil.example/",
    markers: {}
  }).state, "blocked_origin");
  assert.deepEqual(classifyDouyinPage({
    url: "https://compass.jinritemai.com/shop",
    markers: { reportPage: true, storeIdentity: false }
  }), {
    state: "ready"
  });
});

test("Douyin store capture accepts only the fixed atomic fact schema", async () => {
  const {
    STORE_DAILY_FACT_KEYS,
    validateDouyinCapture
  } = await import(adapterUrl);
  const facts = {
    transactionAmount: 1234.5,
    transactionOrderCount: 12,
    transactionBuyerCount: 10,
    userPaymentAmount: null,
    settlementAmount: 1100,
    refundAmountByPaymentDate: 50,
    refundAmountByRefundDate: 40,
    refundOrderCountByPaymentDate: 2,
    refundOrderCountByRefundDate: 1,
    productExposureUsers: 2000,
    productClickUsers: 300
  };
  const capture = {
    kind: "captured",
    resourceType: "store_daily",
    facts,
    pageType: "shop_compass_overview",
    selectorVersion: "2026-07-24"
  };

  assert.deepEqual([...STORE_DAILY_FACT_KEYS].sort(), Object.keys(facts).sort());
  assert.deepEqual(validateDouyinCapture(capture), capture);
  assert.throws(
    () => validateDouyinCapture({ ...capture, pageText: "entire page" }),
    error => error?.code === "DOUYIN_CAPTURE_UNSAFE_FIELDS"
  );
  assert.throws(
    () => validateDouyinCapture({ ...capture, cookie: "secret" }),
    error => error?.code === "DOUYIN_CAPTURE_UNSAFE_FIELDS"
  );
  assert.throws(
    () => validateDouyinCapture({ ...capture, resourceType: "product_daily" }),
    error => error?.code === "DOUYIN_CAPTURE_RESOURCE_INVALID"
  );
  assert.throws(
    () => validateDouyinCapture({ ...capture, facts: { ...facts, customerMobile: "13800000000" } }),
    error => error?.code === "DOUYIN_CAPTURE_SCHEMA_INVALID"
  );
});

test("Douyin tasks use fixed pages and fixed official-report actions", async () => {
  const {
    buildDouyinActionPlan,
    buildDouyinTaskUrl,
    douyinResources
  } = await import(adapterUrl);

  for (const resourceType of Object.keys(douyinResources)) {
    const task = { ...baseTask, resourceType };
    const url = new URL(buildDouyinTaskUrl(
      `${douyinResources[resourceType].origin}${douyinResources[resourceType].route}`,
      task
    ));
    assert.equal(url.origin, douyinResources[resourceType].origin);
    assert.equal(url.pathname, douyinResources[resourceType].route);
    assert.equal(url.searchParams.has("url"), false);
    assert.equal(url.searchParams.has("selector"), false);
    assert.deepEqual(buildDouyinActionPlan(task), resourceType === "store_daily"
      ? [
          { action: "apply_business_date", businessDate: "2026-07-23" },
          { action: "download_official_report", resourceType: "store_daily" },
          { action: "capture_store_fallback", businessDate: "2026-07-23" }
        ]
      : [
          { action: "apply_business_date", businessDate: "2026-07-23" },
          { action: "download_official_report", resourceType }
        ]);
  }
  assert.equal(
    new URL(buildDouyinTaskUrl("https://compass.jinritemai.com/shop", baseTask)).pathname,
    "/shop"
  );
});
