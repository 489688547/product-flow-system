import assert from "node:assert/strict";
import test from "node:test";

const extensionId = "abcdefghijklmnopabcdefghijklmnop";
const allowedOrigin = `chrome-extension://${extensionId}`;
const pairingKey = `wcp_${"a".repeat(48)}`;

async function withBridge(callback) {
  const { createCollectorBridge } = await import("../scripts/web-data-collector/bridge.mjs");
  const submitted = [];
  const bridge = createCollectorBridge({
    allowedOrigin,
    pairingKey,
    getNextTask: async () => ({
      jobId: "job-1",
      providerId: "kuaimai",
      storeId: "",
      resourceType: "orders",
      businessDate: "2026-07-21",
      status: "queued",
      url: "https://must-not-leak.example",
      selector: "body",
      token: "must-not-leak"
    }),
    submitResult: async result => submitted.push(result)
  });
  await bridge.listen({ port: 0 });
  try {
    await callback({ bridge, baseUrl: `http://127.0.0.1:${bridge.port}`, submitted });
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

test("loopback bridge exposes only the safe extension task projection", async () => {
  await withBridge(async ({ baseUrl }) => {
    const response = await fetch(`${baseUrl}/v1/tasks/next`, { headers: headers() });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      task: {
        jobId: "job-1",
        providerId: "kuaimai",
        storeId: "",
        resourceType: "orders",
        businessDate: "2026-07-21",
        status: "queued"
      }
    });
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

test("loopback bridge accepts only fixed store capture facts and bounded human summaries", async () => {
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

    const wrongResource = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        kind: "captured",
        jobId: "job-1",
        resourceType: "product_daily",
        facts,
        pageType: "shop_compass_product",
        selectorVersion: "2026-07-24"
      })
    });
    assert.equal(wrongResource.status, 400);

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
