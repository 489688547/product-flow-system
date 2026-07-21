import assert from "node:assert/strict";
import test from "node:test";
import { handleDataConnectionsRequest } from "../functions/api/platform/v1/data-connections/index.js";
import { handleDataConnectionRevealRequest } from "../functions/api/platform/v1/data-connections/[id]/reveal.js";
import { readFileSync } from "node:fs";

const freshSession = {
  userId: "ops-1",
  name: "运营负责人",
  role: "employee",
  department: "运营部",
  createdAt: new Date().toISOString()
};
const readonlySession = { ...freshSession, role: "readonly" };
const outsider = { ...freshSession, userId: "brand-1", department: "品牌部" };
const executiveSession = { ...freshSession, userId: "exec-1", name: "负责人", role: "executive", department: "总经办" };

test("instance connections reuse the shared credential vault", () => {
  const storage = readFileSync(new URL("../functions/api/platform/v1/data-connections/_shared/storage.js", import.meta.url), "utf8");
  assert.match(storage, /createCredentialEntry/);
  assert.match(storage, /replaceCredentialEntry/);
  assert.match(storage, /revealCredentialEntry/);
  assert.doesNotMatch(storage, /encryptPlatformCredentials|decryptPlatformCredentials/);
});

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
    destroyed: null,
    reveals: 0,
    async list() { return [safe]; },
    async save(input) {
      this.saved = input;
      return { ...safe, loginEmail: input.loginEmail };
    },
    async destroy(input) {
      this.destroyed = input;
      return { ...safe, status: "disabled", accountLabel: "已销毁", loginEmail: undefined, version: safe.version + 1 };
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
  assert.equal((await call({ method: "DELETE", session: readonlySession, body: { id: "connection-1", expectedVersion: 1, confirmation: "销毁店铺凭证" } })).status, 403);
});

test("ordinary reads return safe account and shop metadata only", async () => {
  const response = await call();
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.canManage, true);
  assert.equal(payload.connections[0].loginEmail, "operator@example.com");
  assert.doesNotMatch(JSON.stringify(payload), /plain-secret|ciphertext|"iv"|password/i);
});

test("legacy save routes reject new store login credentials", async () => {
  const store = fakeStore();
  const response = await call({
    method: "POST",
    store,
    body: { loginEmail: "operator@example.com", password: "secret" }
  });
  const payload = await response.json();
  assert.equal(response.status, 410);
  assert.equal(payload.error.code, "DATA_CONNECTION_LOGIN_RETIRED");
  assert.equal(store.saved, null);
  assert.doesNotMatch(JSON.stringify(payload), /secret|ciphertext|"iv"/i);
});

test("destroy requires executive permission, exact confirmation and current version", async () => {
  const store = fakeStore();
  assert.equal((await call({ method: "DELETE", session: freshSession, store, body: { id: "connection-1", expectedVersion: 1, confirmation: "销毁店铺凭证" } })).status, 403);
  assert.equal((await call({ method: "DELETE", session: executiveSession, store, body: { id: "connection-1", expectedVersion: 1, confirmation: "确认" } })).status, 400);

  const response = await call({ method: "DELETE", session: executiveSession, store, body: { id: "connection-1", expectedVersion: 1, confirmation: "销毁店铺凭证" } });
  assert.equal(response.status, 200);
  assert.deepEqual(store.destroyed, { id: "connection-1", expectedVersion: 1 });
  assert.equal((await response.json()).connection.status, "disabled");
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
