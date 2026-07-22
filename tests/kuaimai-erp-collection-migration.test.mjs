import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("../migrations/0007_kuaimai_erp_collection.sql", import.meta.url);
const archiveMigrationPath = new URL("../migrations/0008_kuaimai_erp_local_archives.sql", import.meta.url);
const environmentPath = new URL("../docs/platform/environment-capabilities.json", import.meta.url);

export const KUAIMAI_ERP_COLLECTION_TABLES = [
  "erp_collection_batches",
  "erp_source_records",
  "erp_collection_issues",
  "erp_file_archives",
  "erp_collector_tokens"
];

test("Kuaimai ERP collection tables stay aligned with the environment capability", () => {
  assert.equal(existsSync(migrationPath), true, "Kuaimai ERP collection migration must exist");
  assert.equal(existsSync(archiveMigrationPath), true, "Kuaimai ERP archive migration must exist");
  const migration = `${readFileSync(migrationPath, "utf8")}\n${readFileSync(archiveMigrationPath, "utf8")}`;
  const environment = JSON.parse(readFileSync(environmentPath, "utf8"));
  const capability = environment.capabilities.find(item => item.id === "kuaimai-erp-file-collection");
  assert.ok(capability, "kuaimai-erp-file-collection capability must exist");
  assert.deepEqual(capability.tables, KUAIMAI_ERP_COLLECTION_TABLES);
  assert.deepEqual(capability.envVars, []);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.platforms, ["kuaimai", "erp-file-import", "cloudflare-pages", "cloudflare-d1"]);
  assert.deepEqual(capability.requiredIn, ["preview", "production"]);
  assert.equal(capability.level, "blocking");
  for (const table of KUAIMAI_ERP_COLLECTION_TABLES) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(migration, /UNIQUE\s*\(platform_id, resource_type, content_hash\)/i);
  assert.match(migration, /UNIQUE\s*\(resource_type, source_key\)/i);
  assert.match(migration, /FOREIGN KEY\s*\(source_batch_id\)\s*REFERENCES erp_collection_batches\(id\)/i);
  assert.match(migration, /payload TEXT NOT NULL/i);
  assert.match(migration, /content_hash TEXT NOT NULL/i);
  assert.match(migration, /status TEXT NOT NULL/i);
  assert.match(migration, /ALTER TABLE erp_collection_batches ADD COLUMN archive_id TEXT/i);
  assert.match(migration, /UNIQUE\s*\(platform_id, content_hash\)/i);
  assert.match(migration, /token_hash TEXT NOT NULL UNIQUE/i);
  assert.match(migration, /scope TEXT NOT NULL DEFAULT 'kuaimai_erp_ingest'/i);
  assert.doesNotMatch(migration, /password|cookie|access_token|refresh_token|verification_code|raw_html/i);
});
