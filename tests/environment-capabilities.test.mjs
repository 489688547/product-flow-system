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

test("platform credential vault declares its root secret migration and affected providers", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "platform-credential-vault");
  assert.ok(capability, "platform credential vault capability must be declared");
  assert.deepEqual(capability.platforms, ["cloudflare-pages", "cloudflare-d1", "dingtalk", "kuaimai", "lingsuan-ai-gateway"]);
  assert.deepEqual(capability.requiredIn, ["preview", "production"]);
  assert.deepEqual(capability.envVars, ["PLATFORM_CREDENTIAL_MASTER_KEY"]);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.tables, ["platform_credentials", "platform_credential_audit"]);
  assert.equal(existsSync(resolve(root, "migrations/0003_platform_credentials.sql")), true);
  const revealMigration = readFileSync(resolve(root, "migrations/0010_platform_credential_reveal.sql"), "utf8");
  assert.match(revealMigration, /ALTER TABLE platform_credential_audit/);
  assert.match(revealMigration, /ADD COLUMN purpose TEXT NOT NULL DEFAULT ''/);

  const kuaimai = manifest.capabilities.find(entry => entry.id === "kuaimai-sales-sync");
  assert.equal(kuaimai.envVars.includes("KUAIMAI_ACCESS_TOKEN"), true);
  assert.equal(kuaimai.tables.includes("data_sync_runs"), true);
  assert.match(kuaimai.description, /自动补拉/);

  const registry = JSON.parse(readFileSync(resolve(root, "docs/platform/integration-registry.json"), "utf8"));
  const kuaimaiRegistry = registry.platforms.find(entry => entry.id === "kuaimai");
  assert.equal(kuaimaiRegistry.apiRoutes.includes("/api/platform/v1/data-services/sales-repair"), true);
  assert.equal(kuaimaiRegistry.codePaths.includes("functions/api/platform/v1/data-services/sales-repair.js"), true);
});

test("Pages declares explicit local Preview and Production D1 environment parity", () => {
  const wrangler = readFileSync(resolve(root, "wrangler.toml"), "utf8");
  assert.match(wrangler, /\[\[d1_databases\]\]/);
  assert.match(wrangler, /\[\[env\.preview\.d1_databases\]\]/);
  assert.match(wrangler, /\[\[env\.production\.d1_databases\]\]/);
  assert.doesNotMatch(wrangler, /\[.*secrets\]/, "Pages rejects Wrangler secret sections");
  assert.equal(existsSync(resolve(root, "scripts/check-pages-environment-parity.mjs")), true);
});

test("company AI declares one governed capability without the retired OpenAI review", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "company-ai-assistant");
  assert.ok(capability, "company AI capability must be declared");
  assert.equal(capability.name, "公司统一 AI");
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
  assert.equal(existsSync(resolve(root, "migrations/0009_ai_model_governance.sql")), true);
  assert.equal(manifest.capabilities.some(entry => entry.id === "operations-ai-review"), false);
  assert.equal(JSON.stringify(manifest).includes("OPENAI_API_KEY"), false);
  assert.equal(JSON.stringify(manifest).includes("OPENAI_MODEL"), false);
});

test("goods flow declares its production D1 schema without claiming Kuaimai inventory", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "goods-flow-core");
  assert.ok(capability, "goods flow capability must be declared");
  assert.deepEqual(capability.platforms, ["cloudflare-pages", "cloudflare-d1", "dingtalk", "kuaimai", "erp-file-import"]);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.tables, [
    "goods_flow_events",
    "goods_flow_inventory_daily",
    "goods_flow_stocktakes",
    "goods_flow_stocktake_lines",
    "goods_flow_receivable_terms",
    "goods_flow_ccc_monthly",
    "goods_flow_exceptions"
  ]);
  assert.equal(existsSync(resolve(root, "migrations/0005_goods_flow_core.sql")), true);

  const registry = JSON.parse(readFileSync(resolve(root, "docs/platform/integration-registry.json"), "utf8"));
  const kuaimai = registry.platforms.find(entry => entry.id === "kuaimai");
  assert.equal(kuaimai.capabilities.includes("库存同步"), false);
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
