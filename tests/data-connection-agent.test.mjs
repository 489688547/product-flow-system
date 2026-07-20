import assert from "node:assert/strict";
import test from "node:test";
import { runDataConnectionTasks } from "../scripts/data-connection-agent/core.mjs";
import { providerForTask } from "../scripts/data-connection-agent/providers/index.mjs";
import {
  DOUYIN_LOGIN_URL,
  classifyDouyinLoginPage,
  normalizeDouyinShopCandidates
} from "../scripts/data-connection-agent/providers/douyin-ecommerce.mjs";

test("the shared agent routes registered provider task and resource contracts", () => {
  const adapter = providerForTask({
    platformId: "douyin-ecommerce",
    type: "douyin_login_verification",
    resourceType: "connection_identity"
  });
  assert.equal(adapter.id, "douyin-ecommerce");
  assert.throws(() => providerForTask({ platformId: "unknown-erp", type: "orders", resourceType: "orders" }), /未登记/);
});

test("douyin agent accepts only the fixed seller login URL", () => {
  assert.equal(DOUYIN_LOGIN_URL, "https://fxg.jinritemai.com/login/common?channel=zhaoshang");
  assert.equal(classifyDouyinLoginPage({ url: DOUYIN_LOGIN_URL, text: "邮箱登录" }).status, "login_form");
  assert.equal(classifyDouyinLoginPage({ url: "https://evil.example", text: "登录" }).status, "invalid_origin");
});

test("douyin page classification pauses for every human verification type", () => {
  for (const text of ["请输入验证码", "拖动滑块完成验证", "请扫码登录", "短信验证", "设备确认"]) {
    assert.equal(classifyDouyinLoginPage({ url: "https://fxg.jinritemai.com/home", text }).status, "waiting_human_verification");
  }
});

test("shop candidates require stable ids and deduplicate by id", () => {
  assert.deepEqual(normalizeDouyinShopCandidates([
    { shopId: "1", shopName: "旧名称", shopAvatarUrl: "https://img.example/old.png" },
    { shopId: "1", shopName: "新名称", shopAvatarUrl: "https://img.example/new.png" },
    { shopName: "没有 ID" }
  ]), [{ shopId: "1", shopName: "新名称", shopAvatarUrl: "https://img.example/new.png" }]);
});

test("agent opens Chrome, waits for human verification and reports only safe shop data", async () => {
  const calls = [];
  const api = {
    async credential() {
      return {
        platformId: "douyin-ecommerce",
        accountLabel: "operator@example.com",
        credentialSchemaId: "email-password-v1",
        credentials: { password: "plain-secret" },
        loginUrl: DOUYIN_LOGIN_URL
      };
    },
    async result(taskId, payload) { calls.push({ taskId, payload }); }
  };
  const pages = [
    { url: "https://fxg.jinritemai.com/login", text: "请输入验证码", shops: [] },
    { url: "https://fxg.jinritemai.com/home", text: "店铺管理", shops: [{ shopId: "shop-1", shopName: "品牌旗舰店", shopAvatarUrl: "https://img.example/shop.png" }] }
  ];
  const browser = {
    opened: [],
    async openAndFill(url, credentials) { this.opened.push({ url, credentials }); return pages.shift(); },
    async inspect() { return pages.shift(); }
  };
  const summary = await runDataConnectionTasks([{
    id: "task-1", platformId: "douyin-ecommerce", type: "douyin_login_verification", resourceType: "connection_identity", loginUrl: DOUYIN_LOGIN_URL, grant: "bat_once"
  }], { api, browser, wait: async () => {} });

  assert.deepEqual(summary, { completed: 1, failed: 0, waitingHuman: 1 });
  assert.equal(browser.opened[0].url, DOUYIN_LOGIN_URL);
  assert.equal(browser.opened[0].credentials.password, "plain-secret");
  assert.equal(calls[0].payload.status, "waiting_human_verification");
  assert.equal(calls.at(-1).payload.status, "succeeded");
  assert.equal(calls.at(-1).payload.shops[0].shopName, "品牌旗舰店");
  assert.doesNotMatch(JSON.stringify(calls), /plain-secret|operator@example|bat_once/);
});

test("agent refuses task URL overrides without opening Chrome", async () => {
  let opened = false;
  const summary = await runDataConnectionTasks([{
    id: "task-evil", platformId: "douyin-ecommerce", type: "douyin_login_verification", resourceType: "connection_identity", loginUrl: "https://evil.example", grant: "bat_once"
  }], {
    api: { async credential() { throw new Error("should not load credentials"); }, async result() {} },
    browser: { async openAndFill() { opened = true; } },
    wait: async () => {}
  });
  assert.equal(opened, false);
  assert.deepEqual(summary, { completed: 0, failed: 1, waitingHuman: 0 });
});
