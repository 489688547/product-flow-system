import test from "node:test";
import assert from "node:assert/strict";

const configUrl = new URL("../functions/api/platform/v1/ai/_shared/provider-config.js", import.meta.url);
const adapterUrl = new URL("../functions/api/platform/v1/ai/_shared/responses-adapter.js", import.meta.url);
const fakeSecret = ["test", "secret"].join("-");
const enabled = { providerId: "lingsuan-responses", enabled: true };

test("Provider configuration is allowlisted and secret-safe", async () => {
  const { resolveProviderConfig, publicProviderStatus } = await import(configUrl);
  const config = resolveProviderConfig({
    env: { LINGSUAN_API_KEY: fakeSecret, LINGSUAN_ACTOR_AUTHORIZATION: "actor-test" },
    storedProvider: {
      ...enabled,
      baseUrl: "https://example.invalid",
      responsesPath: "/capture",
      model: "untrusted-model",
      reasoningEffort: "low"
    }
  });
  assert.equal(config.endpoint, "https://lingsuan.top/responses");
  assert.equal(config.model, "gpt-5.6-sol");
  assert.equal(config.reasoningEffort, "xhigh");
  assert.equal(config.apiKey, fakeSecret);
  const publicStatus = publicProviderStatus(config);
  assert.equal(publicStatus.secretConfigured, true);
  assert.doesNotMatch(JSON.stringify(publicStatus), /test-secret|actor-test|apiKey|actorAuthorization/);
});

test("Responses request always disables storage and caps output", async () => {
  const { resolveProviderConfig } = await import(configUrl);
  const { responsesRequest } = await import(adapterUrl);
  const config = resolveProviderConfig({ env: { LINGSUAN_API_KEY: fakeSecret }, storedProvider: enabled });
  const request = responsesRequest(config, [{ role: "user", content: "返回 ok" }]);
  const body = JSON.parse(request.init.body);
  assert.equal(request.url, "https://lingsuan.top/responses");
  assert.equal(request.init.headers.authorization, `Bearer ${fakeSecret}`);
  assert.equal(body.store, false);
  assert.equal(body.stream, true);
  assert.equal(body.max_output_tokens, 2000);
  assert.equal(body.reasoning.effort, "xhigh");
});

test("Responses request adds only strict registered function tools when supplied", async () => {
  const { resolveProviderConfig } = await import(configUrl);
  const { responsesRequest } = await import(adapterUrl);
  const config = resolveProviderConfig({ env: { LINGSUAN_API_KEY: fakeSecret }, storedProvider: enabled });
  const tool = {
    type: "function",
    name: "lookup_status",
    description: "读取合成状态",
    parameters: { type: "object", properties: {}, additionalProperties: false },
    strict: true
  };
  const body = JSON.parse(responsesRequest(config, [], { tools: [tool] }).body);
  assert.deepEqual(body.tools, [tool]);
  assert.equal(body.tool_choice, "auto");
  assert.equal(body.store, false);
});

test("Responses request can force one synthetic function without changing normal auto choice", async () => {
  const { resolveProviderConfig } = await import(configUrl);
  const { responsesRequest } = await import(adapterUrl);
  const config = resolveProviderConfig({ env: { LINGSUAN_API_KEY: fakeSecret }, storedProvider: enabled });
  const tool = { type: "function", name: "lookup_status", description: "读取合成状态", parameters: { type: "object", properties: {}, required: [], additionalProperties: false }, strict: true };
  const forced = JSON.parse(responsesRequest(config, [], { tools: [tool], toolChoice: { type: "function", name: "lookup_status" } }).body);
  assert.deepEqual(forced.tool_choice, { type: "function", name: "lookup_status" });
});

test("Responses request refuses a missing server-side secret", async () => {
  const { resolveProviderConfig } = await import(configUrl);
  const { responsesRequest } = await import(adapterUrl);
  const config = resolveProviderConfig({ env: {}, storedProvider: enabled });
  assert.throws(() => responsesRequest(config, []), error => error.code === "AI_PROVIDER_SECRET_MISSING" && error.status === 503);
});

test("stream adapter emits text and usage while ignoring unknown events", async () => {
  const { resolveProviderConfig } = await import(configUrl);
  const { streamProviderResponse } = await import(adapterUrl);
  const config = resolveProviderConfig({ env: { LINGSUAN_API_KEY: fakeSecret }, storedProvider: enabled });
  const body = [
    "event: response.output_text.delta\ndata: {\"delta\":\"o\"}\n\n",
    "event: provider.unknown\ndata: {\"value\":1}\n\n",
    "event: response.output_text.delta\ndata: {\"delta\":\"k\"}\n\n",
    "event: response.completed\ndata: {\"response\":{\"usage\":{\"input_tokens\":3,\"output_tokens\":1}}}\n\n"
  ].join("");
  const events = [];
  for await (const event of streamProviderResponse({
    config,
    input: [{ role: "user", content: "返回 ok" }],
    fetchImpl: async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
  })) events.push(event);
  assert.deepEqual(events, [
    { type: "text_delta", delta: "o" },
    { type: "text_delta", delta: "k" },
    { type: "usage", inputTokens: 3, outputTokens: 1 }
  ]);
});

test("stream adapter preserves function calls for a following provider turn", async () => {
  const { resolveProviderConfig } = await import(configUrl);
  const { streamProviderResponse } = await import(adapterUrl);
  const config = resolveProviderConfig({ env: { LINGSUAN_API_KEY: fakeSecret }, storedProvider: enabled });
  const item = { type: "function_call", id: "fc-1", call_id: "call-1", name: "lookup_status", arguments: "{}" };
  const body = [
    `event: response.output_item.done\ndata: ${JSON.stringify({ item })}\n\n`,
    `event: response.completed\ndata: ${JSON.stringify({ response: { output: [item], usage: { input_tokens: 3, output_tokens: 2 } } })}\n\n`
  ].join("");
  const events = [];
  for await (const event of streamProviderResponse({
    config,
    input: [{ role: "user", content: "调用工具" }],
    tools: [{ type: "function", name: "lookup_status", description: "读取合成状态", parameters: { type: "object", properties: {}, additionalProperties: false }, strict: true }],
    fetchImpl: async () => new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } })
  })) events.push(event);
  assert.deepEqual(events, [
    { type: "output_item", item },
    { type: "function_call", callId: "call-1", name: "lookup_status", arguments: "{}", item },
    { type: "usage", inputTokens: 3, outputTokens: 2 }
  ]);
});

test("synthetic skill capability test completes a function call without company data", async () => {
  const { resolveProviderConfig } = await import(configUrl);
  const { testProviderSkillConnection } = await import(adapterUrl);
  const config = resolveProviderConfig({ env: { LINGSUAN_API_KEY: fakeSecret }, storedProvider: enabled });
  let calls = 0;
  const result = await testProviderSkillConnection({
    config,
    fetchImpl: async (_url, init) => {
      calls += 1;
      const request = JSON.parse(init.body);
      assert.equal(request.tools[0].name, "lookup_status");
      assert.doesNotMatch(init.body, /公司|销售|财务/);
      if (calls === 1) {
        assert.deepEqual(request.tool_choice, { type: "function", name: "lookup_status" });
        const item = { type: "function_call", id: "fc-1", call_id: "call-1", name: "lookup_status", arguments: "{}" };
        return new Response([
          `event: response.output_item.done\ndata: ${JSON.stringify({ item })}\n\n`,
          `event: response.completed\ndata: ${JSON.stringify({ response: { output: [item] } })}\n\n`
        ].join(""), { status: 200 });
      }
      assert.equal(request.tool_choice, "none");
      assert.ok(request.input.some(item => item.type === "function_call" && item.call_id === "call-1"));
      assert.ok(request.input.some(item => item.type === "function_call_output" && item.call_id === "call-1" && item.output === '{"ok":true}'));
      return new Response([
        "event: response.output_text.delta\ndata: {\"delta\":\"ok\"}\n\n",
        "event: response.completed\ndata: {\"response\":{\"output\":[]}}\n\n"
      ].join(""), { status: 200 });
    }
  });
  assert.equal(calls, 2);
  assert.equal(result.supported, true);
  assert.equal(result.statusCode, 200);
});

test("Provider status errors map safely without returning raw bodies", async () => {
  const { resolveProviderConfig } = await import(configUrl);
  const { testProviderConnection } = await import(adapterUrl);
  const config = resolveProviderConfig({ env: { LINGSUAN_API_KEY: fakeSecret }, storedProvider: enabled });
  for (const [status, code] of [[401, "AI_PROVIDER_AUTH_FAILED"], [429, "AI_PROVIDER_RATE_LIMITED"], [503, "AI_PROVIDER_UNAVAILABLE"]]) {
    const result = await testProviderConnection({
      config,
      fetchImpl: async (_url, init) => {
        assert.match(init.body, /返回 ok/);
        assert.doesNotMatch(init.body, /公司|销售|财务/);
        return new Response("private provider response", { status });
      }
    });
    assert.equal(result.connected, false);
    assert.equal(result.error.code, code);
    assert.doesNotMatch(JSON.stringify(result), /private provider response/);
  }
});

test("timeout and interrupted streams use stable safe errors", async () => {
  const { resolveProviderConfig } = await import(configUrl);
  const { streamProviderResponse, testProviderConnection } = await import(adapterUrl);
  const config = resolveProviderConfig({ env: { LINGSUAN_API_KEY: fakeSecret }, storedProvider: enabled });
  const timeout = await testProviderConnection({
    config,
    fetchImpl: async () => { throw new DOMException("private timeout detail", "TimeoutError"); }
  });
  assert.equal(timeout.error.code, "AI_PROVIDER_TIMEOUT");
  assert.doesNotMatch(JSON.stringify(timeout), /private timeout detail/);

  const interruptedBody = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("event: response.output_text.delta\ndata: {\"delta\":\"partial\"}\n\n"));
      controller.error(new Error("private stream detail"));
    }
  });
  await assert.rejects(async () => {
    for await (const _event of streamProviderResponse({
      config,
      input: [],
      fetchImpl: async () => new Response(interruptedBody, { status: 200 })
    })) {
      // Drain the stream to surface the reader failure.
    }
  }, error => error.code === "AI_PROVIDER_STREAM_FAILED" && !error.message.includes("private stream detail"));
});
