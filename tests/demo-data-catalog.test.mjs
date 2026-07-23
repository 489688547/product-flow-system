import assert from "node:assert/strict";
import test from "node:test";

import {
  DEMO_DATA_CATALOG,
  copyableDemoTables,
  demoTablePolicy
} from "../functions/api/platform/_shared/demoDataCatalog.js";

test("catalog transforms sales, recalculates summaries and skips unknown tables", () => {
  assert.equal(demoTablePolicy("product_sales_daily").policy, "transform_sales");
  assert.equal(demoTablePolicy("data_metric_results").policy, "recalculate");
  assert.equal(demoTablePolicy("totally_unknown_table").policy, "skip");
  assert.equal(copyableDemoTables().some(entry => entry.table === "totally_unknown_table"), false);
});

test("credentials, sessions, grants, tokens, provider configuration and audits never copy", () => {
  for (const table of [
    "product_flow_sessions",
    "product_flow_ding_user_tokens",
    "production_data_access_tokens",
    "production_write_unlocks",
    "platform_credentials",
    "credential_vault_entries",
    "data_environment_grants",
    "demo_data_refresh_jobs",
    "data_ai_providers",
    "ai_usage_audit",
    "ai_skill_audit",
    "erp_collector_tokens",
    "web_collection_runners",
    "user_insight_runner_tokens"
  ]) {
    assert.equal(demoTablePolicy(table).policy, "skip", table);
  }
});

test("every mask entry declares field-level masking and copy metadata is bounded", () => {
  const maskEntries = DEMO_DATA_CATALOG.filter(entry => entry.policy === "mask");
  assert.ok(maskEntries.length > 0);
  for (const entry of maskEntries) {
    assert.ok(Object.keys(entry.maskFields || {}).length > 0 || (entry.maskJsonFields || []).length > 0, entry.table);
  }
  for (const entry of copyableDemoTables()) {
    assert.ok(entry.copyOrder > 0, entry.table);
    assert.ok(entry.batchSize > 0 && entry.batchSize <= 250, entry.table);
    assert.ok(Array.isArray(entry.primaryKey) && entry.primaryKey.length > 0, entry.table);
  }
});
