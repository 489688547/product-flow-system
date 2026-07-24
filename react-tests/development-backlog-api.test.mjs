import assert from "node:assert/strict";
import test from "node:test";
import {
  createDevelopmentBacklogItem,
  draftDevelopmentBacklog,
  isAiConfigurationError,
  loadDevelopmentBacklog,
  runDevelopmentBacklogAction
} from "../src/state/developmentBacklogApi.js";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

test("backlog filters are sent only when load is explicitly called", async () => {
  const calls = [];
  const filters = { status: "ready", priority: "p1", moduleId: "data-center", page: 2, pageSize: 20 };
  assert.equal(calls.length, 0);
  await loadDevelopmentBacklog(filters, async (url, options) => {
    calls.push({ url, options });
    return jsonResponse({ items: [], summary: {}, pagination: {} });
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /status=ready/);
  assert.match(calls[0].url, /priority=p1/);
  assert.match(calls[0].url, /moduleId=data-center/);
  assert.match(calls[0].url, /page=2/);
  assert.equal(calls[0].options.credentials, "include");
});

test("create and action clients send stable JSON contracts", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return jsonResponse({ item: { id: "item-1", version: 2 } });
  };
  await createDevelopmentBacklogItem({ title: "新增待办" }, fetchImpl);
  await runDevelopmentBacklogAction("item-1", "claim", 1, { branch: "codex/backlog" }, fetchImpl);
  assert.equal(calls[0].url, "/api/platform/v1/development-backlog");
  assert.equal(calls[0].options.method, "POST");
  assert.deepEqual(calls[1].body, {
    action: "claim",
    expectedVersion: 1,
    branch: "codex/backlog"
  });
});

test("AI draft sends only the demand description and classifies configuration errors", async () => {
  const calls = [];
  await draftDevelopmentBacklog("修复扩展重载", async (url, options) => {
    calls.push({ url, body: JSON.parse(options.body) });
    return jsonResponse({ mode: "model", draft: { title: "修复扩展重载" } });
  });
  assert.deepEqual(calls[0], {
    url: "/api/platform/v1/development-backlog/ai-draft",
    body: { description: "修复扩展重载" }
  });
  assert.equal(isAiConfigurationError({ code: "AI_PROVIDER_NOT_READY", retryable: false }), true);
  assert.equal(isAiConfigurationError({ code: "AI_DISABLED", retryable: false }), true);
  assert.equal(isAiConfigurationError({ code: "AI_PROVIDER_TIMEOUT", retryable: true }), false);
});

test("client errors expose only stable safe metadata", async () => {
  await assert.rejects(
    () => loadDevelopmentBacklog({}, async () => jsonResponse({
      error: {
        code: "BACKLOG_ACTIVE_CONFLICT",
        message: "存在范围冲突。",
        requestId: "req-1",
        retryable: false,
        details: { conflicts: [{ displayId: "DEV-000001" }] }
      },
      debug: "raw database detail"
    }, 409)),
    error => {
      assert.equal(error.code, "BACKLOG_ACTIVE_CONFLICT");
      assert.equal(error.requestId, "req-1");
      assert.deepEqual(error.details, { conflicts: [{ displayId: "DEV-000001" }] });
      assert.doesNotMatch(JSON.stringify(error), /raw database detail/);
      return true;
    }
  );
});
