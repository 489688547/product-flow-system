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

test("loopback bridge accepts safe results and rejects sensitive or path data", async () => {
  await withBridge(async ({ baseUrl, submitted }) => {
    const accepted = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({
        jobId: "job-1",
        providerId: "kuaimai",
        resourceType: "orders",
        status: "downloaded",
        stage: "downloading",
        downloadId: 91,
        fileName: "orders.xlsx"
      })
    });
    assert.equal(accepted.status, 202);
    assert.equal(submitted.length, 1);

    const sensitive = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "job-1", status: "failed", cookie: "secret" })
    });
    assert.equal(sensitive.status, 400);

    const absolutePath = await fetch(`${baseUrl}/v1/tasks/job-1/result`, {
      method: "POST",
      headers: { ...headers(), "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: "job-1", status: "downloaded", fileName: "/Users/roger/Downloads/orders.xlsx" })
    });
    assert.equal(absolutePath.status, 400);
  });
});
