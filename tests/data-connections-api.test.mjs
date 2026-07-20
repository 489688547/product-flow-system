import assert from "node:assert/strict";
import test from "node:test";
import { handleDataConnectionsRequest } from "../functions/api/platform/v1/data-connections/index.js";
import { handleDataConnectionRevealRequest } from "../functions/api/platform/v1/data-connections/[id]/reveal.js";

const freshSession = {
  userId: "ops-1",
  name: "运营负责人",
  role: "employee",
  department: "运营部",
  createdAt: new Date().toISOString()
};
const readonlySession = { ...freshSession, role: "readonly" };
const outsider = { ...freshSession, userId: "brand-1", department: "品牌部" };

function request(method = "GET", body) {
  return new Request("https://flow.example.com/api/platform/v1/data-connections", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

function fakeStore() {
  const safe = {
    id: "connection-1",
    platformId: "douyin-ecommerce",
    loginEmail: "operator@example.com",
    status: "queued",
    credentialVersion: 1,
    version: 1,
    shops: []
  };
  return {
    saved: null,
    reveals: 0,
    async list() { return [safe]; },
    async save(input) {
      this.saved = input;
      return { ...safe, loginEmail: input.loginEmail };
    },
    async reveal() {
      this.reveals += 1;
      if (this.reveals > 5) {
        const error = new Error("明文查看次数过多，请稍后再试。");
        error.status = 429;
        error.code = "DATA_CONNECTION_REVEAL_RATE_LIMITED";
        throw error;
      }
      return { loginEmail: safe.loginEmail, password: "plain-secret" };
    }
  };
}

async function call({ method = "GET", body, session = freshSession, store = fakeStore() } = {}) {
  return handleDataConnectionsRequest({
    request: request(method, body),
    env: { PRODUCT_FLOW_DB: {}, PLATFORM_CREDENTIAL_MASTER_KEY: "unused-in-test" },
    data: session ? { session } : {}
  }, { store });
}

test("data connections require an authorized DingTalk session", async () => {
  assert.equal((await call({ session: null })).status, 401);
  assert.equal((await call({ session: outsider })).status, 403);
  assert.equal((await call({ method: "POST", session: readonlySession, body: { loginEmail: "a@example.com", password: "secret" } })).status, 403);
});

test("ordinary reads return safe account and shop metadata only", async () => {
  const response = await call();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.canManage, true);
  assert.equal(payload.connections[0].loginEmail, "operator@example.com");
  assert.doesNotMatch(JSON.stringify(payload), /plain-secret|ciphertext|"iv"|password/i);
});

test("save accepts only the douyin email and password business fields", async () => {
  const store = fakeStore();
  const invalid = await call({
    method: "POST",
    store,
    body: { loginEmail: "operator@example.com", password: "secret", loginUrl: "https://evil.example" }
  });
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, "DATA_CONNECTION_FIELDS_INVALID");

  const response = await call({ method: "POST", store, body: { loginEmail: "Operator@Example.com", password: "secret" } });
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(store.saved.loginEmail, "operator@example.com");
  assert.equal(store.saved.password, "secret");
  assert.doesNotMatch(JSON.stringify(payload), /secret|ciphertext|"iv"/i);
});

test("reveal requires a fresh session and sends no-store headers", async () => {
  const store = fakeStore();
  const stale = await handleDataConnectionRevealRequest({
    request: request("POST", {}),
    env: { PRODUCT_FLOW_DB: {}, PLATFORM_CREDENTIAL_MASTER_KEY: "unused-in-test" },
    data: { session: { ...freshSession, createdAt: "2026-07-20T00:00:00.000Z" } },
    params: { id: "connection-1" }
  }, { store, now: new Date("2026-07-20T01:00:00.000Z") });
  assert.equal(stale.status, 403);
  assert.equal((await stale.json()).error.code, "DATA_CONNECTION_FRESH_SESSION_REQUIRED");

  const shown = await handleDataConnectionRevealRequest({
    request: request("POST", {}),
    env: { PRODUCT_FLOW_DB: {}, PLATFORM_CREDENTIAL_MASTER_KEY: "unused-in-test" },
    data: { session: freshSession },
    params: { id: "connection-1" }
  }, { store, now: new Date() });
  assert.equal(shown.status, 200);
  assert.equal((await shown.json()).password, "plain-secret");
  assert.equal(shown.headers.get("cache-control"), "no-store, private");
  assert.equal(shown.headers.get("pragma"), "no-cache");
  assert.equal(shown.headers.get("x-content-type-options"), "nosniff");
});

test("reveal is limited to five successful views per connection in fifteen minutes", async () => {
  const store = fakeStore();
  for (let index = 0; index < 5; index += 1) {
    const response = await handleDataConnectionRevealRequest({
      request: request("POST", {}), env: {}, data: { session: freshSession }, params: { id: "connection-1" }
    }, { store, now: new Date() });
    assert.equal(response.status, 200);
  }
  const limited = await handleDataConnectionRevealRequest({
    request: request("POST", {}), env: {}, data: { session: freshSession }, params: { id: "connection-1" }
  }, { store, now: new Date() });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, "DATA_CONNECTION_REVEAL_RATE_LIMITED");
});
