import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildApiLiveUrl,
  filterApiEndpoints,
  sanitizeApiPreview,
  validateApiRegistry
} from "../src/domain/apiCatalog.js";

const registryUrl = new URL("../docs/platform/api-registry.json", import.meta.url);

test("API registry is valid, App-scoped, and backed by durable contracts", async () => {
  const registry = validateApiRegistry(JSON.parse(await readFile(registryUrl, "utf8")));

  assert.deepEqual(registry.apps.map(app => app.id), [
    "company-platform",
    "product-lifecycle",
    "supply-chain",
    "data-center",
    "ecommerce-operations",
    "brand-content",
    "people-performance"
  ]);
  assert.ok(registry.endpoints.length >= 16);

  for (const endpoint of registry.endpoints) {
    await access(new URL(`../docs/platform/apis/${endpoint.contract}`, import.meta.url));
    assert.ok(endpoint.requestExample, `${endpoint.id} 缺少请求示例`);
    assert.ok(endpoint.responseExample, `${endpoint.id} 缺少响应示例`);
    assert.ok(Array.isArray(endpoint.errors), `${endpoint.id} 缺少错误码`);
    if (endpoint.liveTest?.enabled) assert.equal(endpoint.method, "GET");
  }
});

test("registry validation fails closed for duplicate endpoints and write live tests", () => {
  const base = {
    version: 1,
    apps: [{ id: "company-platform", label: "公司平台", order: 1 }],
    endpoints: [{
      id: "one",
      appId: "company-platform",
      title: "接口一",
      method: "GET",
      path: "/api/platform/v1/one",
      status: "connected",
      summary: "测试",
      contract: "one-v1.md",
      auth: "公司会话",
      permission: "员工",
      requestExample: { query: {} },
      responseExample: { ok: true },
      errors: []
    }]
  };
  assert.throws(
    () => validateApiRegistry({ ...base, endpoints: [...base.endpoints, { ...base.endpoints[0], id: "two" }] }),
    error => error.code === "API_ENDPOINT_DUPLICATE"
  );
  assert.throws(
    () => validateApiRegistry({
      ...base,
      endpoints: [{ ...base.endpoints[0], method: "POST", liveTest: { enabled: true } }]
    }),
    error => error.code === "API_LIVE_TEST_FORBIDDEN"
  );
});

test("API endpoints filter by App, method, status, path, title, and error code", () => {
  const endpoints = [
    {
      appId: "data-center",
      method: "GET",
      status: "connected",
      title: "销售日需求",
      path: "/api/platform/v1/data-services/sales/daily",
      summary: "订单创建时间日销量",
      errors: ["DATA_SERVICE_QUERY_FAILED"]
    },
    {
      appId: "supply-chain",
      method: "POST",
      status: "integrating",
      title: "采购计划",
      path: "/api/platform/v1/supply-chain-workflows",
      summary: "采购计划写入",
      errors: ["SUPPLY_CHAIN_ACTION_DENIED"]
    }
  ];

  assert.deepEqual(
    filterApiEndpoints(endpoints, { appId: "data-center", method: "GET", status: "connected" }),
    [endpoints[0]]
  );
  assert.deepEqual(filterApiEndpoints(endpoints, { query: "QUERY_FAILED" }), [endpoints[0]]);
  assert.deepEqual(filterApiEndpoints(endpoints, { query: "采购" }), [endpoints[1]]);
});

test("live URL construction accepts only registered GET query fields", () => {
  const endpoint = {
    method: "GET",
    path: "/api/platform/v1/product-catalog",
    liveTest: { enabled: true, query: ["from", "to", "platform"] }
  };
  assert.equal(
    buildApiLiveUrl(endpoint, { from: "2026-07-01", to: "2026-07-28", platform: "抖音" }),
    "/api/platform/v1/product-catalog?from=2026-07-01&to=2026-07-28&platform=%E6%8A%96%E9%9F%B3"
  );
  assert.throws(
    () => buildApiLiveUrl(endpoint, { url: "https://evil.example" }),
    error => error.code === "API_LIVE_TEST_QUERY_FORBIDDEN"
  );
  assert.throws(
    () => buildApiLiveUrl({ ...endpoint, method: "POST" }, {}),
    error => error.code === "API_LIVE_TEST_FORBIDDEN"
  );
});

test("API response previews recursively redact secrets and bound arrays", () => {
  const preview = sanitizeApiPreview({
    token: "secret",
    rows: Array.from({ length: 25 }, (_, index) => ({
      id: index,
      nested: { password: "hidden" }
    }))
  });

  assert.equal(preview.body.token, "[已遮罩]");
  assert.equal(preview.body.rows.length, 20);
  assert.equal(preview.body.rows[0].nested.password, "[已遮罩]");
  assert.equal(preview.truncated, true);
  assert.doesNotMatch(JSON.stringify(preview), /secret|hidden/);
});

test("API response previews remain within the byte limit for multibyte text", () => {
  const preview = sanitizeApiPreview(Object.fromEntries(
    Array.from({ length: 20_000 }, (_, index) => [`字段${index}`, "中文值"])
  ));
  const bytes = new TextEncoder().encode(JSON.stringify(preview.body)).byteLength;

  assert.equal(preview.truncated, true);
  assert.ok(bytes <= 100 * 1024, `预览仍有 ${bytes} bytes`);
});
