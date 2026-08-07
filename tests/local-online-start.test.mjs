import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path) {
  return readFileSync(resolve(path), "utf8");
}

test("the standard local launcher selects personal access or local SQLite sandbox", () => {
  const packageJson = JSON.parse(source("package.json"));
  const standardLauncher = source("scripts/start-local.mjs");
  const launcher = source("scripts/start-local-sandbox.mjs");
  const coreLauncher = source("scripts/start-core-developer.mjs");
  const coreProxy = source("scripts/core-developer-proxy.mjs");
  const sharedEnv = source("scripts/shared-local-env.mjs");
  const viteConfig = source("vite.config.js");
  const finderLauncher = source("启动服务.command");

  assert.equal(packageJson.scripts.start, "node scripts/start-local.mjs");
  assert.equal(packageJson.scripts["start:sandbox"], "node scripts/start-local-sandbox.mjs");
  assert.match(standardLauncher, /loadDeveloperAccess/);
  assert.match(standardLauncher, /start-core-developer\.mjs/);
  assert.match(standardLauncher, /start-local-sandbox\.mjs/);
  assert.match(launcher, /checkBranchBase/);
  assert.match(launcher, /refresh:\s*true/);
  assert.match(launcher, /loadSharedEnv/);
  assert.match(launcher, /"pages", "dev"/);
  assert.match(launcher, /"--persist-to"/);
  assert.match(launcher, /waitForSandboxApi/);
  assert.match(launcher, /https:\/\/test\.deshan-tiyes\.cn/);
  assert.doesNotMatch(launcher, /--remote|PRODUCTION_DATA_ACCESS_TOKEN:\s*sharedEnv/);
  assert.doesNotMatch(launcher, /LOCAL_ONLINE_REQUEST_SECRET|x-pfs-local-online-session/);
  assert.match(sharedEnv, /resolve\(root, "\.env"\)/);
  assert.match(viteConfig, /VITE_API_TARGET/);
  assert.doesNotMatch(viteConfig, /LOCAL_ONLINE_REQUEST_SECRET|x-pfs-local-online-session/);
  assert.match(coreLauncher, /loadDeveloperAccess/);
  assert.match(coreLauncher, /api\/auth\/session/);
  assert.match(coreLauncher, /PFS_CORE_DEVELOPER_TOKEN/);
  assert.match(coreProxy, /CORE_DEVELOPER_PROXY_ORIGIN_FORBIDDEN/);
  assert.match(viteConfig, /coreDeveloperProxy/);
  assert.doesNotMatch(viteConfig, /VITE_CORE_DEVELOPER_TOKEN/);
  assert.match(finderLauncher, /npm start/);
});

test("root Wrangler configuration is local-only", () => {
  const wrangler = source("wrangler.toml");
  assert.match(wrangler, /LOCAL_ONLINE_ACCOUNT_MODE\s*=\s*"0"/);
  assert.match(wrangler, /remote\s*=\s*false/g);
  assert.doesNotMatch(wrangler, /[0-9a-f]{8}-[0-9a-f-]{27,}/i);
});
