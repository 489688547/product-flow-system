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
