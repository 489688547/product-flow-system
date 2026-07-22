import assert from "node:assert/strict";
import test from "node:test";
import { platformCredentialCryptoInternals } from "../functions/api/platform/_shared/credentialCrypto.js";
import { savePlatformCredentials } from "../functions/api/platform/_shared/platformCredentials.js";
import { onRequest as revealRequest } from "../functions/api/platform/v1/platform-connections/[platformId]/reveal.js";
import { createPlatformCredentialD1Mock } from "./helpers/platform-credential-d1-mock.mjs";

function masterKey() {
  return platformCredentialCryptoInternals.bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

const recent = new Date().toISOString();
const executive = { userId: "u-exec", name: "最高权限账号", role: "executive", department: "总经办", createdAt: recent };
const employee = { userId: "u-employee", name: "普通员工", role: "employee", department: "产品部", createdAt: recent };
const executiveOfficeEmployee = { userId: "u-office", name: "总经办同事", role: "employee", department: "总经办", createdAt: recent };

function request(platformId = "lingsuan-ai-gateway", body = { purpose: "确认公司 AI 凭据", confirmation: "查看灵算凭据" }) {
  return new Request(`https://product-flow-system.pages.dev/api/platform/v1/platform-connections/${platformId}/reveal`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

async function setup() {
  const db = createPlatformCredentialD1Mock();
  const key = masterKey();
  await savePlatformCredentials(db, {
    platformId: "lingsuan-ai-gateway",
    expectedVersion: 0,
    fields: { apiKey: "lingsuan-secret", actorAuthorization: "actor-secret" }
  }, {
    masterKey: key,
    actorId: executive.userId,
    actorName: executive.name,
    requestId: "req-save",
    validate: async () => ({ connected: true })
  });
  return { db, key, env: { PRODUCT_FLOW_DB: db, PLATFORM_CREDENTIAL_MASTER_KEY: key } };
}

test("fresh executive can reveal the active Lingsuan vault values with no-store headers", async () => {
  const { db, env } = await setup();
  const response = await revealRequest({
    request: request(),
    env,
    data: { session: executive },
    params: { platformId: "lingsuan-ai-gateway" }
  });
  const payload = await response.json();

  assert.equal(response.status, 200);
  assert.match(response.headers.get("cache-control") || "", /no-store/);
  assert.equal(payload.platformId, "lingsuan-ai-gateway");
  assert.deepEqual(payload.fields, { apiKey: "lingsuan-secret", actorAuthorization: "actor-secret" });
  assert.ok(Date.parse(payload.expiresAt) > Date.parse(payload.revealedAt));
  assert.doesNotMatch(JSON.stringify(db.audits), /lingsuan-secret|actor-secret/);
});

test("reveal rejects non-executive stale session invalid confirmation and unsupported platform", async () => {
  const { env } = await setup();
  const cases = [
    { session: employee, platformId: "lingsuan-ai-gateway", body: undefined, status: 403, code: "CREDENTIAL_REVEAL_DENIED" },
    { session: executiveOfficeEmployee, platformId: "lingsuan-ai-gateway", body: undefined, status: 403, code: "CREDENTIAL_REVEAL_DENIED" },
    { session: { ...executive, createdAt: "2026-07-01T00:00:00.000Z" }, platformId: "lingsuan-ai-gateway", body: undefined, status: 401, code: "CREDENTIAL_REAUTH_REQUIRED" },
    { session: executive, platformId: "lingsuan-ai-gateway", body: { purpose: "确认", confirmation: "错误短语" }, status: 400, code: "PLATFORM_CREDENTIAL_REVEAL_INVALID" },
    { session: executive, platformId: "dingtalk", body: undefined, status: 404, code: "PLATFORM_CREDENTIAL_REVEAL_UNAVAILABLE" }
  ];

  for (const item of cases) {
    const response = await revealRequest({
      request: request(item.platformId, item.body),
      env,
      data: { session: item.session },
      params: { platformId: item.platformId }
    });
    assert.equal(response.status, item.status);
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    assert.equal((await response.json()).error.code, item.code);
  }
});

test("environment fallback values cannot be revealed", async () => {
  const db = createPlatformCredentialD1Mock();
  const response = await revealRequest({
    request: request(),
    env: { PRODUCT_FLOW_DB: db, PLATFORM_CREDENTIAL_MASTER_KEY: masterKey(), LINGSUAN_API_KEY: "environment-secret" },
    data: { session: executive },
    params: { platformId: "lingsuan-ai-gateway" }
  });
  const payload = await response.json();
  assert.equal(response.status, 404);
  assert.equal(payload.error.code, "PLATFORM_CREDENTIAL_REVEAL_UNAVAILABLE");
  assert.doesNotMatch(JSON.stringify(payload), /environment-secret/);
});

test("sixth successful reveal in fifteen minutes is rate limited", async () => {
  const { db, env } = await setup();
  for (let index = 0; index < 5; index += 1) {
    const response = await revealRequest({
      request: request("lingsuan-ai-gateway", { purpose: `确认 ${index + 1}`, confirmation: "查看灵算凭据" }),
      env,
      data: { session: executive },
      params: { platformId: "lingsuan-ai-gateway" }
    });
    assert.equal(response.status, 200);
  }
  const limited = await revealRequest({
    request: request(),
    env,
    data: { session: executive },
    params: { platformId: "lingsuan-ai-gateway" }
  });
  assert.equal(limited.status, 429);
  assert.match(limited.headers.get("cache-control") || "", /no-store/);
  assert.equal((await limited.json()).error.code, "PLATFORM_CREDENTIAL_REVEAL_RATE_LIMITED");
});

test("concurrent reveals atomically honor the fifth-success limit", async () => {
  const { db, env } = await setup();
  const now = new Date().toISOString();
  for (let index = 0; index < 4; index += 1) {
    db.audits.push({
      platform_id: "lingsuan-ai-gateway",
      action: "reveal",
      result: "success",
      created_at: now
    });
  }

  const responses = await Promise.all([1, 2].map(index => revealRequest({
    request: request("lingsuan-ai-gateway", { purpose: `并发确认 ${index}`, confirmation: "查看灵算凭据" }),
    env,
    data: { session: executive },
    params: { platformId: "lingsuan-ai-gateway" }
  })));

  assert.deepEqual(responses.map(response => response.status).sort(), [200, 429]);
  assert.equal(db.audits.filter(row => row.action === "reveal" && row.result === "success").length, 5);
});
