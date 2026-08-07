import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const seedSource = readFileSync(new URL("../scripts/seed-local-sandbox.mjs", import.meta.url), "utf8");
const startSource = readFileSync(new URL("../scripts/start-local-sandbox.mjs", import.meta.url), "utf8");

test("sandbox entry points use the same local-only launcher", () => {
  assert.equal(pkg.scripts.start, "node scripts/start-local.mjs");
  assert.equal(pkg.scripts["start:sandbox"], "node scripts/start-local-sandbox.mjs");
  assert.equal(pkg.scripts["seed:sandbox"], "node scripts/seed-local-sandbox.mjs");
});

test("sandbox runtime is isolated and strips production credentials", () => {
  assert.match(startSource, /mkdtempSync/);
  assert.match(startSource, /symlinkSync\([^)]*"functions"/);
  assert.match(startSource, /symlinkSync\([^)]*"dist"/);
  assert.match(startSource, /"--persist-to"/);
  assert.match(startSource, /PRODUCTION_DATA_ACCESS_TOKEN/);
  assert.match(startSource, /CLOUDFLARE_API_TOKEN/);
  assert.match(startSource, /LOCAL_ONLINE_ACCOUNT_MODE", "0"/);
  assert.doesNotMatch(startSource, /--remote|authorizeProductionToken/);
});

test("seed script applies migrations locally and refuses production state copy", () => {
  assert.match(seedSource, /--with-state/);
  assert.match(seedSource, /已取消从生产库复制状态/);
  assert.match(seedSource, /"--local"/);
  assert.match(seedSource, /sqlite_master/);
  assert.doesNotMatch(seedSource, /--remote|PRODUCTION_DATA_ACCESS_TOKEN|platform_credentials/);
});
