import assert from "node:assert/strict";
import test from "node:test";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const allowedOrigin = `chrome-extension://${extensionId}`;
const pairingKey = `wcp_${"a".repeat(48)}`;

async function withBridge(callback) {
  const { createCollectorBridge } = await import("../scripts/web-data-collector/bridge.mjs");
  const submitted = [];
  const stores = [];
  const taskRequests = [];
  const bridge = createCollectorBridge({
    allowedOrigin,
    pairingKey,
    getNextTask: async input => {
      taskRequests.push(input);
      return ({
      jobId: "job-1",
      providerId: "kuaimai",
      storeId: "",
      resourceType: "orders",
      businessDate: "2026-07-21",
      status: "queued",
      url: "https://must-not-leak.example",
      selector: "body",
      token: "must-not-leak"
      });
    },
    submitResult: async result => submitted.push(result),
    registerStore: async store => stores.push(store)
  });
  await bridge.listen({ port: 0 });
  try {
    await callback({ bridge, baseUrl: `http://127.0.0.1:${bridge.port}`, submitted, stores, taskRequests });
  } finally {
    await bridge.close();
  }
}

function headers(overrides = {}) {
  return {
    Origin: allowedOrigin,
    "X-Collector-Pairing-Key": pairingKey,
    ...overrides
  };
}

test("loopback bridge rejects foreign origins and missing pairing keys", async () => {
  await withBridge(async ({ baseUrl }) => {
    const foreign = await fetch(`${baseUrl}/v1/tasks/next`, { headers: headers({ Origin: "https://evil.example" }) });
    assert.equal(foreign.status, 403);

    const unpaired = await fetch(`${baseUrl}/v1/tasks/next`, { headers: { Origin: allowedOrigin } });
    assert.equal(unpaired.status, 401);
  });
});

test("loopback bridge accepts only a bounded Douyin store identity", async () => {
  await withBridge(async ({ baseUrl, stores }) => {
    const accepted = await fetch(`${baseUrl}/v1/providers/douyin-ecommerce/stores/identify`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: "douyin-ecommerce",
        storeId: "90862283",
        storeName: "TIYES提野星宠物用品旗舰店"
      })
    });
    assert.equal(accepted.status, 202);
    assert.deepEqual(stores, [{
      providerId: "douyin-ecommerce",
      storeId: "90862283",
      storeName: "TIYES提野星宠物用品旗舰店"
    }]);

    const unsafe = await fetch(`${baseUrl}/v1/providers/douyin-ecommerce/stores/identify`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        providerId: "douyin-ecommerce",
        storeId: "90862283",
        storeName: "旗舰店",
        cookie: "secret"
      })
    });
    assert.equal(unsafe.status, 400);
  });
});

test("loopback bridge exposes only the safe extension task projection", async () => {
  await withBridge(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/tasks/next`, { headers: headers() });
    assert.equal(response.status, 200);
    // sourceStamp 只是扩展源码的最新修改时间，用于让扩展发现自己在跑旧代码后自行
    // 重载；它不携带任何路径或业务信息，因此不破坏「只暴露安全字段」这条约束。
    assert.deepEqual(await response.json(), {
      task: {
        jobId: "job-1",
        providerId: "kuaimai",
        storeId: "",
        resourceType: "orders",
        businessDate: "2026-07-21",
        status: "queued"
      },
      sourceStamp: ""
    });
  });
});

test("loopback bridge forwards only a validated Chrome-profile store ID when claiming work", async () => {
  await withBridge(async ({ baseUrl, taskRequests }) => {
    const response = await fetch(`${baseUrl}/v1/tasks/next?storeId=90862283`, { headers: headers() });
    assert.equal(response.status, 200);
    assert.deepEqual(taskRequests, [{ storeId: "90862283" }]);

    const unsafe = await fetch(`${baseUrl}/v1/tasks/next?storeId=../90862283`, { headers: headers() });
    assert.equal(unsafe.status, 400);
  });
});

test("loopback bridge accepts origin-less MV3 service-worker requests with the pairing key", async () => {
  await withBridge(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/tasks/next`, {
      headers: { "X-Collector-Pairing-Key": pairingKey }
    });
    assert.equal(response.status, 200);
  });
});

test("loopback bridge accepts the strict downloaded result and rejects sensitive or path data", async () => {
  await withBridge(async ({ baseUrl, submitted }) => {
    const accepted = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        kind: "downloaded",
        downloadId: 91,
        safeFileName: "orders.xlsx",
        pageType: "kuaimai_orders",
        reportVersion: "kuaimai-orders-v2"
      })
    });
    assert.equal(accepted.status, 202);
    assert.equal(submitted.length, 1);

    const sensitive = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "waiting_human",
        jobId: "job-1",
        errorCode: "KUAIMAI_LOGIN_REQUIRED",
        safeSummary: "请登录。",
        cookie: "secret"
      })
    });
    assert.equal(sensitive.status, 400);

    const absolutePath = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "downloaded",
        jobId: "job-1",
        downloadId: 91,
        safeFileName: "/Users/roger/Downloads/orders.xlsx",
        pageType: "kuaimai_orders",
        reportVersion: "kuaimai-orders-v2"
      })
    });
    assert.equal(absolutePath.status, 400);
  });
});

test("loopback bridge accepts fixed store/product capture facts and bounded human summaries", async () => {
  await withBridge(async ({ baseUrl, submitted }) => {
    const facts = {
      transactionAmount: 100,
      transactionOrderCount: 2,
      transactionBuyerCount: 2,
      userPaymentAmount: 90,
      settlementAmount: null,
      refundAmountByPaymentDate: null,
      refundAmountByRefundDate: 5,
      refundOrderCountByPaymentDate: null,
      refundOrderCountByRefundDate: 1,
      productExposureUsers: 1000,
      productClickUsers: 100
    };
    const capture = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "captured",
        jobId: "job-1",
        resourceType: "store_daily",
        facts,
        pageType: "shop_compass_overview",
        selectorVersion: "2026-07-24"
      })
    });
    assert.equal(capture.status, 202);
    assert.equal(submitted.at(-1).facts.transactionAmount, 100);

    const productCapture = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "captured",
        jobId: "job-1",
        resourceType: "product_daily",
        facts: [{
          productId: "3718502021305860341",
          skuId: null,
          productName: "莓果冻干主粮",
          skuName: null,
          merchantCode: null,
          exposureUsers: 48_100,
          clickUsers: 3_346,
          transactionBuyers: 575,
          transactionOrderCount: 593,
          transactionQuantity: null,
          transactionAmount: null,
          userPaymentAmount: 15_199.11,
          refundOrderCount: null,
          refundQuantity: null,
          refundAmount: null
        }],
        pageType: "shop_compass_product",
        selectorVersion: "2026-07-31"
      })
    });
    assert.equal(productCapture.status, 202);
    assert.equal(submitted.at(-1).facts[0].productId, "3718502021305860341");

    const emptyProduct = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "captured",
        jobId: "job-1",
        resourceType: "product_daily",
        facts: [],
        pageType: "shop_compass_product",
        selectorVersion: "2026-07-31"
      })
    });
    assert.equal(emptyProduct.status, 400);

    const longSummary = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "waiting_human",
        jobId: "job-1",
        errorCode: "DOUYIN_LOGIN_REQUIRED",
        safeSummary: "x".repeat(241)
      })
    });
    assert.equal(longSummary.status, 400);
  });
});
