import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path) {
  return readFileSync(resolve(path), "utf8");
}

test("the standard local launcher supervises Vite and Pages Functions behind one URL", () => {
  const packageJson = JSON.parse(source("package.json"));
  const launcher = source("scripts/start-local-online.mjs");
  const finderLauncher = source("启动服务.command");

  assert.equal(packageJson.scripts.start, "node scripts/start-local-online.mjs");
  assert.match(launcher, /spawn/);
  assert.match(launcher, /waitForPort/);
  assert.match(launcher, /8132/);
  assert.match(launcher, /pages[",\s]+"dev/);
  assert.match(launcher, /"--proxy", String\(VITE_PORT\)/);
  assert.match(launcher, /"--port", String\(APP_PORT\)/);
  assert.match(launcher, /resolve\(ROOT, "\.env"\)/);
  assert.match(launcher, /existsSync\(ENV_FILE\)/);
  assert.match(launcher, /SIGINT/);
  assert.match(launcher, /SIGTERM/);
  assert.match(launcher, /killChild/);
  assert.match(finderLauncher, /npm start/);
  assert.doesNotMatch(finderLauncher, /node server\.mjs/);
});

test("Wrangler explicitly enables the localhost-only online account mode", () => {
  const wrangler = source("wrangler.toml");
  const envExample = source(".env.example");

  assert.match(wrangler, /LOCAL_ONLINE_ACCOUNT_MODE\s*=\s*"1"/);
  assert.doesNotMatch(wrangler, /LOCAL_LIVE_D1_PREVIEW/);
  assert.match(envExample, /PRODUCTION_DATA_ACCESS_TOKEN=/);
  assert.match(envExample, /仅由本机 Pages Functions 读取/);
});
