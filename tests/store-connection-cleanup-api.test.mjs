import assert from "node:assert/strict";
import test from "node:test";
import { handleStoreConnectionCleanupRequest } from "../functions/api/platform/v1/production-data/store-connections.js";

function request(method = "GET", body, headers = {}) {
  return new Request("https://flow.example.com/api/platform/v1/production-data/store-connections", {
    method,
    headers: { ...(body ? { "content-type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
}

const access = { userId: "exec-1", unionId: "union-1", name: "负责人", role: "executive", capabilities: ["read", "write"] };
const summary = { storeCredentialsWithSecret: 2, storeConnectorInstances: 2, legacyConnections: 1, activeBrowserTasks: 1 };

test("production store cleanup supports read-only summary with personal-token authorization", async () => {
  const response = await handleStoreConnectionCleanupRequest({ request: request(), env: { PRODUCT_FLOW_DB: {} } }, {
    authorize: async () => access,
    summarize: async () => summary
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).summary, summary);
});

test("production store cleanup requires unlock and exact irreversible confirmation", async () => {
  let cleanupCalls = 0;
  const dependencies = {
    authorize: async () => access,
    requireUnlock: async () => ({ reason: "退役店铺网页登录" }),
    summarize: async () => summary,
    cleanup: async () => { cleanupCalls += 1; return { before: summary, after: { ...summary, storeCredentialsWithSecret: 0 } }; }
  };
  const invalid = await handleStoreConnectionCleanupRequest({
    request: request("POST", { confirmation: "确认" }), env: { PRODUCT_FLOW_DB: {} }
  }, dependencies);
  assert.equal(invalid.status, 400);
  assert.equal(cleanupCalls, 0);

  const response = await handleStoreConnectionCleanupRequest({
    request: request("POST", { confirmation: "销毁店铺凭证" }, { "x-pfs-production-unlock": "unlock" }),
    env: { PRODUCT_FLOW_DB: {} }
  }, dependencies);
  assert.equal(response.status, 200);
  assert.equal(cleanupCalls, 1);
  assert.equal((await response.json()).after.storeCredentialsWithSecret, 0);
});
