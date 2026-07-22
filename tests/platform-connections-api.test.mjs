import assert from "node:assert/strict";
import test from "node:test";
import { platformCredentialCryptoInternals } from "../functions/api/platform/_shared/credentialCrypto.js";
import { handlePlatformConnectionsRequest } from "../functions/api/platform/v1/platform-connections.js";
import { testPlatformConnection } from "../functions/api/platform/_shared/platformConnectionTesters.js";
import { platformEnv } from "../functions/api/platform/_shared/platformCredentials.js";

function masterKey() {
  return platformCredentialCryptoInternals.bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function createD1Mock() {
  const rows = new Map();
  const audits = [];
  const db = {
    rows,
    audits,
    async batch(statements) {
      const rowsBefore = new Map([...rows].map(([key, value]) => [key, { ...value }]));
      const auditLength = audits.length;
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        return results;
      } catch (error) {
        rows.clear();
        for (const [key, value] of rowsBefore) rows.set(key, value);
        audits.splice(auditLength);
        throw error;
      }
    },
    prepare(sql) {
      const normalized = String(sql).replace(/\s+/g, " ").trim().toLowerCase();
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async first() {
          if (normalized.includes("from platform_credentials")) return rows.get(statement.values[0]) || null;
          return null;
        },
        async all() {
          if (normalized.includes("from platform_credentials")) return { results: [...rows.values()] };
          return { results: [] };
        },
        async run() {
          if (normalized.startsWith("insert into platform_credentials")) {
            const [platformId, ciphertext, iv, algorithm, keyVersion, configuredFields, version, enabled, verifiedAt, verifiedBy, updatedAt, updatedBy] = statement.values;
            const current = rows.get(platformId);
            if (current && Number(current.version) !== Number(version) - 1) return { success: true, meta: { changes: 0 } };
            rows.set(platformId, { platform_id: platformId, ciphertext, iv, algorithm, key_version: keyVersion, configured_fields: configuredFields, version, enabled, verified_at: verifiedAt, verified_by: verifiedBy, updated_at: updatedAt, updated_by: updatedBy });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("update platform_credentials set enabled")) {
            const [enabled, version, updatedAt, updatedBy, platformId, expectedVersion] = statement.values;
            const current = rows.get(platformId);
            if (!current || Number(current.version) !== Number(expectedVersion)) return { success: true, meta: { changes: 0 } };
            rows.set(platformId, { ...current, enabled, version, updated_at: updatedAt, updated_by: updatedBy });
            return { success: true, meta: { changes: 1 } };
          }
          if (normalized.startsWith("insert into platform_credential_audit")) {
            const auditPlatformId = statement.values[1];
            const current = rows.get(auditPlatformId);
            if (normalized.includes("where not exists") && current) return { success: true, meta: { changes: 0 } };
            if (normalized.includes("where exists")) {
              const expectedVersion = statement.values.at(-1);
              if (!current || Number(current.version) !== Number(expectedVersion)) return { success: true, meta: { changes: 0 } };
            }
            const [id, , action, changedFields, result, requestId, actorId, actorName, createdAt] = statement.values;
            audits.push({ id, platform_id: auditPlatformId, action, changed_fields: changedFields, result, request_id: requestId, actor_id: actorId, actor_name: actorName, created_at: createdAt });
            return { success: true, meta: { changes: 1 } };
          }
          return { success: true, meta: { changes: 1 } };
        }
      };
      return statement;
    }
  };
  return db;
}

const executive = { userId: "u-exec", name: "最高权限账号", role: "executive", department: "总经办" };
const employee = { userId: "u-ops", name: "运营同事", role: "employee", department: "运营部" };
const executiveOfficeEmployee = { userId: "u-office", name: "总经办同事", role: "employee", department: "总经办" };

function request(method = "GET", body) {
  return new Request("https://product-flow-system.pages.dev/api/platform/v1/platform-connections", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

async function call({ method = "GET", body, session = executive, db = createD1Mock(), key = masterKey(), env: envOverrides = {}, validate = async () => ({ connected: true }) } = {}) {
  return handlePlatformConnectionsRequest({
    request: request(method, body),
    env: { PRODUCT_FLOW_DB: db, PLATFORM_CREDENTIAL_MASTER_KEY: key, ...envOverrides },
    data: session ? { session } : {}
  }, { testConnection: validate });
}

test("platform connection API requires a session and D1", async () => {
  assert.equal((await call({ session: null })).status, 401);
  const response = await handlePlatformConnectionsRequest({ request: request(), env: {}, data: { session: employee } });
  assert.equal(response.status, 501);
  assert.equal((await response.json()).error.code, "PLATFORM_CONNECTION_STORAGE_UNAVAILABLE");
});

test("employees read safe connection metadata but cannot write", async () => {
  const db = createD1Mock();
  const get = await call({ session: employee, db });
  const payload = await get.json();
  assert.equal(get.status, 200);
  assert.equal(payload.canManage, false);
  assert.deepEqual(payload.connections.map(item => item.platformId), ["dingtalk", "kuaimai", "lingsuan-ai-gateway", "aliyun"]);
  assert.equal(JSON.stringify(payload).includes("ciphertext"), false);

  const put = await call({ method: "PUT", session: employee, db, body: { platformId: "dingtalk", expectedVersion: 0, fields: { appKey: "key", appSecret: "secret" } } });
  assert.equal(put.status, 403);
  assert.equal((await put.json()).error.code, "PERMISSION_WRITE_DENIED");

  const officePut = await call({
    method: "PUT",
    session: executiveOfficeEmployee,
    db,
    body: { platformId: "dingtalk", expectedVersion: 0, fields: { appKey: "key", appSecret: "secret" } }
  });
  assert.equal(officePut.status, 403);
  assert.equal((await officePut.json()).error.code, "PERMISSION_WRITE_DENIED");
});

test("executive validation success saves metadata without echoing credentials", async () => {
  const db = createD1Mock();
  const seen = [];
  const response = await call({
    method: "PUT", db,
    body: { platformId: "dingtalk", expectedVersion: 0, fields: { appKey: "ding-key", appSecret: "ding-secret" } },
    validate: async (platformId, values) => { seen.push({ platformId, values }); return { connected: true }; }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.connection.status, "connected");
  assert.deepEqual(payload.connection.configuredFields, ["appKey", "appSecret"]);
  assert.deepEqual(seen, [{ platformId: "dingtalk", values: { appKey: "ding-key", appSecret: "ding-secret" } }]);
  assert.doesNotMatch(JSON.stringify(payload), /ding-key|ding-secret|ciphertext|\"iv\"/);
});

test("an unreadable vault is reported as needing attention", async () => {
  const db = createD1Mock();
  const originalKey = masterKey();
  await call({
    method: "PUT", db, key: originalKey,
    body: { platformId: "dingtalk", expectedVersion: 0, fields: { appKey: "key", appSecret: "secret" } }
  });
  const response = await call({ db, key: masterKey(), session: employee });
  const payload = await response.json();
  assert.equal(payload.connections.find(item => item.platformId === "dingtalk").status, "needs_attention");
});

test("an executive can replace one legacy environment field without re-entering every secret", async () => {
  const db = createD1Mock();
  const seen = [];
  const response = await call({
    method: "PUT",
    db,
    env: { DINGTALK_APP_KEY: "legacy-key", DINGTALK_APP_SECRET: "legacy-secret" },
    body: { platformId: "dingtalk", expectedVersion: 0, fields: { appSecret: "replacement-secret" } },
    validate: async (platformId, values) => { seen.push({ platformId, values }); return { connected: true }; }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(seen, [{ platformId: "dingtalk", values: { appKey: "legacy-key", appSecret: "replacement-secret" } }]);
  assert.deepEqual(payload.connection.configuredFields, ["appKey", "appSecret"]);
  assert.doesNotMatch(JSON.stringify(payload), /legacy-key|legacy-secret|replacement-secret/);
});

test("validation failure keeps the previous connection and returns a safe error", async () => {
  const db = createD1Mock();
  const key = masterKey();
  await call({ method: "PUT", db, key, body: { platformId: "dingtalk", expectedVersion: 0, fields: { appKey: "working-key", appSecret: "working-secret" } } });
  const before = { ...db.rows.get("dingtalk") };
  const invalid = new Error("连接验证失败，原连接未受影响。");
  invalid.code = "PLATFORM_CONNECTION_VALIDATION_FAILED";
  invalid.status = 422;
  const response = await call({
    method: "PUT", db, key,
    body: { platformId: "dingtalk", expectedVersion: 1, fields: { appSecret: "bad-secret" } },
    validate: async () => { throw invalid; }
  });
  const payload = await response.json();
  assert.equal(response.status, 422);
  assert.equal(payload.error.code, "PLATFORM_CONNECTION_VALIDATION_FAILED");
  assert.deepEqual(db.rows.get("dingtalk"), before);
  assert.doesNotMatch(JSON.stringify(payload), /bad-secret|working-secret/);
});

test("executive can disable a versioned connection", async () => {
  const db = createD1Mock();
  const key = masterKey();
  await call({ method: "PUT", db, key, body: { platformId: "dingtalk", expectedVersion: 0, fields: { appKey: "key", appSecret: "secret" } } });
  const response = await call({ method: "DELETE", db, key, body: { platformId: "dingtalk", expectedVersion: 1 } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.connection.enabled, false);
  assert.equal(payload.connection.version, 2);
});

test("provider testers perform only the expected read-only checks", async () => {
  let dingUrl = "";
  const ding = await testPlatformConnection("dingtalk", { appKey: "key", appSecret: "secret" }, async url => {
    dingUrl = String(url);
    return new Response(JSON.stringify({ errcode: 0, access_token: "temporary" }), { status: 200 });
  });
  assert.equal(ding.connected, true);
  assert.match(dingUrl, /oapi\.dingtalk\.com\/gettoken/);

  let kuaimaiBody = "";
  const kuaimai = await testPlatformConnection("kuaimai", { appKey: "key", appSecret: "secret", accessToken: "token" }, async (_url, options) => {
    kuaimaiBody = options.body;
    return new Response(JSON.stringify({ success: true, time: "2026-07-19 12:00:00" }), { status: 200 });
  });
  assert.equal(kuaimai.connected, true);
  assert.match(kuaimaiBody, /method=open\.system\.time\.get/);

  let lingsuanUrl = "";
  let lingsuanBody = "";
  const lingsuan = await testPlatformConnection("lingsuan-ai-gateway", { apiKey: "ai-key", actorAuthorization: "actor" }, async (url, options) => {
    lingsuanUrl = String(url);
    lingsuanBody = options.body;
    return new Response([
      "event: response.output_text.delta\ndata: {\"delta\":\"ok\"}\n\n",
      "event: response.completed\ndata: {\"response\":{\"usage\":{\"input_tokens\":2,\"output_tokens\":1}}}\n\n"
    ].join(""), { status: 200 });
  });
  assert.equal(lingsuan.connected, true);
  assert.equal(lingsuanUrl, "https://lingsuan.top/responses");
  assert.match(lingsuanBody, /返回 ok/);
  assert.match(lingsuanBody, /"store":false/);
  assert.doesNotMatch(lingsuanBody, /公司|销售|财务/);
});

test("AI gateway credentials use the validated vault before legacy environment values", async () => {
  const db = createD1Mock();
  const key = masterKey();
  const saved = await call({
    method: "PUT",
    db,
    key,
    env: { LINGSUAN_API_KEY: "legacy-key" },
    body: { platformId: "lingsuan-ai-gateway", expectedVersion: 0, fields: { apiKey: "vault-key", actorAuthorization: "vault-actor" } }
  });
  assert.equal(saved.status, 200);

  const resolved = await platformEnv({ PRODUCT_FLOW_DB: db, PLATFORM_CREDENTIAL_MASTER_KEY: key, LINGSUAN_API_KEY: "legacy-key" }, "lingsuan-ai-gateway");
  assert.equal(resolved.LINGSUAN_API_KEY, "vault-key");
  assert.equal(resolved.LINGSUAN_ACTOR_AUTHORIZATION, "vault-actor");
});
