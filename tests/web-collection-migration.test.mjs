import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("../migrations/0009_web_collection.sql", import.meta.url), "utf8");
const douyinMigrationUrl = new URL("../migrations/0013_douyin_commerce_facts.sql", import.meta.url);
const douyinMigration = existsSync(douyinMigrationUrl) ? readFileSync(douyinMigrationUrl, "utf8") : "";
const environment = JSON.parse(readFileSync(new URL("../docs/platform/environment-capabilities.json", import.meta.url), "utf8"));

const TABLES = [
  "web_collection_runners",
  "web_collection_jobs",
  "web_collection_runs",
  "web_collection_cursors",
  "web_collection_notifications"
];

test("web collection migration creates governed generic control-plane tables", () => {
  for (const table of TABLES) assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  assert.match(migration, /idempotency_key TEXT NOT NULL UNIQUE/i);
  assert.match(migration, /UNIQUE\s*\(provider_id, resource_type\)/i);
  assert.match(migration, /dedupe_key TEXT NOT NULL UNIQUE/i);
  assert.match(migration, /lease_expires_at TEXT/i);
  assert.match(migration, /FOREIGN KEY\s*\(job_id\)\s*REFERENCES web_collection_jobs\(id\)/i);
  assert.doesNotMatch(migration, /password|cookie|access_token|refresh_token|verification_code|raw_html|absolute_path/i);
});
test("web collection environment capability names the exact D1 boundary", () => {
  const capability = environment.capabilities.find(item => item.id === "company-web-data-collection");
  assert.ok(capability);
  assert.deepEqual(capability.tables, TABLES);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.envVars, []);
  assert.deepEqual(capability.platforms, [
    "cloudflare-pages",
    "cloudflare-d1",
    "kuaimai",
    "douyin-ecommerce",
    "erp-file-import"
  ]);
  assert.equal(capability.level, "blocking");
});

test("Douyin migration scopes jobs and cursors by store and creates typed commerce fact tables", () => {
  assert.notEqual(douyinMigration, "", "Douyin commerce migration must exist");
  assert.match(douyinMigration, /ALTER TABLE web_collection_jobs\s+ADD COLUMN store_id TEXT NOT NULL DEFAULT ''/i);
  assert.match(douyinMigration, /UNIQUE\s*\(provider_id,\s*store_id,\s*resource_type\)/i);
  for (const table of [
    "commerce_fact_batches",
    "commerce_store_daily_facts",
    "commerce_product_daily_facts",
    "commerce_live_daily_facts",
    "commerce_video_daily_facts"
  ]) {
    assert.match(douyinMigration, new RegExp(`CREATE TABLE ${table}\\b`, "i"));
  }
  assert.doesNotMatch(douyinMigration, /password|cookie|access_token|refresh_token|verification_code|raw_html|absolute_path/i);
});
