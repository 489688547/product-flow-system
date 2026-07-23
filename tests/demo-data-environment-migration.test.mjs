import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const migrationPath = resolve("migrations/0011_demo_data_environment.sql");

test("demo data environment migration creates the governed control plane", () => {
  const sql = readFileSync(migrationPath, "utf8");

  for (const table of [
    "data_environment_grants",
    "demo_data_environment_state",
    "demo_data_refresh_jobs",
    "data_environment_audit",
    "platform_records",
    "brand_content_state",
    "product_sales_daily",
    "product_sales_meta",
    "supply_chain_records"
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }

  assert.match(sql, /token_hash TEXT NOT NULL UNIQUE/);
  assert.match(sql, /CHECK\s*\(environment_id IN \('production', 'display'\)\)/);
  assert.match(sql, /CHECK\s*\(status IN \('empty', 'ready', 'refreshing', 'failed'\)\)/);
  assert.doesNotMatch(sql, /\btoken_plaintext\b|\bsecret_value\b/i);
});

test("demo migration records asynchronous acquisition targets and AI environment separately", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /ALTER TABLE web_collection_jobs\s+ADD COLUMN target_environment TEXT NOT NULL DEFAULT 'production'/s);
  assert.match(sql, /ALTER TABLE web_collection_jobs\s+ADD COLUMN target_environment_version INTEGER NOT NULL DEFAULT 1/s);
  assert.match(sql, /ALTER TABLE erp_collection_batches\s+ADD COLUMN target_environment TEXT NOT NULL DEFAULT 'production'/s);
  assert.match(sql, /ALTER TABLE erp_collection_batches\s+ADD COLUMN target_environment_version INTEGER NOT NULL DEFAULT 1/s);
  assert.match(sql, /ALTER TABLE ai_usage_audit\s+ADD COLUMN data_environment TEXT NOT NULL DEFAULT 'production'/s);
  assert.match(sql, /ALTER TABLE ai_skill_audit\s+ADD COLUMN data_environment TEXT NOT NULL DEFAULT 'production'/s);
});
