import assert from "node:assert/strict";
import test from "node:test";
import {
  DOUYIN_ECOMMERCE,
  connectionDisplayState,
  normalizeLoginEmail,
  normalizeRecognizedShops
} from "../src/domain/dataConnections.js";
import { dataAcquisitionContract, registeredDataAcquisitionProviders } from "../src/domain/dataAcquisition.js";

test("shared acquisition registry validates provider task and resource contracts", () => {
  const contract = dataAcquisitionContract("douyin-ecommerce", "douyin_login_verification", "connection_identity");
  assert.equal(contract.loginUrl, "https://fxg.jinritemai.com/login/common?channel=zhaoshang");
  assert.equal(contract.credentialSchema.id, "email-password-v1");
  assert.equal(contract.credentialSchema.accountField, "loginEmail");
  assert.deepEqual(contract.credentialSchema.secretFields, ["password"]);
  assert.deepEqual(registeredDataAcquisitionProviders().map(item => item.id), ["douyin-ecommerce"]);
  assert.throws(() => dataAcquisitionContract("unknown-erp", "orders", "orders"), /provider 未登记/);
  assert.throws(() => dataAcquisitionContract("douyin-ecommerce", "orders", "orders"), /任务类型未登记/);
});

test("douyin ecommerce uses one server-owned login URL", () => {
  assert.equal(DOUYIN_ECOMMERCE.id, "douyin-ecommerce");
  assert.equal(DOUYIN_ECOMMERCE.loginUrl, "https://fxg.jinritemai.com/login/common?channel=zhaoshang");
  assert.deepEqual(DOUYIN_ECOMMERCE.editableFields, ["loginEmail", "password"]);
  assert.equal(DOUYIN_ECOMMERCE.loginUrlFrom({ loginUrl: "https://evil.example" }), DOUYIN_ECOMMERCE.loginUrl);
});

test("login email is normalized but stays visible account metadata", () => {
  assert.equal(normalizeLoginEmail("  Operator@Example.COM "), "operator@example.com");
  assert.throws(() => normalizeLoginEmail("not-an-email"), /邮箱/);
});

test("recognized shops deduplicate by platform shop id instead of name", () => {
  assert.deepEqual(normalizeRecognizedShops([
    { shopId: "100", shopName: "同名店", shopAvatarUrl: "https://img.example/old.png" },
    { shopId: "200", shopName: "同名店", shopAvatarUrl: "https://img.example/second.png" },
    { shopId: "100", shopName: "新名称", shopAvatarUrl: "https://img.example/new.png" }
  ]), [
    { shopId: "100", shopName: "新名称", shopAvatarUrl: "https://img.example/new.png" },
    { shopId: "200", shopName: "同名店", shopAvatarUrl: "https://img.example/second.png" }
  ]);
});

test("connection display state uses business language", () => {
  assert.equal(connectionDisplayState({ status: "queued" }).label, "正在等待公司 Mac");
  assert.equal(connectionDisplayState({ status: "waiting_human_verification" }).label, "请在抖音页面完成人工验证");
  assert.equal(connectionDisplayState({ status: "recognizing" }).label, "正在识别店铺");
  assert.equal(connectionDisplayState({ status: "connected" }).label, "已连接");
});
