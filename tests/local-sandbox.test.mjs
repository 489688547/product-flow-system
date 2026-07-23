import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
const seedSource = readFileSync(new URL("../scripts/seed-local-sandbox.mjs", import.meta.url), "utf8");
const startSource = readFileSync(new URL("../scripts/start-local-online.mjs", import.meta.url), "utf8");

test("sandbox entry points exist in package.json scripts", () => {
  assert.equal(pkg.scripts["start:sandbox"], "node scripts/start-local-online.mjs --local-d1");
  assert.equal(pkg.scripts["seed:sandbox"], "node scripts/seed-local-sandbox.mjs");
});

test("sandbox start uses the local D1 flag and restores the online config", () => {
  assert.match(startSource, /--local-d1/);
  assert.match(startSource, /LOCAL_D1_SANDBOX/);
  assert.match(startSource, /wrangler\.local\.toml/);
  assert.match(startSource, /restoreConfigIfSwapped/);
});

test("seed script never reads plaintext tokens or .env files", () => {
  const codeOnly = seedSource.split("\n").filter(line => !line.trimStart().startsWith("//")).join("\n");
  assert.doesNotMatch(codeOnly, /PRODUCTION_DATA_ACCESS_TOKEN/);
  assert.doesNotMatch(codeOnly, /\.env/);
  assert.match(seedSource, /token_hash/);
});

test("seed script remote reads stay on the documented whitelist", () => {
  const allowedTables = new Set([
    "production_data_access_tokens",
    "product_flow_org_members",
    "product_flow_state",
    "product_flow_state_parts"
  ]);
  const forbiddenTables = [
    "platform_credentials",
    "platform_credential_audit",
    "credential_vault_entries",
    "internal_vault_items",
    "data_connector_instances"
  ];
  const remoteReads = [...seedSource.matchAll(/d1RemoteJson\(\s*["`]?\s*SELECT[\s\S]*?FROM\s+(\w+)/g)].map(match => match[1]);
  assert.ok(remoteReads.length >= 2, "expected identity/state remote reads in the seed script");
  for (const table of remoteReads) {
    assert.ok(allowedTables.has(table), `remote read touches non-whitelisted table: ${table}`);
  }
  for (const table of forbiddenTables) {
    assert.ok(!remoteReads.includes(table), `seed script must never copy ${table}`);
  }
});

test("with-state copy is opt-in and only touches shared state tables", () => {
  assert.match(seedSource, /--with-state/);
  const withStateIndex = seedSource.indexOf('--with-state")');
  assert.ok(withStateIndex > 0);
  const withStateBlock = seedSource.slice(withStateIndex);
  assert.match(withStateBlock, /FROM product_flow_state\b/);
  assert.match(withStateBlock, /FROM product_flow_state_parts/);
  assert.match(withStateBlock, /--file/, "large state payloads must be written via a temp SQL file, not inline --command");
  assert.match(withStateBlock, /shardPayload/, "oversized payloads must be sharded across part_index rows, matching deserializeStateParts");
  assert.match(withStateBlock, /DELETE FROM product_flow_state_parts/, "re-seeding must clear stale shard rows before insert");
  assert.doesNotMatch(withStateBlock, /platform_credentials|credential_vault/);
});

test("seed script is re-runnable and skips migrations on an already migrated database", () => {
  assert.match(seedSource, /sqlite_master/);
  assert.match(seedSource, /alreadyMigrated/);
  assert.match(seedSource, /新增迁移时需先清空 \.wrangler\/state/);
});
