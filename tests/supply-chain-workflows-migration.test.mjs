import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { demoTablePolicy } from "../functions/api/platform/_shared/demoDataCatalog.js";
import environmentCapabilities from "../functions/api/platform/_generated/environmentCapabilities.js";

test("supply-chain workflow migration provides versioned entities and immutable events", async () => {
  const sql = await readFile(new URL("../migrations/0016_supply_chain_workflows.sql", import.meta.url), "utf8");
  for (const table of ["supply_chain_workflow_entities", "supply_chain_workflow_events"]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
  }
  assert.match(sql, /UNIQUE\(resource_type, entity_id, result_version\)/i);
  assert.match(sql, /idempotency_key TEXT NOT NULL UNIQUE/i);
});

test("workflow tables have display policies and required environment capability coverage", () => {
  assert.equal(demoTablePolicy("supply_chain_workflow_entities").policy, "mask");
  assert.equal(demoTablePolicy("supply_chain_workflow_events").policy, "mask");
  const capability = environmentCapabilities.capabilities.find(item => item.id === "goods-flow-core");
  assert.ok(capability.tables.includes("supply_chain_workflow_entities"));
  assert.ok(capability.tables.includes("supply_chain_workflow_events"));
});
