import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(new URL("..", import.meta.url).pathname);
const runtimePath = resolve(root, "src/state/runtimeApiOrigin.js");

test("runtime API resolver rewrites only same-page API requests", async () => {
  const { resolveRuntimeApiUrl } = await import(runtimePath);
  const options = {
    apiOrigin: "https://api-test.deshan-tiyes.cn/",
    pageOrigin: "https://test.deshan-tiyes.cn"
  };

  assert.equal(
    resolveRuntimeApiUrl("/api/auth/session", options),
    "https://api-test.deshan-tiyes.cn/api/auth/session"
  );
  assert.equal(resolveRuntimeApiUrl("/assets/app.js", options), "/assets/app.js");
  assert.equal(
    resolveRuntimeApiUrl("https://example.com/api/x", options),
    "https://example.com/api/x"
  );
  assert.equal(
    resolveRuntimeApiUrl("https://test.deshan-tiyes.cn/api/state?x=1", options),
    "https://api-test.deshan-tiyes.cn/api/state?x=1"
  );
});

test("runtime API resolver fails closed for an insecure remote API origin", async () => {
  const { resolveRuntimeApiUrl } = await import(runtimePath);
  assert.throws(() => resolveRuntimeApiUrl("/api/state", {
    apiOrigin: "http://api-test.deshan-tiyes.cn",
    pageOrigin: "https://test.deshan-tiyes.cn"
  }), /HTTPS/);
});

test("DingTalk login and group authorization use the runtime API origin", () => {
  const loginPage = readFileSync(resolve(root, "src/features/auth/LoginPage.jsx"), "utf8");
  const groups = readFileSync(resolve(root, "src/domain/dingTalkGroups.js"), "utf8");
  assert.match(loginPage, /runtimeApiUrl\("\/api\/auth\/dingtalk\/start"\)/);
  assert.match(groups, /runtimeApiUrl\(`\/api\/auth\/dingtalk\/start\?returnTo=/);
});
