import assert from "node:assert/strict";
import test from "node:test";
import { platformCredentialCryptoInternals } from "../functions/api/platform/_shared/credentialCrypto.js";
import {
  disablePlatformCredentials,
  listPlatformCredentialMetadata,
  platformEnv,
  readPlatformCredentials,
  savePlatformCredentials
} from "../functions/api/platform/_shared/platformCredentials.js";

function masterKey() {
  return platformCredentialCryptoInternals.bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function createD1Mock({ failAudit = false } = {}) {
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
            rows.set(platformId, {
              platform_id: platformId,
              ciphertext, iv, algorithm, key_version: keyVersion,
              configured_fields: configuredFields,
              version, enabled,
              verified_at: verifiedAt, verified_by: verifiedBy,
              updated_at: updatedAt, updated_by: updatedBy
            });
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
            if (failAudit) throw new Error("audit unavailable");
            const platformId = statement.values[1];
            const current = rows.get(platformId);
            if (normalized.includes("where not exists") && current) return { success: true, meta: { changes: 0 } };
            if (normalized.includes("where exists")) {
              const expectedVersion = statement.values.at(-1);
              if (!current || Number(current.version) !== Number(expectedVersion)) return { success: true, meta: { changes: 0 } };
            }
            const [id, , action, changedFields, result, requestId, actorId, actorName, createdAt] = statement.values;
            audits.push({ id, platform_id: platformId, action, changed_fields: changedFields, result, request_id: requestId, actor_id: actorId, actor_name: actorName, created_at: createdAt });
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

const actor = { actorId: "u-exec", actorName: "最高权限账号", requestId: "req-test" };

test("validated credentials persist as ciphertext and metadata never exposes values", async () => {
  const db = createD1Mock();
  const key = masterKey();
  const saved = await savePlatformCredentials(db, {
    platformId: "dingtalk",
    expectedVersion: 0,
    fields: { appKey: "ding-key", appSecret: "ding-secret" }
  }, { ...actor, masterKey: key, validate: async () => ({ ok: true }) });

  assert.equal(saved.version, 1);
  assert.deepEqual(saved.configuredFields, ["appKey", "appSecret"]);
  assert.doesNotMatch(JSON.stringify(db.rows.get("dingtalk")), /ding-key|ding-secret/);
  assert.doesNotMatch(JSON.stringify(db.audits), /ding-key|ding-secret/);

  const listed = await listPlatformCredentialMetadata(db);
  assert.equal(listed[0].platformId, "dingtalk");
  assert.equal(listed[0].ciphertext, undefined);
  assert.equal(listed[0].iv, undefined);
});

test("failed validation leaves the active ciphertext and version unchanged", async () => {
  const db = createD1Mock();
  const key = masterKey();
  await savePlatformCredentials(db, {
    platformId: "dingtalk", expectedVersion: 0,
    fields: { appKey: "working-key", appSecret: "working-secret" }
  }, { ...actor, masterKey: key, validate: async () => ({ ok: true }) });
  const before = { ...db.rows.get("dingtalk") };

  await assert.rejects(
    () => savePlatformCredentials(db, {
      platformId: "dingtalk", expectedVersion: 1,
      fields: { appSecret: "bad-secret" }
    }, { ...actor, masterKey: key, validate: async () => { const error = new Error("连接验证失败，原连接未受影响。"); error.code = "PLATFORM_CONNECTION_VALIDATION_FAILED"; throw error; } }),
    error => error.code === "PLATFORM_CONNECTION_VALIDATION_FAILED"
  );
  assert.deepEqual(db.rows.get("dingtalk"), before);
});

test("audit failure rolls back credential activation", async () => {
  const db = createD1Mock({ failAudit: true });
  await assert.rejects(() => savePlatformCredentials(db, {
    platformId: "dingtalk",
    expectedVersion: 0,
    fields: { appKey: "key", appSecret: "secret" }
  }, { ...actor, masterKey: masterKey(), validate: async () => ({ ok: true }) }), /audit unavailable/);
  assert.equal(db.rows.has("dingtalk"), false);
  assert.equal(db.audits.length, 0);
});

test("vault values override legacy environment and disabling restores fallback", async () => {
  const db = createD1Mock();
  const key = masterKey();
  await savePlatformCredentials(db, {
    platformId: "dingtalk", expectedVersion: 0,
    fields: { appKey: "vault-key", appSecret: "vault-secret" }
  }, { ...actor, masterKey: key, validate: async () => ({ ok: true }) });
  const env = { PRODUCT_FLOW_DB: db, PLATFORM_CREDENTIAL_MASTER_KEY: key, DINGTALK_APP_KEY: "legacy-key", DINGTALK_APP_SECRET: "legacy-secret" };

  const active = await readPlatformCredentials(env, "dingtalk");
  assert.equal(active.source, "vault");
  assert.deepEqual(active.values, { appKey: "vault-key", appSecret: "vault-secret" });
  const resolved = await platformEnv(env, "dingtalk");
  assert.equal(resolved.DINGTALK_APP_KEY, "vault-key");
  assert.equal(resolved.DINGTALK_APP_SECRET, "vault-secret");

  await disablePlatformCredentials(db, { platformId: "dingtalk", expectedVersion: 1 }, actor);
  const fallback = await readPlatformCredentials(env, "dingtalk");
  assert.equal(fallback.source, "environment");
  assert.deepEqual(fallback.values, { appKey: "legacy-key", appSecret: "legacy-secret" });
});

test("re-enabling a disabled connection preserves retained vault fields", async () => {
  const db = createD1Mock();
  const key = masterKey();
  await savePlatformCredentials(db, {
    platformId: "dingtalk", expectedVersion: 0,
    fields: { appKey: "retained-key", appSecret: "old-secret" }
  }, { ...actor, masterKey: key, validate: async () => ({ ok: true }) });
  await disablePlatformCredentials(db, { platformId: "dingtalk", expectedVersion: 1 }, actor);
  let validated;
  await savePlatformCredentials(db, {
    platformId: "dingtalk", expectedVersion: 2,
    fields: { appSecret: "new-secret" }
  }, { ...actor, masterKey: key, validate: async values => { validated = values; } });
  assert.deepEqual(validated, { appKey: "retained-key", appSecret: "new-secret" });
});

test("unknown fields and stale versions are rejected", async () => {
  const db = createD1Mock();
  const key = masterKey();
  await assert.rejects(
    () => savePlatformCredentials(db, {
      platformId: "dingtalk", expectedVersion: 0,
      fields: { appKey: "key", appSecret: "secret", cookie: "not-allowed" }
    }, { ...actor, masterKey: key, validate: async () => ({ ok: true }) }),
    error => error.code === "PLATFORM_CONNECTION_INVALID"
  );
  await savePlatformCredentials(db, {
    platformId: "dingtalk", expectedVersion: 0,
    fields: { appKey: "key", appSecret: "secret" }
  }, { ...actor, masterKey: key, validate: async () => ({ ok: true }) });
  await assert.rejects(
    () => savePlatformCredentials(db, {
      platformId: "dingtalk", expectedVersion: 0,
      fields: { appSecret: "next" }
    }, { ...actor, masterKey: key, validate: async () => ({ ok: true }) }),
    error => error.code === "PLATFORM_CONNECTION_VERSION_CONFLICT"
  );
});
