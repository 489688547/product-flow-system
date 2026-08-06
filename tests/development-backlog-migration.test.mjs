import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import { demoTablePolicy } from "../functions/api/platform/_shared/demoDataCatalog.js";

const migrationPath = resolve("migrations/0014_development_backlog.sql");
const manifestPath = resolve("docs/platform/environment-capabilities.json");

test("development backlog declares control-plane SQLite tables skipped from display data", () => {
  assert.equal(existsSync(migrationPath), true, "development backlog migration must exist");
  const sql = readFileSync(migrationPath, "utf8");
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "development-backlog");

  assert.ok(capability, "development-backlog capability must exist");
  assert.deepEqual(capability.platforms, ["aliyun", "lingsuan-ai-gateway"]);
  assert.deepEqual(capability.requiredIn, ["preview", "production"]);
  assert.deepEqual(capability.envVars, []);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.tables, ["development_backlog_items", "development_backlog_events"]);

  for (const table of capability.tables) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
    assert.equal(demoTablePolicy(table).policy, "skip");
  }
  assert.doesNotMatch(sql, /prompt|cookie|credential|provider_response/i);
});

test("development backlog schema constrains status priority version and append-only history", () => {
  const sql = readFileSync(migrationPath, "utf8");
  assert.match(sql, /priority IN \('p0', 'p1', 'p2', 'p3'\)/);
  assert.match(sql, /status IN \('clarification', 'ready', 'in_progress', 'review', 'completed', 'blocked', 'cancelled'\)/);
  assert.match(sql, /version INTEGER NOT NULL DEFAULT 1 CHECK \(version >= 1\)/);
  assert.match(sql, /FOREIGN KEY\(item_id\) REFERENCES development_backlog_items\(id\)/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_development_backlog_items_status_priority/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_development_backlog_events_item_created/);
  assert.doesNotMatch(sql, /UPDATE development_backlog_events|DELETE FROM development_backlog_events/i);
});

test("development backlog durable docs and API contract are registered", () => {
  for (const path of [
    "docs/features/development-backlog/prd.md",
    "docs/features/development-backlog/design.md",
    "docs/features/development-backlog/plan.md",
    "docs/features/development-backlog/tasks.md"
  ]) {
    assert.equal(existsSync(resolve(path)), true, `${path} must exist`);
  }
});

test("development backlog API errors and agent claim rule are durable", () => {
  const agents = readFileSync(resolve("AGENTS.md"), "utf8");
  const catalog = readFileSync(resolve("docs/platform/api-catalog.md"), "utf8");
  const errors = readFileSync(resolve("docs/platform/error-codes.md"), "utf8");
  const apiPath = resolve("docs/platform/apis/development-backlog-v1.md");
  assert.equal(existsSync(apiPath), true, "development backlog API contract must exist");
  assert.match(agents, /研发待办[\s\S]*查询[\s\S]*认领/);
  assert.match(catalog, /\/api\/platform\/v1\/development-backlog/);
  assert.match(errors, /BACKLOG_ACTIVE_CONFLICT/);
  assert.match(readFileSync(apiPath, "utf8"), /expectedVersion/);
});

test("development backlog tests run through the default API test suite", () => {
  const packageJson = JSON.parse(readFileSync(resolve("package.json"), "utf8"));
  const backlogTestScript = packageJson.scripts?.["test:development-backlog"] || "";
  for (const file of [
    "tests/development-backlog-migration.test.mjs",
    "tests/development-backlog-domain.test.mjs",
    "tests/development-backlog-api.test.mjs",
    "tests/development-backlog-ai.test.mjs"
  ]) {
    assert.match(backlogTestScript, new RegExp(file.replaceAll(".", "\\.")));
  }
  assert.match(packageJson.scripts?.test || "", /npm run test:development-backlog/);
});
