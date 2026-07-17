import assert from "node:assert/strict";
import test from "node:test";
import { onRequest } from "../functions/api/platform/v1/integrations.js";

function createD1Mock() {
  const profiles = new Map();
  const auditRows = [];
  return {
    profiles,
    auditRows,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (/insert into integration_private_profiles/i.test(sql)) {
            const [platformId, payload, updatedAt, updatedBy] = statement.values;
            profiles.set(platformId, { platform_id: platformId, payload, updated_at: updatedAt, updated_by: updatedBy });
          } else if (/insert into integration_profile_audit/i.test(sql)) {
            const [platformId, action, changedFields, updatedAt, updatedBy] = statement.values;
            auditRows.push({ platform_id: platformId, action, changed_fields: changedFields, updated_at: updatedAt, updated_by: updatedBy });
          }
          return { success: true };
        },
        async all() {
          if (/from integration_private_profiles/i.test(sql)) return { results: [...profiles.values()] };
          return { results: [] };
        },
        async first() {
          if (/from integration_private_profiles/i.test(sql)) return profiles.get(statement.values[0]) || null;
          return null;
        }
      };
      return statement;
    }
  };
}

const employee = { name: "产品同事", role: "product", department: "产品部" };
const admin = { name: "平台管理员", role: "executive", department: "总经办" };

function request(method = "GET", body) {
  return new Request("https://flow.example.com/api/platform/v1/integrations", {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
}

test("integration profiles API defensively requires a session", async () => {
  const response = await onRequest({ request: request(), env: { PRODUCT_FLOW_DB: createD1Mock() }, data: {} });
  assert.equal(response.status, 401);
  const payload = await response.json();
  assert.equal(payload.error.code, "AUTH_SESSION_REQUIRED");
  assert.ok(payload.error.requestId);
});

test("integration profiles API requires D1 but allows every employee to read", async () => {
  const missing = await onRequest({ request: request(), env: {}, data: { session: employee } });
  assert.equal(missing.status, 501);
  const missingPayload = await missing.json();
  assert.match(missingPayload.message, /PRODUCT_FLOW_DB/);
  assert.equal(missingPayload.error.code, "INTEGRATION_STORAGE_UNAVAILABLE");

  const available = await onRequest({ request: request(), env: { PRODUCT_FLOW_DB: createD1Mock() }, data: { session: employee } });
  assert.equal(available.status, 200);
  assert.deepEqual((await available.json()).profiles, []);
});

test("integration profiles API rejects writes outside the platform admin scope", async () => {
  const response = await onRequest({
    request: request("PUT", { platformId: "dingtalk", owner: "产品部" }),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: employee }
  });
  assert.equal(response.status, 403);
  assert.equal((await response.json()).error.code, "PERMISSION_WRITE_DENIED");
});

test("platform admin can upsert a normalized profile and employees can read it", async () => {
  const db = createD1Mock();
  const profile = {
    platformId: "dingtalk",
    consoleUrl: "https://open-dev.dingtalk.com/",
    accountSubject: "公司主体",
    resourceNames: ["产品全周期应用", "产品全周期应用"],
    environments: [{ name: "生产", url: "https://product-flow-system.pages.dev/", notes: "钉钉工作台" }],
    owner: "平台管理员",
    permissionGuide: "总经办审批后由管理员配置",
    runbook: "钉钉知识库中的平台运行手册",
    verifiedAt: "2026-07-17"
  };

  const put = await onRequest({ request: request("PUT", profile), env: { PRODUCT_FLOW_DB: db }, data: { session: admin } });
  assert.equal(put.status, 200);
  const saved = await put.json();
  assert.deepEqual(saved.profile.resourceNames, ["产品全周期应用"]);

  const get = await onRequest({ request: request(), env: { PRODUCT_FLOW_DB: db }, data: { session: employee } });
  const payload = await get.json();
  assert.equal(payload.profiles[0].platformId, "dingtalk");
  assert.equal(payload.profiles[0].owner, "平台管理员");
  assert.equal(payload.profiles[0].updatedBy, "平台管理员");
});

test("API rejects unknown sensitive fields and invalid profile values", async () => {
  const db = createD1Mock();
  const sensitive = await onRequest({
    request: request("PUT", { platformId: "dingtalk", accessToken: "secret-value" }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: admin }
  });
  assert.equal(sensitive.status, 400);
  const sensitivePayload = await sensitive.json();
  assert.match(sensitivePayload.message, /accessToken/);
  assert.equal(sensitivePayload.error.code, "INTEGRATION_PROFILE_INVALID");

  const invalid = await onRequest({
    request: request("PUT", { platformId: "dingtalk", consoleUrl: "javascript:alert(1)", verifiedAt: "17/07/2026" }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: admin }
  });
  assert.equal(invalid.status, 400);
});

test("audit stores changed field names but never profile values", async () => {
  const db = createD1Mock();
  await onRequest({
    request: request("PUT", { platformId: "kuaimai", owner: "电商负责人", accountSubject: "公司主体" }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: admin }
  });

  assert.equal(db.auditRows.length, 1);
  assert.deepEqual(JSON.parse(db.auditRows[0].changed_fields), ["accountSubject", "owner"]);
  assert.doesNotMatch(JSON.stringify(db.auditRows[0]), /电商负责人|公司主体/);
});

test("OPTIONS advertises PUT for the profile API", async () => {
  const response = await onRequest({ request: request("OPTIONS"), env: {}, data: {} });
  assert.equal(response.status, 204);
  assert.match(response.headers.get("access-control-allow-methods"), /PUT/);
});
