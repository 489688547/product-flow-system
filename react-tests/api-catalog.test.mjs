import assert from "node:assert/strict";
import test from "node:test";

import { runApiLiveTest } from "../src/state/apiCatalogApi.js";

test("safe live tests execute only same-origin registered GET requests", async () => {
  const calls = [];
  const endpoint = {
    method: "GET",
    path: "/api/platform/v1/data-services/sales",
    liveTest: { enabled: true, query: ["from", "to"] }
  };
  const result = await runApiLiveTest({
    endpoint,
    params: { from: "2026-07-01", to: "2026-07-28" },
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(JSON.stringify({
        summary: { quantity: 12 },
        credential: "never-return"
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-request-id": "request-1",
          "x-data-environment": "production"
        }
      });
    },
    now: (() => {
      const values = [
        new Date("2026-07-30T00:00:00.000Z"),
        new Date("2026-07-30T00:00:00.025Z")
      ];
      return () => values.shift();
    })()
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/api/platform/v1/data-services/sales?from=2026-07-01&to=2026-07-28");
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.credentials, "same-origin");
  assert.equal(result.status, 200);
  assert.equal(result.durationMs, 25);
  assert.equal(result.requestId, "request-1");
  assert.equal(result.dataEnvironment, "production");
  assert.equal(result.body.credential, "[已遮罩]");
});

test("write endpoints never reach fetch from the live-test client", async () => {
  let called = false;
  await assert.rejects(
    runApiLiveTest({
      endpoint: {
        method: "POST",
        path: "/api/platform/v1/data-standards",
        liveTest: { enabled: false }
      },
      params: {},
      fetchImpl: async () => {
        called = true;
        return new Response();
      }
    }),
    error => error.code === "API_LIVE_TEST_FORBIDDEN"
  );
  assert.equal(called, false);
});

test("API catalog UI exposes App filters, copyable write examples, and no write execution", async () => {
  const source = await import("node:fs/promises").then(({ readFile }) => readFile(
    new URL("../src/features/handbook/ApiCatalogWorkspace.jsx", import.meta.url),
    "utf8"
  ));

  assert.match(source, /按 App 浏览/);
  assert.match(source, /复制请求示例/);
  assert.match(source, /仅 GET 可安全实测/);
  assert.match(source, /runApiLiveTest/);
  assert.doesNotMatch(source, /fetch\s*\(/);
});
