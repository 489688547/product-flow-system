import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("sales-code mappings have a versioned table and append-only audit", () => {
  const sql = read("migrations/0012_product_catalog_sales_mappings.sql");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS product_catalog_sales_mappings\b/i);
  assert.match(sql, /code TEXT PRIMARY KEY/i);
  assert.match(sql, /version INTEGER NOT NULL/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS product_catalog_sales_mapping_audit\b/i);
  assert.match(sql, /idx_product_catalog_sales_mapping_audit_code/i);
});

test("sales-code mapping storage is governed in environment and display-data manifests", () => {
  const environment = JSON.parse(read("docs/platform/environment-capabilities.json"));
  const capability = environment.capabilities.find(entry => entry.id === "product-catalog-storage");
  assert.ok(capability.tables.includes("product_catalog_sales_mappings"));
  assert.ok(capability.tables.includes("product_catalog_sales_mapping_audit"));

  const demoCatalog = read("functions/api/platform/_shared/demoDataCatalog.js");
  assert.match(demoCatalog, /table\("product_catalog_sales_mappings", "mask"/);
  assert.match(demoCatalog, /table\("product_catalog_sales_mapping_audit", "mask"/);
});
