import assert from "node:assert/strict";
import test from "node:test";
import { handleBrowserAgentTasksRequest } from "../functions/api/platform/v1/browser-agent/tasks.js";
import { handleBrowserAgentCredentialRequest } from "../functions/api/platform/v1/browser-agent/tasks/[id]/credential.js";
import { handleBrowserAgentResultRequest } from "../functions/api/platform/v1/browser-agent/tasks/[id]/result.js";

const runner = { id: "runner-1", name: "公司 Mac", allowedScope: { platforms: ["douyin-ecommerce"] } };

function fakeStore() {
  return {
    results: [],
    async claim() {
      return [{
        id: "task-1",
        type: "douyin_login_verification",
        resourceType: "connection_identity",
        schemaVersion: "v1",
        platformId: "douyin-ecommerce",
        status: "claimed",
        loginUrl: "https://fxg.jinritemai.com/login/common?channel=zhaoshang",
        grant: "bat_once-only",
        grantExpiresAt: new Date(Date.now() + 300000).toISOString()
      }];
    },
    async credential(taskId, grant) {
      if (taskId !== "task-1" || grant !== "bat_once-only") {
        const error = new Error("任务凭证无效或已使用。");
        error.status = 401;
        error.code = "BROWSER_AGENT_GRANT_INVALID";
        throw error;
      }
      return {
        platformId: "douyin-ecommerce",
        accountLabel: "operator@example.com",
        credentialSchemaId: "email-password-v1",
        credentials: { password: "plain-secret" },
        loginUrl: "https://fxg.jinritemai.com/login/common?channel=zhaoshang"
      };
    },
    async result(taskId, value) { this.results.push({ taskId, value }); return { status: value.status }; }
  };
}

function request(url, method = "GET", body, token = "runner-token") {
  return new Request(url, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
}

test("browser agent task claims require an explicitly scoped device", async () => {
  const denied = await handleBrowserAgentTasksRequest({
    request: request("https://flow.example.com/api/platform/v1/browser-agent/tasks"), env: { PRODUCT_FLOW_DB: {} }, data: {}
  }, { store: fakeStore(), authenticate: async () => ({ ...runner, allowedScope: { platforms: ["抖音"] } }) });
  assert.equal(denied.status, 403);
  assert.equal((await denied.json()).error.code, "BROWSER_AGENT_SCOPE_DENIED");
});

test("claimed tasks expose one-time grants but never login credentials", async () => {
  const response = await handleBrowserAgentTasksRequest({
    request: request("https://flow.example.com/api/platform/v1/browser-agent/tasks"), env: { PRODUCT_FLOW_DB: {} }, data: {}
  }, { store: fakeStore(), authenticate: async () => runner });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.match(payload.tasks[0].grant, /^bat_/);
  assert.equal(payload.tasks[0].loginUrl, "https://fxg.jinritemai.com/login/common?channel=zhaoshang");
  assert.doesNotMatch(JSON.stringify(payload), /operator@example|plain-secret|password/i);
});

test("a task grant returns credentials once with private no-store headers", async () => {
  const response = await handleBrowserAgentCredentialRequest({
    request: request("https://flow.example.com/api/platform/v1/browser-agent/tasks/task-1/credential", "POST", undefined, "bat_once-only"),
    env: { PRODUCT_FLOW_DB: {} }, data: {}, params: { id: "task-1" }
  }, { store: fakeStore() });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.accountLabel, "operator@example.com");
  assert.equal(payload.credentialSchemaId, "email-password-v1");
  assert.equal(payload.credentials.password, "plain-secret");
  assert.equal(response.headers.get("cache-control"), "no-store, private");
  assert.equal(response.headers.get("pragma"), "no-cache");
});

test("result updates allow human wait and safe recognized shop data", async () => {
  const store = fakeStore();
  const waiting = await handleBrowserAgentResultRequest({
    request: request("https://flow.example.com/api/platform/v1/browser-agent/tasks/task-1/result", "POST", { status: "waiting_human_verification" }),
    env: { PRODUCT_FLOW_DB: {} }, data: {}, params: { id: "task-1" }
  }, { store, authenticate: async () => runner });
  assert.equal(waiting.status, 200);

  const success = await handleBrowserAgentResultRequest({
    request: request("https://flow.example.com/api/platform/v1/browser-agent/tasks/task-1/result", "POST", {
      status: "succeeded",
      shops: [{ shopId: "shop-1", shopName: "品牌旗舰店", shopAvatarUrl: "https://img.example/shop.png" }]
    }), env: { PRODUCT_FLOW_DB: {} }, data: {}, params: { id: "task-1" }
  }, { store, authenticate: async () => runner });
  assert.equal(success.status, 200);
  assert.equal(store.results.at(-1).value.shops[0].shopName, "品牌旗舰店");
});

test("result payload rejects browser secrets and captures", async () => {
  for (const body of [
    { status: "succeeded", password: "secret" },
    { status: "succeeded", cookie: "secret" },
    { status: "succeeded", verificationCode: "1234" },
    { status: "succeeded", rawHtml: "<html>" },
    { status: "succeeded", screenshot: "base64" }
  ]) {
    const response = await handleBrowserAgentResultRequest({
      request: request("https://flow.example.com/api/platform/v1/browser-agent/tasks/task-1/result", "POST", body),
      env: { PRODUCT_FLOW_DB: {} }, data: {}, params: { id: "task-1" }
    }, { store: fakeStore(), authenticate: async () => runner });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.code, "BROWSER_AGENT_RESULT_SENSITIVE");
  }
});
