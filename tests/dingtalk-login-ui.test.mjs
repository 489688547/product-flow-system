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
