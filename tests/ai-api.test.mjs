import test from "node:test";
import assert from "node:assert/strict";
import { createAiD1Mock } from "./helpers/ai-d1-mock.mjs";

const statusUrl = new URL("../functions/api/platform/v1/ai/status.js", import.meta.url);
const providerUrl = new URL("../functions/api/platform/v1/ai/provider.js", import.meta.url);
const providerTestUrl = new URL("../functions/api/platform/v1/ai/provider/test.js", import.meta.url);
const auditUrl = new URL("../functions/api/platform/v1/ai/_shared/audit.js", import.meta.url);
const fakeSecret = ["test", "secret"].join("-");
const executive = { userId: "u-1", name: "周总", department: "总经办", title: "总经理", role: "executive" };

test("AI status is authenticated flag-gated and secret-safe", async () => {
  const { onRequest } = await import(statusUrl);
  const missing = await onRequest({ request: new Request("https://flow.example.com/api/platform/v1/ai/status"), env: {}, data: {} });
  assert.equal(missing.status, 401);

  const disabled = await onRequest({ request: new Request("https://flow.example.com/api/platform/v1/ai/status"), env: {}, data: { session: executive } });
  assert.deepEqual(await disabled.json(), { enabled: false, ready: false, provider: null, allowedDomains: [], blockedDomains: [] });

  const response = await onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/status"),
    env: { PRODUCT_FLOW_DB: createAiD1Mock(), AI_ASSISTANT_ENABLED: "1", LINGSUAN_API_KEY: fakeSecret },
    data: { session: executive }
  });
  const body = await response.json();
  assert.equal(body.enabled, true);
  assert.equal(body.provider.secretConfigured, true);
  assert.ok(body.blockedDomains.includes("finance"));
  assert.doesNotMatch(JSON.stringify(body), /test-secret|apiKey|actorAuthorization/);
});

test("only non-readonly 总经办 can update or test the Provider", async () => {
  const { onRequest: providerRequest } = await import(providerUrl);
  const { onRequest: providerTestRequest } = await import(providerTestUrl);
  const db = createAiD1Mock();
  const operationsUpdate = await providerRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/provider", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: "lingsuan-responses", enabled: true })
    }),
    env: { PRODUCT_FLOW_DB: db, AI_ASSISTANT_ENABLED: "1", LINGSUAN_API_KEY: fakeSecret },
    data: { session: { name: "运营", department: "运营部", role: "operator" } }
  });
  assert.equal(operationsUpdate.status, 403);

  const readonly = await providerRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/provider", { method: "PUT", body: "{}" }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { ...executive, role: "readonly" } }
  });
  assert.equal(readonly.status, 403);

  const tested = await providerTestRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/provider/test", { method: "POST" }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { name: "运营", department: "运营部" } }
  });
  assert.equal(tested.status, 403);
});

test("executive updates safe metadata and runs only a synthetic connection test", async () => {
  const { onRequest: providerRequest } = await import(providerUrl);
  const { onRequest: providerTestRequest } = await import(providerTestUrl);
  const db = createAiD1Mock();
  const env = {
    PRODUCT_FLOW_DB: db,
    AI_ASSISTANT_ENABLED: "1",
    LINGSUAN_API_KEY: fakeSecret,
    AI_PROVIDER_FETCH: async (_url, init) => {
      assert.match(init.body, /返回 ok/);
      assert.doesNotMatch(init.body, /公司|销售|财务/);
      return new Response([
        "event: response.output_text.delta\ndata: {\"delta\":\"ok\"}\n\n",
        "event: response.completed\ndata: {\"response\":{\"usage\":{\"input_tokens\":2,\"output_tokens\":1}}}\n\n"
      ].join(""), { status: 200 });
    }
  };
  const updated = await providerRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/provider", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ providerId: "lingsuan-responses", model: "untrusted", enabled: true, apiKey: "must-not-persist" })
    }),
    env,
    data: { session: executive }
  });
  const updatedBody = await updated.json();
  assert.equal(updated.status, 200);
  assert.equal(updatedBody.provider.enabled, true);
  assert.equal(updatedBody.provider.model, "gpt-5.6-sol");
  assert.doesNotMatch(JSON.stringify([...db.records.values()]), /must-not-persist|test-secret/);

  const tested = await providerTestRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/provider/test", { method: "POST" }),
    env,
    data: { session: executive }
  });
  const testedBody = await tested.json();
  assert.equal(tested.status, 200);
  assert.equal(testedBody.connected, true);
  assert.ok(testedBody.requestId);
  assert.doesNotMatch(JSON.stringify(testedBody), /test-secret/);
});

test("D1 lease permits only one in-flight request per user", async () => {
  const { acquireAiLease, releaseAiLease } = await import(auditUrl);
  const db = createAiD1Mock();
  assert.equal(await acquireAiLease(db, "u-1", "r-1", 1_000), true);
  assert.equal(await acquireAiLease(db, "u-1", "r-2", 1_001), false);
  await releaseAiLease(db, "u-1", "r-1");
  assert.equal(await acquireAiLease(db, "u-1", "r-3", 1_002), true);
});
