import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("../migrations/0006_data_connections.sql", import.meta.url);
const environmentPath = new URL("../docs/platform/environment-capabilities.json", import.meta.url);

export const DATA_CONNECTION_TABLES = [
  "data_connections",
  "data_connection_shops",
  "browser_agent_tasks",
  "browser_agent_task_grants",
  "data_connection_audit"
];

test("data connection tables stay aligned with the environment capability", () => {
  assert.equal(existsSync(migrationPath), true, "data connection migration must exist");
  const migration = readFileSync(migrationPath, "utf8");
  const environment = JSON.parse(readFileSync(environmentPath, "utf8"));
  const capability = environment.capabilities.find(item => item.id === "browser-data-acquisition");
  assert.ok(capability, "browser-data-acquisition capability must exist");
  assert.deepEqual(capability.tables, DATA_CONNECTION_TABLES);
  assert.deepEqual(capability.envVars, ["PLATFORM_CREDENTIAL_MASTER_KEY"]);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.platforms, ["douyin-ecommerce", "cloudflare-pages", "cloudflare-d1"]);
  for (const table of DATA_CONNECTION_TABLES) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(migration, /UNIQUE\s*\(platform_id, shop_id\)/i);
  assert.match(migration, /grant_hash TEXT NOT NULL UNIQUE/i);
  assert.match(migration, /resource_type TEXT NOT NULL/i);
  assert.match(migration, /schema_version TEXT NOT NULL/i);
  assert.match(migration, /cursor TEXT/i);
  assert.match(migration, /account_label TEXT NOT NULL/i);
  assert.match(migration, /credential_schema_id TEXT NOT NULL/i);
  assert.match(migration, /credential_entry_id TEXT NOT NULL/i);
  const connectionTable = migration.match(/CREATE TABLE IF NOT EXISTS data_connections \([\s\S]*?\n\);/i)?.[0] || "";
  assert.doesNotMatch(connectionTable, /ciphertext|\biv\b|algorithm|key_version/i);
  assert.doesNotMatch(migration, /login_email/i);
  assert.doesNotMatch(migration, /cookie|verification_code|sms_code|raw_html/i);
});
