import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/data-center/connectors.js";

function createD1Mock() {
  const connectors = new Map();
  const vaultItems = new Map();
  const auditRows = [];
  return {
    connectors,
    vaultItems,
    auditRows,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (/insert into data_connector_instances/i.test(sql)) {
            const [id, connectorId, name, companySubject, accountType, captureMethod, consoleUrl, datasets, owner, runnerId, credentialEntryId, schedule, timeBasis, timezone, status, enabled, version, createdAt, createdBy, updatedAt, updatedBy] = statement.values;
            const current = connectors.get(id);
            connectors.set(id, {
              id, connector_id: connectorId, name, company_subject: companySubject,
              account_type: accountType, capture_method: captureMethod, console_url: consoleUrl,
              datasets, owner, runner_id: runnerId, credential_entry_id: credentialEntryId,
              schedule, time_basis: timeBasis, timezone, status, enabled, version,
              last_validated_at: current?.last_validated_at || null,
              last_success_at: current?.last_success_at || null,
              last_data_date: current?.last_data_date || null,
              created_at: current?.created_at || createdAt,
              created_by: current?.created_by || createdBy,
              updated_at: updatedAt, updated_by: updatedBy,
              archived_at: null, archived_by: null
            });
          } else if (/insert into internal_vault_items/i.test(sql)) {
            const [id, itemType, name, companySubject, location, address, protocol, resourcePath, owner, purpose, reviewDate, credentialEntryId, status, version, createdAt, createdBy, updatedAt, updatedBy] = statement.values;
            vaultItems.set(id, { id, item_type: itemType, name, company_subject: companySubject, location, address, protocol, resource_path: resourcePath, owner, purpose, review_date: reviewDate, credential_entry_id: credentialEntryId, status, version, created_at: createdAt, created_by: createdBy, updated_at: updatedAt, updated_by: updatedBy, archived_at: null, archived_by: null });
          } else if (/update data_connector_instances\s+set archived_at/i.test(sql)) {
            const [archivedAt, archivedBy, version, id, expectedVersion] = statement.values;
            const current = connectors.get(id);
            if (!current || current.version !== expectedVersion) return { success: true, meta: { changes: 0 } };
            connectors.set(id, { ...current, archived_at: archivedAt, archived_by: archivedBy, version });
            return { success: true, meta: { changes: 1 } };
          } else if (/insert into data_audit_logs/i.test(sql)) {
            const [entityType, id, payload, updatedAt, updatedBy] = statement.values;
            auditRows.push({ entity_type: entityType, id, payload, updated_at: updatedAt, updated_by: updatedBy });
          }
          return { success: true, meta: { changes: 1 } };
        },
        async all() {
          if (/from data_connector_instances/i.test(sql)) return { results: [...connectors.values()].filter(row => !row.archived_at) };
          if (/from internal_vault_items/i.test(sql)) return { results: [...vaultItems.values()].filter(row => !row.archived_at) };
          return { results: [] };
        },
        async first() {
          if (/from data_connector_instances/i.test(sql)) return connectors.get(statement.values[0]) || null;
          if (/from internal_vault_items/i.test(sql)) return vaultItems.get(statement.values[0]) || null;
          return null;
        }
      };
      return statement;
    }
  };
}

const admin = { userId: "admin", name: "平台管理员", role: "executive", department: "总经办" };
const operator = { userId: "ops", name: "运营管理员", role: "operations", department: "运营部" };
const finance = { userId: "finance", name: "财务同事", role: "finance", department: "财务部" };
const outsider = { userId: "brand", name: "品牌同事", role: "brand", department: "品牌部" };

function request(method = "GET", body) {
  return new Request("https://flow.example.com/api/data-center/connectors", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

const instance = {
  connectorId: "douyin-ecommerce",
  name: "抖音官旗",
  companySubject: "测试公司",
  captureMethod: "browser",
  consoleUrl: "https://example.com/console",
  datasets: ["orders", "products"],
  owner: "运营部",
  credentialEntryId: "cred-1",
  enabled: true
};

test("connector API requires data-center view permission and D1", async () => {
  const db = createD1Mock();
  const anonymous = await onRequest({ request: request(), env: { PRODUCT_FLOW_DB: db }, data: {} });
  assert.equal(anonymous.status, 401);

  const forbidden = await onRequest({ request: request(), env: { PRODUCT_FLOW_DB: db }, data: { session: outsider } });
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, "PERMISSION_VIEW_DENIED");

  const missing = await onRequest({ request: request(), env: {}, data: { session: finance } });
  assert.equal(missing.status, 501);
  assert.equal((await missing.json()).error.code, "DATA_STORAGE_UNAVAILABLE");
});

test("operations save a connector as pending validation and finance can read it", async () => {
  const db = createD1Mock();
  const saved = await onRequest({
    request: request("PUT", { expectedVersion: 0, instance: { ...instance, status: "healthy" } }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: operator }
  });
  assert.equal(saved.status, 200);
  const savedPayload = await saved.json();
  assert.equal(savedPayload.instance.status, "pending_validation");
  assert.equal(savedPayload.instance.timeBasis, "create_time");
  assert.equal(savedPayload.instance.timezone, "Asia/Shanghai");
  assert.equal(savedPayload.instance.schedule, "07:30");
  assert.equal(savedPayload.instance.createdBy, operator.name);
  assert.equal(savedPayload.instance.updatedBy, operator.name);

  const listed = await onRequest({ request: request(), env: { PRODUCT_FLOW_DB: db }, data: { session: finance } });
  const payload = await listed.json();
  assert.equal(payload.connectors.length, 1);
  assert.equal(payload.connectors[0].credentialEntryId, "cred-1");
  assert.equal(JSON.stringify(payload).includes("password"), false);
});

test("connector audit actors are derived from the authenticated session", async () => {
  const db = createD1Mock();
  const forged = await onRequest({
    request: request("PUT", { expectedVersion: 0, instance: { ...instance, createdBy: "伪造负责人", updatedBy: "伪造负责人" } }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: operator }
  });
  assert.equal(forged.status, 400);
  assert.equal((await forged.json()).synced, false);
  assert.equal(db.connectors.size, 0);
});

test("connector API rejects secret fields and credential URLs", async () => {
  const db = createD1Mock();
  const secret = await onRequest({
    request: request("PUT", { expectedVersion: 0, instance: { ...instance, password: "secret" } }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(secret.status, 400);
  assert.equal((await secret.json()).error.code, "DATA_CONNECTOR_INVALID");

  const credentialUrl = await onRequest({
    request: request("PUT", { expectedVersion: 0, instance: { ...instance, consoleUrl: "https://user:pass@example.com/" } }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(credentialUrl.status, 400);
});

test("finance cannot write and operations cannot write internal vault items", async () => {
  const db = createD1Mock();
  const financeWrite = await onRequest({
    request: request("PUT", { expectedVersion: 0, instance }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: finance }
  });
  assert.equal(financeWrite.status, 403);

  const internal = await onRequest({
    request: request("PUT", { expectedVersion: 0, vaultItem: { itemType: "nas", name: "杭州 NAS", location: "杭州", credentialEntryId: "cred-nas" } }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(internal.status, 403);
});

test("administrator saves internal vault metadata without plaintext", async () => {
  const db = createD1Mock();
  const response = await onRequest({
    request: request("PUT", { expectedVersion: 0, vaultItem: { itemType: "nas", name: "杭州 NAS", location: "杭州", protocol: "SMB", address: "nas.example.internal", resourcePath: "/素材", owner: "平台管理员", credentialEntryId: "cred-nas" } }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: admin }
  });
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.vaultItem.itemType, "nas");
  assert.equal(payload.vaultItem.status, "pending_validation");
  assert.equal(JSON.stringify(payload).includes("secretPayload"), false);
});

test("connector updates require the current version and archive is administrator-only", async () => {
  const db = createD1Mock();
  const created = await onRequest({ request: request("PUT", { expectedVersion: 0, instance }), env: { PRODUCT_FLOW_DB: db }, data: { session: operator } });
  const createdInstance = (await created.json()).instance;

  const updated = await onRequest({
    request: request("PUT", { expectedVersion: 1, instance: { ...instance, id: createdInstance.id, name: "抖音官旗 2" } }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(updated.status, 200);
  assert.equal((await updated.json()).instance.version, 2);

  const conflict = await onRequest({
    request: request("PUT", { expectedVersion: 1, instance: { ...instance, id: createdInstance.id, name: "旧修改" } }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(conflict.status, 409);
  assert.equal((await conflict.json()).error.code, "DATA_CONNECTOR_VERSION_CONFLICT");

  const deniedArchive = await onRequest({
    request: request("PUT", { action: "archive", id: createdInstance.id, expectedVersion: 2 }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(deniedArchive.status, 403);

  const archived = await onRequest({
    request: request("PUT", { action: "archive", id: createdInstance.id, expectedVersion: 2 }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: admin }
  });
  assert.equal(archived.status, 200);
});

test("store connector destruction is administrator-only and needs exact confirmation", async () => {
  const db = createD1Mock();
  const created = await onRequest({
    request: request("PUT", { expectedVersion: 0, instance: { ...instance, credentialEntryId: "" } }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  const createdInstance = (await created.json()).instance;

  const denied = await onRequest({
    request: request("PUT", { action: "destroy", id: createdInstance.id, expectedVersion: 1, confirmation: "销毁店铺凭证" }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(denied.status, 403);

  const invalid = await onRequest({
    request: request("PUT", { action: "destroy", id: createdInstance.id, expectedVersion: 1, confirmation: "确认" }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: admin }
  });
  assert.equal(invalid.status, 400);

  const destroyed = await onRequest({
    request: request("PUT", { action: "destroy", id: createdInstance.id, expectedVersion: 1, confirmation: "销毁店铺凭证" }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: admin }
  });
  assert.equal(destroyed.status, 200);
  assert.ok(db.connectors.get(createdInstance.id).archived_at);
});

test("OPTIONS advertises PUT and unsupported methods are rejected", async () => {
  const options = await onRequest({ request: request("OPTIONS"), env: {}, data: {} });
  assert.equal(options.status, 204);
  assert.match(options.headers.get("access-control-allow-methods"), /PUT/);
  const deleted = await onRequest({ request: request("DELETE"), env: {}, data: {} });
  assert.equal(deleted.status, 405);
});

test("connector changes audit field names without storing values", async () => {
  const db = createD1Mock();
  await onRequest({ request: request("PUT", { expectedVersion: 0, instance }), env: { PRODUCT_FLOW_DB: db }, data: { session: operator } });
  assert.equal(db.auditRows.length, 1);
  const audit = JSON.parse(db.auditRows[0].payload);
  assert.equal(audit.action, "create_connector");
  assert.ok(audit.changedFields.includes("consoleUrl"));
  assert.doesNotMatch(JSON.stringify(db.auditRows), /测试公司|example\.com|cred-1/);
});
