import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DEMO_DATA_CATALOG,
  demoTablePolicy
} from "../functions/api/platform/_shared/demoDataCatalog.js";

const migration = readFileSync(
  new URL("../migrations/0018_collector_templates.sql", import.meta.url),
  "utf8"
);
const TABLES = [
  "collector_templates",
  "collector_template_versions",
  "collector_experimental_runs",
  "collector_experimental_run_events"
];

test("collector template migration creates versioned and idempotent control-plane storage", () => {
  for (const table of TABLES) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(migration, /PRIMARY KEY\s*\(template_id,\s*version\)/i);
  assert.match(migration, /create_idempotency_key TEXT NOT NULL UNIQUE/i);
  assert.match(migration, /publish_idempotency_key TEXT UNIQUE/i);
  assert.match(migration, /idempotency_key TEXT NOT NULL UNIQUE/i);
  assert.match(migration, /request_hash TEXT NOT NULL/i);
  assert.match(migration, /target_environment TEXT NOT NULL/i);
  assert.match(migration, /target_environment_version INTEGER NOT NULL/i);
  assert.doesNotMatch(
    migration,
    /password|cookie|access_token|refresh_token|verification_code|raw_html|absolute_path/i
  );
});

test("collector templates and experimental runs are explicitly skipped in display data", () => {
  const declared = new Set(DEMO_DATA_CATALOG.map(entry => entry.table));
  for (const table of TABLES) {
    assert.equal(declared.has(table), true, `${table} must declare a display-data policy`);
    assert.equal(demoTablePolicy(table).policy, "skip", table);
  }
});
