import assert from "node:assert/strict";
import test from "node:test";
import * as connectorDomain from "../src/domain/dataCenterConnectors.js";

const {
  CONNECTOR_STATUS_PRIORITY,
  DATA_CONNECTOR_DEFINITIONS,
  INTERNAL_VAULT_TYPES,
  connectorDefinition,
  normalizeConnectorInstance,
  splitConnectorPayload
} = connectorDomain;

test("catalog defines eight connectors and merges Qianchuan into Ocean Engine", () => {
  assert.deepEqual(DATA_CONNECTOR_DEFINITIONS.map(item => item.id), [
    "douyin-ecommerce",
    "oceanengine",
    "kuaishou",
    "taobao",
    "pinduoduo",
    "xiaohongshu",
    "jd-jingmai",
    "kuaimai-erp"
  ]);
  assert.ok(connectorDefinition("oceanengine").accountTypes.includes("qianchuan"));
  assert.equal(DATA_CONNECTOR_DEFINITIONS.filter(item => /千川/.test(item.name)).length, 0);
});

test("catalog covers internal vault types and the full status priority", () => {
  assert.deepEqual(INTERNAL_VAULT_TYPES.map(item => item.id), ["nas", "email", "finance", "government-saas", "custom"]);
  assert.deepEqual(CONNECTOR_STATUS_PRIORITY, [
    "waiting_verification",
    "schema_changed",
    "failed",
    "login_required",
    "stale",
    "running",
    "pending_validation",
    "healthy",
    "unconfigured",
    "disabled"
  ]);
});

test("configuration splits advertising metadata from allowed encrypted secrets", () => {
  const definition = connectorDefinition("oceanengine");
  const split = splitConnectorPayload(definition, {
    name: "千川官旗",
    companySubject: "测试公司",
    consoleUrl: "https://example.com/console",
    captureMethod: "browser",
    loginAccount: "ops@example.com",
    password: "secret"
  });
  assert.deepEqual(split.secretPayload, { loginAccount: "ops@example.com", password: "secret" });
  assert.equal(split.metadata.name, "千川官旗");
  assert.equal(split.metadata.consoleUrl, "https://example.com/console");
  assert.equal(split.metadata.loginAccount, undefined);
  assert.equal(split.metadata.password, undefined);
});

test("configuration rejects OTP fields unknown fields and credential URLs", () => {
  const definition = connectorDefinition("douyin-ecommerce");
  assert.throws(() => splitConnectorPayload(definition, { smsCode: "123456" }), /验证码/);
  assert.throws(() => splitConnectorPayload(definition, { unexpected: "value" }), /不支持的字段/);
  assert.throws(() => splitConnectorPayload(definition, { consoleUrl: "https://user:pass@example.com/" }), /不能包含账号或密码/);
});

test("new connector instances cannot forge a healthy connection", () => {
  const normalized = normalizeConnectorInstance({
    connectorId: "kuaimai-erp",
    name: "快麦 ERP",
    status: "healthy",
    timezone: "UTC",
    timeBasis: "pay_time",
    schedule: "23:00"
  });
  assert.equal(normalized.status, "pending_validation");
  assert.equal(normalized.timezone, "Asia/Shanghai");
  assert.equal(normalized.timeBasis, "create_time");
  assert.equal(normalized.schedule, "07:30");
});

test("connector definitions expose only supported platform-specific methods", () => {
  assert.deepEqual(connectorDefinition("kuaimai-erp").methods, ["browser", "export"]);
  assert.equal(connectorDefinition("kuaimai-erp").fields.some(field => field.methods?.includes("api")), false);
  assert.deepEqual(connectorDefinition("douyin-ecommerce").methods, ["export"]);
  assert.throws(() => connectorDefinition("unknown-platform"), /未知连接器/);
});

test("connector definitions use platform shop or account names", () => {
  assert.equal(connectorDefinition("douyin-ecommerce").identityLabel, "店铺名称");
  assert.equal(connectorDefinition("oceanengine").identityLabel, "广告账户名称");
  assert.equal(connectorDefinition("kuaimai-erp").identityLabel, "ERP 账号名称");
  assert.throws(() => normalizeConnectorInstance({ connectorId: "douyin-ecommerce", name: "" }), /店铺名称不能为空/);
});

test("capture method is inferred from configured credentials", () => {
  assert.equal(typeof connectorDomain.inferConnectorCaptureMethod, "function");
  const { inferConnectorCaptureMethod } = connectorDomain;
  assert.equal(inferConnectorCaptureMethod("oceanengine", { secretPayload: { appSecret: "secret" } }), "api");
  assert.equal(inferConnectorCaptureMethod("oceanengine", { secretPayload: { password: "secret" } }), "browser");
  assert.equal(inferConnectorCaptureMethod("oceanengine", { secretPayload: { appSecret: "api", password: "web" } }), "api");
  assert.equal(inferConnectorCaptureMethod("douyin-ecommerce", { secretPayload: {} }), "export");
  assert.equal(inferConnectorCaptureMethod("douyin-ecommerce", { secretPayload: {}, existingMethod: "browser" }), "export");
});
