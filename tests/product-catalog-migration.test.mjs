import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const migrationUrl = new URL("../migrations/0006_product_catalog_components.sql", import.meta.url);
const environmentUrl = new URL("../docs/platform/environment-capabilities.json", import.meta.url);
const integrationUrl = new URL("../docs/platform/integration-registry.json", import.meta.url);

test("product catalog component migration is additive and indexed", () => {
  assert.equal(existsSync(migrationUrl), true);
  const sql = readFileSync(migrationUrl, "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS product_catalog_components\b/i);
  assert.match(sql, /parent_item_id TEXT NOT NULL/i);
  assert.match(sql, /ratio INTEGER NOT NULL/i);
  assert.match(sql, /idx_product_catalog_components_parent/i);
  assert.match(sql, /idx_product_catalog_components_code/i);
  assert.doesNotMatch(sql, /DROP\s+(TABLE|COLUMN)/i);
});

test("environment and integration manifests declare the component graph", () => {
  const environment = JSON.parse(readFileSync(environmentUrl, "utf8"));
  for (const id of ["product-catalog-storage", "kuaimai-product-sync"]) {
    const capability = environment.capabilities.find(item => item.id === id);
    assert.ok(capability.tables.includes("product_catalog_components"), `${id} must require the component table`);
  }

  const integrations = JSON.parse(readFileSync(integrationUrl, "utf8"));
  const kuaimai = integrations.platforms.find(item => item.id === "kuaimai");
  assert.ok(kuaimai.capabilities.includes("组合商品详情"));
  assert.ok(kuaimai.codePaths.includes("src/domain/productCatalogGraph.js"));
  const d1 = integrations.platforms.find(item => item.id === "cloudflare-d1");
  assert.ok(d1.evidence.includes("migrations/0006_product_catalog_components.sql"));
});
