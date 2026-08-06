import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");

test("DingTalk OAuth is served by ECS API routes without Pages static shims", () => {
  assert.equal(existsSync(resolve(root, "functions/api/auth/dingtalk/start.js")), true);
  assert.equal(existsSync(resolve(root, "functions/api/auth/dingtalk/callback.js")), true);
  assert.equal(existsSync(resolve(root, "public/_routes.json")), false);
  assert.equal(existsSync(resolve(root, "public/auth/dingtalk-start.html")), false);
  assert.equal(existsSync(resolve(root, "public/auth/dingtalk-callback.html")), false);
  assert.equal(existsSync(resolve(root, "public/auth/dingtalk-oauth.js")), false);

  const redirects = readFileSync(resolve(root, "_redirects"), "utf8").trim();
  assert.equal(redirects, "/* /index.html 200");
  assert.doesNotMatch(redirects, /\/api\//);
});

test("runtime build preparation never creates Pages function routing artifacts", () => {
  const source = readFileSync(resolve(root, "scripts/prepare-runtime-build.mjs"), "utf8");
  assert.doesNotMatch(source, /cloudflare-entry\.html/);
  assert.doesNotMatch(source, /_routes\.json/);
  assert.match(source, /dist.*index\.html/s);
});
