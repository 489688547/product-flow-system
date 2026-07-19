import assert from "node:assert/strict";
import test from "node:test";
import {
  CONNECTOR_STATUS_PRIORITY,
  DATA_CONNECTOR_DEFINITIONS,
  INTERNAL_VAULT_TYPES,
  connectorDefinition,
  normalizeConnectorInstance,
  splitConnectorPayload
} from "../src/domain/dataCenterConnectors.js";

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

test("configuration splits metadata from allowed encrypted secrets", () => {
  const definition = connectorDefinition("douyin-ecommerce");
  const split = splitConnectorPayload(definition, {
    name: "抖音官旗",
    companySubject: "测试公司",
    consoleUrl: "https://example.com/console",
    captureMethod: "browser",
    loginEmail: "ops@example.com",
    password: "secret"
  });
  assert.deepEqual(split.secretPayload, { loginEmail: "ops@example.com", password: "secret" });
  assert.equal(split.metadata.name, "抖音官旗");
  assert.equal(split.metadata.consoleUrl, "https://example.com/console");
  assert.equal(split.metadata.loginEmail, undefined);
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
  assert.deepEqual(connectorDefinition("kuaimai-erp").methods, ["api", "browser", "export"]);
  assert.deepEqual(connectorDefinition("douyin-ecommerce").methods, ["browser", "export"]);
  assert.throws(() => connectorDefinition("unknown-platform"), /未知连接器/);
});
