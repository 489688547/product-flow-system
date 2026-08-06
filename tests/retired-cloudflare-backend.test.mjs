import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = resolve(import.meta.dirname, "..");
const read = path => readFileSync(resolve(root, path), "utf8");

test("Cloudflare backend, D1 and production rollback paths are retired", () => {
  for (const path of [
    "CLOUDFLARE_PAGES.md",
    "cloudflare-entry.html",
    "scripts/aliyun/export-cloudflare-d1.mjs",
    "scripts/check-pages-environment-parity.mjs",
    "scripts/configure-pages-environment-parity.mjs"
  ]) assert.equal(existsSync(resolve(root, path)), false, `${path} must be retired`);

  const active = [
    "AGENTS.md",
    ".env.example",
    "DINGTALK_SETUP.md",
    "package.json",
    "docs/platform/architecture.md",
    "docs/platform/environment-readiness.md",
    "docs/platform/integrations.md",
    ".agents/skills/environment-parity/SKILL.md",
    ".agents/skills/verification/SKILL.md",
    "scripts/start-local-sandbox.mjs",
    "scripts/seed-local-sandbox.mjs",
    "wrangler.toml"
  ].map(path => [path, read(path)]);
  for (const [path, source] of active) {
    assert.doesNotMatch(source, /deshan-tiyes-system[.]pages[.]dev/, path);
    assert.doesNotMatch(source, /cloudflare-entry/i, path);
    assert.doesNotMatch(source, /wrangler\s+dev\s+--remote|["']--remote["']/, path);
    assert.doesNotMatch(source, /恢复 Cloudflare|Cloudflare.*生产.*回滚/i, path);
  }

  const wrangler = read("wrangler.toml");
  assert.doesNotMatch(wrangler, /remote\s*=\s*true/);
  assert.doesNotMatch(wrangler, /database_id\s*=\s*"[0-9a-f]{8}-[0-9a-f-]{27,}"/i);
  assert.match(wrangler, /remote\s*=\s*false/);
});

test("Cloudflare remains registered only as the static test frontend", () => {
  const environment = JSON.parse(read("docs/platform/environment-capabilities.json"));
  const cloudflareCapabilities = environment.capabilities.filter(capability =>
    capability.platforms.some(platform => platform.startsWith("cloudflare"))
  );
  assert.deepEqual(cloudflareCapabilities.map(item => item.id), ["cloudflare-pages-static-test"]);
  assert.deepEqual(cloudflareCapabilities[0].bindings, []);
  assert.deepEqual(cloudflareCapabilities[0].tables, []);

  const registry = JSON.parse(read("docs/platform/integration-registry.json"));
  const pages = registry.platforms.find(platform => platform.id === "cloudflare-pages");
  const d1 = registry.platforms.find(platform => platform.id === "cloudflare-d1");
  assert.deepEqual(pages.capabilities, ["测试静态前端"]);
  assert.deepEqual(pages.apiRoutes, []);
  assert.deepEqual(pages.envVars, []);
  assert.equal(d1.status, "retired");
  assert.deepEqual(d1.codePaths, []);
});

test("local execution is sandbox-only and shared acceptance uses fixed URLs", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.start, "node scripts/start-local-sandbox.mjs");
  assert.equal(pkg.scripts["start:sandbox"], "node scripts/start-local-sandbox.mjs");
  assert.equal(existsSync(resolve(root, "scripts/start-local-online.mjs")), false);
  assert.equal(existsSync(resolve(root, "wrangler.local.toml")), false);
  assert.match(read("AGENTS.md"), /https:\/\/test\.deshan-tiyes\.cn/);
  assert.match(read("AGENTS.md"), /https:\/\/deshan-tiyes\.cn/);
});
