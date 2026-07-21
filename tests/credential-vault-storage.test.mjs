import assert from "node:assert/strict";
import test from "node:test";
import { credentialCryptoInternals } from "../functions/api/platform/_shared/credentialCrypto.js";
import {
  archiveCredentialEntry,
  createCredentialEntry,
  listCredentialMetadata,
  replaceCredentialEntry,
  revealCredentialEntry
} from "../functions/api/platform/_shared/credentialVaultStorage.js";

function masterKey() {
  return credentialCryptoInternals.bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function createD1Mock() {
  const entries = new Map();
  const auditRows = [];
  const permissions = [];
  return {
    entries,
    auditRows,
    permissions,
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
            entries.set(id, {
              id, scope_type: scopeType, scope_id: scopeId, category, name,
              schema_version: schemaVersion, ciphertext, iv, algorithm,
              key_version: keyVersion, version, created_at: createdAt,
              created_by: createdBy, updated_at: updatedAt, updated_by: updatedBy,
              archived_at: null, archived_by: null
            });
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
            entries.set(id, { ...current, archived_at: archivedAt, archived_by: archivedBy, version, updated_at: archivedAt, updated_by: archivedBy });
            return { success: true, meta: { changes: 1 } };
          } else if (/insert into credential_vault_audit/i.test(sql)) {
            const [id, entryId, action, fieldCategories, actorType, actorId, actorName, purpose, result, requestId, createdAt] = statement.values;
            auditRows.push({ id, entry_id: entryId, action, field_categories: fieldCategories, actor_type: actorType, actor_id: actorId, actor_name: actorName, purpose, result, request_id: requestId, created_at: createdAt });
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          if (/from credential_vault_entries/i.test(sql)) {
            return { results: [...entries.values()].filter(row => row.archived_at == null) };
          }
          return { results: [] };
        },
        async first() {
          if (/from credential_vault_entries/i.test(sql)) return entries.get(statement.values[0]) || null;
          return null;
        }
      };
      return statement;
    }
  };
}

const actor = { actorType: "employee", actorId: "user-1", actorName: "平台管理员", requestId: "req-test" };

test("create stores ciphertext while list returns metadata only", async () => {
  const db = createD1Mock();
  const created = await createCredentialEntry(db, {
    id: "cred-1",
    scopeType: "connector",
    scopeId: "douyin-1",
    category: "douyin-ecommerce",
    name: "抖音官旗登录",
    schemaVersion: 1,
    secretPayload: { loginEmail: "ops@example.com", password: "top-secret" }
  }, { ...actor, masterKey: masterKey() });

  const stored = db.entries.get("cred-1");
  assert.equal(created.hasSecret, true);
  assert.equal(stored.password, undefined);
  assert.doesNotMatch(JSON.stringify(stored), /ops@example\.com|top-secret/);
  assert.ok(stored.ciphertext);
  assert.ok(stored.iv);

  const listed = await listCredentialMetadata(db, { scopeType: "connector" });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].hasSecret, true);
  assert.equal(listed[0].ciphertext, undefined);
  assert.equal(listed[0].iv, undefined);
});

test("replace requires the current version and rotates ciphertext", async () => {
  const db = createD1Mock();
  const key = masterKey();
  await createCredentialEntry(db, {
    id: "cred-1", scopeType: "connector", scopeId: "km-1", category: "kuaimai-erp",
    name: "快麦", schemaVersion: 1, secretPayload: { password: "first" }
  }, { ...actor, masterKey: key });
  const firstCiphertext = db.entries.get("cred-1").ciphertext;

  const replaced = await replaceCredentialEntry(db, "cred-1", {
    expectedVersion: 1,
    name: "快麦 ERP",
    schemaVersion: 1,
    secretPayload: { password: "second" }
  }, { ...actor, masterKey: key });
  assert.equal(replaced.version, 2);
  assert.notEqual(db.entries.get("cred-1").ciphertext, firstCiphertext);
  await assert.rejects(
    () => replaceCredentialEntry(db, "cred-1", { expectedVersion: 1, secretPayload: { password: "third" } }, { ...actor, masterKey: key }),
    error => error.code === "CREDENTIAL_VERSION_CONFLICT"
  );
});

test("reveal decrypts only inside storage and audit never stores values", async () => {
  const db = createD1Mock();
  const key = masterKey();
  await createCredentialEntry(db, {
    id: "cred-1", scopeType: "internal", scopeId: "nas-hz", category: "nas",
    name: "杭州 NAS", schemaVersion: 1, secretPayload: { username: "nas-user", password: "nas-secret" }
  }, { ...actor, masterKey: key });

  const revealed = await revealCredentialEntry(db, "cred-1", { ...actor, masterKey: key, purpose: "检查 NAS 连接" });
  assert.deepEqual(revealed.secretPayload, { username: "nas-user", password: "nas-secret" });
  assert.doesNotMatch(JSON.stringify(db.auditRows), /nas-user|nas-secret/);
  assert.ok(db.auditRows.some(row => row.action === "reveal" && row.purpose === "检查 NAS 连接"));
});

test("archive hides an entry without deleting its audit history", async () => {
  const db = createD1Mock();
  const key = masterKey();
  await createCredentialEntry(db, {
    id: "cred-1", scopeType: "connector", scopeId: "shop-1", category: "taobao",
    name: "淘系", schemaVersion: 1, secretPayload: { password: "secret" }
  }, { ...actor, masterKey: key });
  await archiveCredentialEntry(db, "cred-1", { expectedVersion: 1 }, actor);

  assert.deepEqual(await listCredentialMetadata(db, {}), []);
  assert.equal(db.entries.has("cred-1"), true);
  assert.ok(db.auditRows.some(row => row.action === "archive"));
});
