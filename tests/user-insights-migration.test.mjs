import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("../migrations/0005_user_insights.sql", import.meta.url);
const environmentPath = new URL("../docs/platform/environment-capabilities.json", import.meta.url);

export const USER_INSIGHT_TABLES = [
  "user_insight_category_mappings",
  "user_insight_rules",
  "user_insight_snapshots",
  "user_insight_entities",
  "user_insight_competitors",
  "user_insight_sync_runs",
  "user_insight_runner_tokens",
  "user_insight_audit_logs",
  "user_insight_meta"
];

test("user insight tables stay aligned with the environment capability", () => {
  assert.equal(existsSync(migrationPath), true, "user insight migration must exist");
  const migration = readFileSync(migrationPath, "utf8");
  const environment = JSON.parse(readFileSync(environmentPath, "utf8"));
  const capability = environment.capabilities.find(item => item.id === "user-insights-browser-collection");
  assert.ok(capability, "user-insights-browser-collection capability must exist");
  assert.deepEqual(capability.tables, USER_INSIGHT_TABLES);
  assert.deepEqual(capability.platforms, ["cloudflare-pages", "cloudflare-d1"]);
  assert.deepEqual(capability.requiredIn, ["preview", "production"]);
  assert.equal(capability.level, "blocking");
  for (const table of USER_INSIGHT_TABLES) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/i);
  assert.doesNotMatch(migration, /cookie|password|raw_html/i);
});
