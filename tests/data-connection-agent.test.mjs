import assert from "node:assert/strict";
import test from "node:test";
import { runDataConnectionTasks } from "../scripts/data-connection-agent/core.mjs";
import { providerForTask } from "../scripts/data-connection-agent/providers/index.mjs";
import {
  DOUYIN_LOGIN_URL,
  classifyDouyinLoginPage,
  douyinEcommerceProvider,
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

test("douyin mobile login form is not mistaken for a human verification challenge", () => {
  const page = {
    url: DOUYIN_LOGIN_URL,
    readyState: "complete",
    text: "手机登录 邮箱登录 发送验证码 登录",
    inputs: [{ type: "number", name: "mobile" }, { type: "number", name: "mobilecaptcha" }]
  };
  assert.equal(classifyDouyinLoginPage(page).status, "login_form");
});

test("douyin adapter waits for page readiness, switches to email login and submits", async () => {
  const evaluations = [];
  const snapshots = [
    { id: "page-1", url: DOUYIN_LOGIN_URL, readyState: "loading", text: "", inputs: [], shops: [] },
    { id: "page-1", url: DOUYIN_LOGIN_URL, readyState: "complete", text: "手机登录 邮箱登录 发送验证码 登录", inputs: [{ type: "number", name: "mobile" }], shops: [] },
    { id: "page-1", switched: true },
    { id: "page-1", url: DOUYIN_LOGIN_URL, readyState: "complete", text: "手机登录 邮箱登录 登录", inputs: [{ type: "text", name: "email" }, { type: "password", name: "password" }], shops: [] },
    { id: "page-1", filled: true, submitted: true },
    { id: "page-1", url: "https://fxg.jinritemai.com/home", readyState: "complete", text: "店铺管理", shops: [{ shopId: "shop-1", shopName: "品牌旗舰店" }] }
  ];
  const browser = {
    async open(url) {
      assert.equal(url, DOUYIN_LOGIN_URL);
      return { id: "page-1" };
    },
    async evaluate(pageId, expression) {
      assert.equal(pageId, "page-1");
      evaluations.push(expression);
      return snapshots.shift();
    }
  };

  const page = await douyinEcommerceProvider.openAndFill(browser, {
    platformId: "douyin-ecommerce",
    accountLabel: "operator@example.com",
    credentialSchemaId: "email-password-v1",
    credentials: { password: "plain-secret" },
    loginUrl: DOUYIN_LOGIN_URL
  }, { wait: async () => {}, maxLoadPolls: 4, maxTransitionPolls: 4 });

  assert.equal(classifyDouyinLoginPage(page).status, "authenticated");
  assert.equal(snapshots.length, 0);
  assert.ok(evaluations.some(expression => expression.includes("邮箱登录")));
  assert.ok(evaluations.some(expression => expression.includes("submitted: Boolean(email && secret && submit && !submit.disabled)")));
  assert.doesNotMatch(evaluations.join("\n"), /agreement\.click\(\)/);
});

test("douyin adapter leaves login agreement confirmation to the human", async () => {
  const snapshots = [
    { id: "page-2", url: DOUYIN_LOGIN_URL, readyState: "complete", text: "邮箱登录 登录即代表同意用户协议和隐私条款", inputs: [{ type: "text", name: "email" }, { type: "password", name: "password" }], shops: [] },
    { id: "page-2", filled: true, submitted: false, agreementRequired: true }
  ];
  const browser = {
    async open() { return { id: "page-2" }; },
    async evaluate() { return snapshots.shift(); }
  };

  const page = await douyinEcommerceProvider.openAndFill(browser, {
    accountLabel: "operator@example.com",
    credentials: { password: "plain-secret" },
    loginUrl: DOUYIN_LOGIN_URL
  }, { wait: async () => {}, maxLoadPolls: 2, maxTransitionPolls: 2 });

  assert.equal(classifyDouyinLoginPage(page).status, "waiting_human_verification");
  assert.equal(page.requiresAgreement, true);
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
