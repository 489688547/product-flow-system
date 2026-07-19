import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("../migrations/0002_hr_management_core.sql", import.meta.url);
const environmentPath = new URL("../docs/platform/environment-capabilities.json", import.meta.url);
const registryPath = new URL("../docs/platform/integration-registry.json", import.meta.url);

const HR_TABLES = [
  "hr_employees",
  "hr_assignments",
  "hr_role_assignments",
  "hr_lifecycle_events",
  "hr_performance_templates",
  "hr_performance_cycles",
  "hr_performance_items",
  "hr_evidence_snapshots",
  "hr_audit_logs",
  "hr_management_meta"
];

test("HR core tables stay aligned across migration and environment manifest", () => {
  assert.equal(existsSync(migrationPath), true, "HR core migration must exist");
  const migration = readFileSync(migrationPath, "utf8");
  const environment = JSON.parse(readFileSync(environmentPath, "utf8"));
  const capability = environment.capabilities.find(item => item.id === "hr-management-core");

  assert.ok(capability, "hr-management-core environment capability must exist");
  assert.deepEqual(capability.tables, HR_TABLES);
  assert.deepEqual(capability.platforms, ["cloudflare-pages", "cloudflare-d1"]);
  assert.deepEqual(capability.requiredIn, ["preview", "production"]);
  assert.equal(capability.level, "blocking");

  for (const table of HR_TABLES) {
    assert.match(migration, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
});

test("integration registry routes HR storage without claiming DingTalk attendance", () => {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const d1 = registry.platforms.find(item => item.id === "cloudflare-d1");
  const dingtalk = registry.platforms.find(item => item.id === "dingtalk");

  assert.ok(d1.codePaths.includes("functions/api/hr-management/**"));
  assert.ok(d1.codePaths.includes("migrations/0002_hr_management_core.sql"));
  assert.doesNotMatch(dingtalk.capabilities.join(" "), /考勤|请假|加班|审批/);
});
