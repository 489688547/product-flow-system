import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const manifestPath = resolve(root, "docs/platform/environment-capabilities.json");
const generatorPath = resolve(root, "scripts/generate-platform-manifests.mjs");

test("environment capability manifest validates platform references and generated modules", async () => {
  assert.equal(existsSync(manifestPath), true, "environment capability manifest must exist");
  assert.equal(existsSync(generatorPath), true, "platform manifest generator must exist");

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const registry = JSON.parse(readFileSync(resolve(root, "docs/platform/integration-registry.json"), "utf8"));
  const { validateEnvironmentCapabilities, renderGeneratedModule } = await import(generatorPath);
  assert.deepEqual(validateEnvironmentCapabilities(manifest, registry), []);

  const environmentModule = readFileSync(resolve(root, "functions/api/platform/_generated/environmentCapabilities.js"), "utf8");
  const registryModule = readFileSync(resolve(root, "functions/api/platform/_generated/integrationRegistry.js"), "utf8");
  assert.equal(environmentModule, renderGeneratedModule("environmentCapabilities", manifest));
  assert.equal(registryModule, renderGeneratedModule("integrationRegistry", registry));
});

test("collaboration execution declares its production D1 schema", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "collaboration-execution");
  assert.ok(capability, "collaboration execution capability must be declared");
  assert.deepEqual(capability.platforms, ["cloudflare-pages", "cloudflare-d1", "dingtalk"]);
  assert.equal(capability.bindings.includes("PRODUCT_FLOW_DB"), true);
  assert.deepEqual(capability.tables, [
    "collaboration_items",
    "collaboration_participants",
    "collaboration_activities"
  ]);
  assert.equal(existsSync(resolve(root, "migrations/0002_collaboration_execution.sql")), true);
});

test("company assistant declares Provider secrets and production D1 schema", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "company-ai-assistant");
  assert.ok(capability, "company AI assistant capability must be declared");
  assert.deepEqual(capability.platforms, ["lingsuan-ai-gateway", "cloudflare-pages", "cloudflare-d1"]);
  assert.deepEqual(capability.envVars, ["AI_ASSISTANT_ENABLED", "LINGSUAN_API_KEY", "LINGSUAN_ACTOR_AUTHORIZATION"]);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.tables, [
    "data_ai_providers",
    "data_ai_policies",
    "ai_usage_audit",
    "ai_skill_audit",
    "ai_request_leases"
  ]);
  assert.equal(existsSync(resolve(root, "migrations/0003_company_ai_assistant.sql")), true);
  assert.equal(existsSync(resolve(root, "migrations/0004_company_ai_skills.sql")), true);
});

test("environment capability validation rejects secret values and unknown platforms", async () => {
  assert.equal(existsSync(generatorPath), true, "platform manifest generator must exist");
  const { validateEnvironmentCapabilities } = await import(generatorPath);
  const registry = { platforms: [{ id: "cloudflare-pages" }] };
  const invalid = {
    schemaVersion: 1,
    updatedAt: "2026-07-18",
    capabilities: [{
      id: "bad",
      name: "错误能力",
      platforms: ["unknown"],
      requiredIn: ["production"],
      envVars: ["TOKEN=secret-value"],
      bindings: [],
      tables: []
    }]
  };
  const errors = validateEnvironmentCapabilities(invalid, registry);
  assert.equal(errors.some(error => error.includes("未知平台")), true);
  assert.equal(errors.some(error => error.includes("变量名")), true);
});
