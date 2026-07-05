import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("DingTalk login waits for JSAPI before auto login", () => {
  assert.match(html, /function waitForDingApi\(/);
  assert.match(html, /await waitForDingApi\(\)/);
});

test("environment check continues into login when DingTalk is ready", () => {
  assert.match(html, /checkDingTalkEnvironment\(\{ loginWhenReady: true \}\)/);
});

test("DingTalk login refreshes organization cache for people picking", () => {
  assert.match(html, /productFlowOrgCache/);
  assert.match(html, /function syncDingOrgCache\(/);
  assert.match(html, /\/api\/dingtalk\/org\/sync/);
  assert.match(html, /syncDingOrgCache\(\{ force: true \}\)/);
  assert.match(html, /currentUser\?\.source === "dingtalk"[\s\S]*?syncDingOrgCache\(\)/);
});

test("top bar shows the user's highest DingTalk department and title", () => {
  assert.match(html, /const departmentPriority = \[/);
  assert.match(html, /"总经办"[\s\S]*"产品部"[\s\S]*"运营部"[\s\S]*"品牌部"[\s\S]*"财务部"[\s\S]*"行政人事部"[\s\S]*"其他"/);
  assert.match(html, /const titlePriority = \[/);
  assert.match(html, /"总经理"[\s\S]*"副总经理"[\s\S]*"总经理助理"/);
  assert.match(html, /function currentUserDisplayName\(/);
  assert.match(html, /name\.textContent = currentUserDisplayName\(\);/);
});

test("organization cache refresh updates the current user identity display", () => {
  const syncDingOrgCache = html.match(/async function syncDingOrgCache[\s\S]*?function dingUserId/)[0];
  assert.match(syncDingOrgCache, /saveOrgCache\(payload\.org\);/);
  assert.match(syncDingOrgCache, /applyPermissions\(\);/);
});

test("local executive login is treated as general office for settings access", () => {
  assert.match(html, /dingUser: \{ name: "本地测试账号", title: "总经理", departmentNames: \["总经办"\] \}/);
  assert.match(html, /if \(parsed\.source === "local-dev" && parsed\.role === "executive"\) \{/);
  assert.match(html, /parsed\.dingUser\.departmentNames = parsed\.dingUser\.departmentNames\?\.length \? parsed\.dingUser\.departmentNames : \["总经办"\];/);
});
