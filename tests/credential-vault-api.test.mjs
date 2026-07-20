import assert from "node:assert/strict";
import test from "node:test";
import { credentialCryptoInternals } from "../functions/api/platform/_shared/credentialCrypto.js";
import { onRequest as vaultRequest } from "../functions/api/platform/v1/credential-vault.js";
import { onRequest as vaultItemRequest } from "../functions/api/platform/v1/credential-vault/[id].js";
import { onRequest as revealRequest } from "../functions/api/platform/v1/credential-vault/[id]/reveal.js";

function masterKey() {
  return credentialCryptoInternals.bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function createD1Mock() {
  const entries = new Map();
  const auditRows = [];
  return {
    entries,
    auditRows,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (/insert into credential_vault_entries/i.test(sql)) {
            const [id, scopeType, scopeId, category, name, schemaVersion, ciphertext, iv, algorithm, keyVersion, version, createdAt, createdBy, updatedAt, updatedBy] = statement.values;
            entries.set(id, { id, scope_type: scopeType, scope_id: scopeId, category, name, schema_version: schemaVersion, ciphertext, iv, algorithm, key_version: keyVersion, version, created_at: createdAt, created_by: createdBy, updated_at: updatedAt, updated_by: updatedBy, archived_at: null, archived_by: null });
          } else if (/update credential_vault_entries\s+set name/i.test(sql)) {
            const [name, schemaVersion, ciphertext, iv, algorithm, keyVersion, version, updatedAt, updatedBy, id, expectedVersion] = statement.values;
            const current = entries.get(id);
            if (!current || current.version !== expectedVersion) return { success: true, meta: { changes: 0 } };
            entries.set(id, { ...current, name, schema_version: schemaVersion, ciphertext, iv, algorithm, key_version: keyVersion, version, updated_at: updatedAt, updated_by: updatedBy });
            return { success: true, meta: { changes: 1 } };
          } else if (/update credential_vault_entries\s+set archived_at/i.test(sql)) {
            const [archivedAt, archivedBy, version, id, expectedVersion] = statement.values;
            const current = entries.get(id);
            if (!current || current.version !== expectedVersion) return { success: true, meta: { changes: 0 } };
            entries.set(id, { ...current, archived_at: archivedAt, archived_by: archivedBy, version });
            return { success: true, meta: { changes: 1 } };
          } else if (/insert into credential_vault_audit/i.test(sql)) {
            const [id, entryId, action, fieldCategories, actorType, actorId, actorName, purpose, result, requestId, createdAt] = statement.values;
            auditRows.push({ id, entry_id: entryId, action, field_categories: fieldCategories, actor_type: actorType, actor_id: actorId, actor_name: actorName, purpose, result, request_id: requestId, created_at: createdAt });
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          if (/from credential_vault_entries/i.test(sql)) return { results: [...entries.values()].filter(row => !row.archived_at) };
          return { results: [] };
        },
        async first() {
          if (/from credential_vault_entries/i.test(sql)) return entries.get(statement.values[0]) || null;
          if (/count\(\*\).*from credential_vault_audit/i.test(sql)) {
            const [entryId, action, since] = statement.values;
            return { count: auditRows.filter(row => row.entry_id === entryId && row.action === action && row.created_at >= since).length };
          }
          return null;
        }
      };
      return statement;
    }
  };
}

const recent = new Date().toISOString();
const admin = { userId: "admin-1", name: "平台管理员", role: "executive", department: "总经办", createdAt: recent };
const operator = { userId: "ops-1", name: "运营管理员", role: "operations", department: "运营部", createdAt: recent };
const employee = { userId: "product-1", name: "产品同事", role: "product", department: "产品部", createdAt: recent };

function request(path = "", method = "GET", body) {
  return new Request(`https://flow.example.com/api/platform/v1/credential-vault${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

function env(db = createD1Mock(), includeKey = true) {
  return { PRODUCT_FLOW_DB: db, ...(includeKey ? { DATA_CREDENTIAL_MASTER_KEY: masterKey() } : {}) };
}

const connectorCredential = {
  scopeType: "connector",
  scopeId: "douyin-shop-1",
  category: "douyin-ecommerce",
  name: "抖音官旗登录",
  schemaVersion: 1,
  secretPayload: { loginEmail: "ops@example.com", password: "top-secret" }
};

test("credential vault requires a session and an authorized scope", async () => {
  const db = createD1Mock();
  const anonymous = await vaultRequest({ request: request(), env: env(db), data: {} });
  assert.equal(anonymous.status, 401);
  assert.equal((await anonymous.json()).error.code, "AUTH_SESSION_REQUIRED");

  const forbidden = await vaultRequest({ request: request(), env: env(db), data: { session: employee } });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "PERMISSION_WRITE_DENIED");
});

test("operations can create connector credentials but cannot create internal vault credentials", async () => {
  const db = createD1Mock();
  const availableEnv = env(db);
  const created = await vaultRequest({
    request: request("", "POST", connectorCredential),
    env: availableEnv,
    data: { session: operator }
  });
  assert.equal(created.status, 200);
  const payload = await created.json();
  assert.equal(payload.entry.hasSecret, true);
  assert.equal(payload.entry.ciphertext, undefined);
  assert.doesNotMatch(JSON.stringify(payload), /ops@example\.com|top-secret/);

  const internal = await vaultRequest({
    request: request("", "POST", { ...connectorCredential, scopeType: "internal", category: "nas" }),
    env: availableEnv,
    data: { session: operator }
  });
  assert.equal(internal.status, 403);
});

test("vault reports missing D1 missing key and unknown input fields", async () => {
  const noDb = await vaultRequest({ request: request(), env: {}, data: { session: admin } });
  assert.equal(noDb.status, 501);
  assert.equal((await noDb.json()).error.code, "CREDENTIAL_STORAGE_UNAVAILABLE");

  const noKey = await vaultRequest({
    request: request("", "POST", connectorCredential),
    env: env(createD1Mock(), false),
    data: { session: admin }
  });
  assert.equal(noKey.status, 503);
  assert.equal((await noKey.json()).error.code, "CREDENTIAL_KEY_UNAVAILABLE");

  const unknown = await vaultRequest({
    request: request("", "POST", { ...connectorCredential, rawCookieDump: "secret" }),
    env: env(),
    data: { session: admin }
  });
  assert.equal(unknown.status, 400);
  assert.equal((await unknown.json()).error.code, "CREDENTIAL_ENTRY_INVALID");
});

test("vault uses the deployed platform credential key while retaining the legacy data key alias", async () => {
  const platformDb = createD1Mock();
  const platformResponse = await vaultRequest({
    request: request("", "POST", connectorCredential),
    env: { PRODUCT_FLOW_DB: platformDb, PLATFORM_CREDENTIAL_MASTER_KEY: masterKey() },
    data: { session: admin }
  });
  assert.equal(platformResponse.status, 200);
  assert.equal((await platformResponse.json()).entry.hasSecret, true);

  const legacyResponse = await vaultRequest({
    request: request("", "POST", { ...connectorCredential, scopeId: "legacy-key" }),
    env: env(),
    data: { session: admin }
  });
  assert.equal(legacyResponse.status, 200);
});

test("administrator can list replace and archive a credential with version checks", async () => {
  const db = createD1Mock();
  const availableEnv = env(db);
  const createResponse = await vaultRequest({ request: request("", "POST", connectorCredential), env: availableEnv, data: { session: admin } });
  const credentialId = (await createResponse.json()).entry.id;

  const listed = await vaultRequest({ request: request(), env: availableEnv, data: { session: admin } });
  assert.equal((await listed.json()).entries.length, 1);

  const replaced = await vaultItemRequest({
    request: request(`/${credentialId}`, "PUT", { expectedVersion: 1, name: "抖音官旗", secretPayload: { password: "new-secret" } }),
    env: availableEnv,
    data: { session: admin },
    params: { id: credentialId }
  });
  assert.equal(replaced.status, 200);
  assert.equal((await replaced.json()).entry.version, 2);

  const conflict = await vaultItemRequest({
    request: request(`/${credentialId}`, "PUT", { expectedVersion: 1, name: "旧版本" }),
    env: availableEnv,
    data: { session: admin },
    params: { id: credentialId }
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "CREDENTIAL_VERSION_CONFLICT");

  const archived = await vaultItemRequest({
    request: request(`/${credentialId}`, "PUT", { expectedVersion: 2, action: "archive" }),
    env: availableEnv,
    data: { session: admin },
    params: { id: credentialId }
  });
  assert.equal(archived.status, 200);
});

test("reveal requires administrator recent login confirmation and purpose", async () => {
  const db = createD1Mock();
  const availableEnv = env(db);
  const createResponse = await vaultRequest({ request: request("", "POST", connectorCredential), env: availableEnv, data: { session: admin } });
  const credentialId = (await createResponse.json()).entry.id;

  const operationsDenied = await revealRequest({
    request: request(`/${credentialId}/reveal`, "POST", { purpose: "排查登录", confirmation: "查看加密凭证" }),
    env: availableEnv,
    data: { session: operator },
    params: { id: credentialId }
  });
  assert.equal(operationsDenied.status, 403);
  assert.equal((await operationsDenied.json()).error.code, "CREDENTIAL_REVEAL_DENIED");

  const stale = await revealRequest({
    request: request(`/${credentialId}/reveal`, "POST", { purpose: "排查登录", confirmation: "查看加密凭证" }),
    env: availableEnv,
    data: { session: { ...admin, createdAt: "2026-07-18T00:00:00.000Z" } },
    params: { id: credentialId }
  });
  assert.equal(stale.status, 401);
  assert.equal((await stale.json()).error.code, "CREDENTIAL_REAUTH_REQUIRED");

  const wrongConfirmation = await revealRequest({
    request: request(`/${credentialId}/reveal`, "POST", { purpose: "排查登录", confirmation: "确认" }),
    env: availableEnv,
    data: { session: admin },
    params: { id: credentialId }
  });
  assert.equal(wrongConfirmation.status, 400);

  const revealed = await revealRequest({
    request: request(`/${credentialId}/reveal`, "POST", { purpose: "排查登录", confirmation: "查看加密凭证" }),
    env: availableEnv,
    data: { session: admin },
    params: { id: credentialId }
  });
  assert.equal(revealed.status, 200);
  assert.match(revealed.headers.get("cache-control"), /no-store/);
  assert.deepEqual((await revealed.json()).secretPayload, connectorCredential.secretPayload);
  assert.doesNotMatch(JSON.stringify(db.auditRows), /ops@example\.com|top-secret/);
});

test("OPTIONS routes advertise only their supported methods", async () => {
  const listOptions = await vaultRequest({ request: request("", "OPTIONS"), env: {}, data: {} });
  const itemOptions = await vaultItemRequest({ request: request("/id", "OPTIONS"), env: {}, data: {}, params: { id: "id" } });
  const revealOptions = await revealRequest({ request: request("/id/reveal", "OPTIONS"), env: {}, data: {}, params: { id: "id" } });
  assert.equal(listOptions.status, 204);
  assert.equal(itemOptions.status, 204);
  assert.equal(revealOptions.status, 204);
});

test("reveal is limited to five successful requests per entry in fifteen minutes", async () => {
  const db = createD1Mock();
  const availableEnv = env(db);
  const created = await vaultRequest({ request: request("", "POST", connectorCredential), env: availableEnv, data: { session: admin } });
  const credentialId = (await created.json()).entry.id;

  for (let index = 0; index < 5; index += 1) {
    const response = await revealRequest({
      request: request(`/${credentialId}/reveal`, "POST", { purpose: `排查登录 ${index + 1}`, confirmation: "查看加密凭证" }),
      env: availableEnv,
      data: { session: admin },
      params: { id: credentialId }
    });
    assert.equal(response.status, 200);
  }

  const limited = await revealRequest({
    request: request(`/${credentialId}/reveal`, "POST", { purpose: "再次排查", confirmation: "查看加密凭证" }),
    env: availableEnv,
    data: { session: admin },
    params: { id: credentialId }
  });
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, "CREDENTIAL_RATE_LIMITED");
});
