import test from "node:test";
import assert from "node:assert/strict";
import { createAiD1Mock } from "./helpers/ai-d1-mock.mjs";

const statusUrl = new URL("../functions/api/platform/v1/ai/status.js", import.meta.url);
const providerUrl = new URL("../functions/api/platform/v1/ai/provider.js", import.meta.url);
const providerTestUrl = new URL("../functions/api/platform/v1/ai/provider/test.js", import.meta.url);
const auditUrl = new URL("../functions/api/platform/v1/ai/_shared/audit.js", import.meta.url);
const chatUrl = new URL("../functions/api/platform/v1/ai/chat.js", import.meta.url);
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
  let providerCalls = 0;
  const env = {
    PRODUCT_FLOW_DB: db,
    AI_ASSISTANT_ENABLED: "1",
    LINGSUAN_API_KEY: fakeSecret,
    AI_PROVIDER_FETCH: async (_url, init) => {
      providerCalls += 1;
      assert.doesNotMatch(init.body, /公司|销售|财务/);
      if (providerCalls === 1) {
        assert.match(init.body, /返回 ok/);
        return new Response([
          "event: response.output_text.delta\ndata: {\"delta\":\"ok\"}\n\n",
          "event: response.completed\ndata: {\"response\":{\"usage\":{\"input_tokens\":2,\"output_tokens\":1}}}\n\n"
        ].join(""), { status: 200 });
      }
      const request = JSON.parse(init.body);
      assert.equal(request.tools[0].name, "lookup_status");
      if (providerCalls === 2) {
        const item = { type: "function_call", id: "fc-1", call_id: "call-1", name: "lookup_status", arguments: "{}" };
        return new Response([
          `event: response.output_item.done\ndata: ${JSON.stringify({ item })}\n\n`,
          `event: response.completed\ndata: ${JSON.stringify({ response: { output: [item] } })}\n\n`
        ].join(""), { status: 200 });
      }
      assert.ok(request.input.some(item => item.type === "function_call_output" && item.call_id === "call-1"));
      return new Response([
        "event: response.output_text.delta\ndata: {\"delta\":\"ok\"}\n\n",
        "event: response.completed\ndata: {\"response\":{\"output\":[]}}\n\n"
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
  assert.equal(testedBody.skillsSupported, true);
  assert.equal(providerCalls, 3);
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

test("chat rejects excess messages and ignores client authority fields", async () => {
  const { onRequest: chatRequest } = await import(chatUrl);
  const db = createAiD1Mock({ providerEnabled: true });
  const response = await chatRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: Array.from({ length: 13 }, (_, index) => ({ role: "user", content: `问题 ${index}` })),
        role: "executive",
        allowedDomains: ["finance"],
        companyState: { secret: true }
      })
    }),
    env: { PRODUCT_FLOW_DB: db, AI_ASSISTANT_ENABLED: "1", LINGSUAN_API_KEY: fakeSecret },
    data: { session: executive }
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error.code, "AI_MESSAGES_INVALID");
});

test("chat blocks user-pasted financial values before any Provider call", async () => {
  const { onRequest: chatRequest } = await import(chatUrl);
  let providerCalled = false;
  const response = await chatRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "请分析本月利润 123456 元和预算差异" }] })
    }),
    env: {
      PRODUCT_FLOW_DB: createAiD1Mock({ providerEnabled: true }),
      AI_ASSISTANT_ENABLED: "1",
      LINGSUAN_API_KEY: fakeSecret,
      AI_PROVIDER_FETCH: async () => { providerCalled = true; return new Response(""); }
    },
    data: { session: executive }
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "AI_FINANCE_TRANSFER_BLOCKED");
  assert.equal(providerCalled, false);
});

test("chat emits governed metadata finance exclusion sources and completion", async () => {
  const { onRequest: chatRequest } = await import(chatUrl);
  const db = createAiD1Mock({ providerEnabled: true });
  const response = await chatRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [{ role: "user", content: "今天最需要关注什么？" }],
        appHint: { screen: "home", detail: "" },
        role: "executive",
        allowedDomains: ["finance"],
        companyState: { note: "client-secret-marker" }
      })
    }),
    env: {
      PRODUCT_FLOW_DB: db,
      AI_ASSISTANT_ENABLED: "1",
      LINGSUAN_API_KEY: fakeSecret,
      AI_PROVIDER_FETCH: async (_url, init) => {
        assert.doesNotMatch(init.body, /client-secret-marker/);
        assert.match(init.body, /BEGIN_COMPANY_REFERENCE/);
        return new Response([
          "event: response.output_text.delta\ndata: {\"delta\":\"关注项目风险\"}\n\n",
          "event: response.completed\ndata: {\"response\":{\"usage\":{\"input_tokens\":10,\"output_tokens\":4}}}\n\n"
        ].join(""), { status: 200 });
      }
    },
    data: { session: executive }
  });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") || "", /text\/event-stream/);
  const text = await response.text();
  assert.match(text, /event: meta/);
  assert.match(text, /finance/);
  assert.match(text, /event: text_delta/);
  assert.match(text, /event: sources/);
  assert.match(text, /event: usage/);
  assert.match(text, /event: done/);
  assert.doesNotMatch(text, /test-secret|client-secret-marker/);
  assert.equal(db.audits.length, 1);
  assert.doesNotMatch(JSON.stringify(db.audits), /今天最需要关注|关注项目风险|client-secret-marker/);
  assert.equal(db.leases.size, 0);
});

test("chat enforces one in-flight request and releases the lease after Provider failure", async () => {
  const { onRequest: chatRequest } = await import(chatUrl);
  const { acquireAiLease, releaseAiLease } = await import(auditUrl);
  const db = createAiD1Mock({ providerEnabled: true });
  await acquireAiLease(db, executive.userId, "existing", Date.now());
  const request = () => new Request("https://flow.example.com/api/platform/v1/ai/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "分析风险" }] })
  });
  const conflict = await chatRequest({
    request: request(),
    env: { PRODUCT_FLOW_DB: db, AI_ASSISTANT_ENABLED: "1", LINGSUAN_API_KEY: fakeSecret },
    data: { session: executive }
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "AI_REQUEST_IN_FLIGHT");
  await releaseAiLease(db, executive.userId, "existing");

  const failed = await chatRequest({
    request: request(),
    env: {
      PRODUCT_FLOW_DB: db,
      AI_ASSISTANT_ENABLED: "1",
      LINGSUAN_API_KEY: fakeSecret,
      AI_PROVIDER_FETCH: async () => new Response("private upstream body", { status: 503 })
    },
    data: { session: executive }
  });
  const text = await failed.text();
  assert.match(text, /AI_PROVIDER_UNAVAILABLE/);
  assert.doesNotMatch(text, /private upstream body/);
  assert.equal(db.leases.size, 0);
});

test("cancelling a streamed answer aborts the Provider and records no content", async () => {
  const { onRequest: chatRequest } = await import(chatUrl);
  const db = createAiD1Mock({ providerEnabled: true });
  let providerAborted = false;
  const response = await chatRequest({
    request: new Request("https://flow.example.com/api/platform/v1/ai/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: [{ role: "user", content: "分析当前项目" }] })
    }),
    env: {
      PRODUCT_FLOW_DB: db,
      AI_ASSISTANT_ENABLED: "1",
      LINGSUAN_API_KEY: fakeSecret,
      AI_PROVIDER_FETCH: async (_url, init) => new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          providerAborted = true;
          reject(new DOMException("cancelled", "AbortError"));
        }, { once: true });
      })
    },
    data: { session: executive }
  });
  await response.body.cancel();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(providerAborted, true);
  assert.equal(db.leases.size, 0);
  assert.equal(db.audits.length, 1);
  assert.doesNotMatch(JSON.stringify(db.audits), /分析当前项目/);
});
