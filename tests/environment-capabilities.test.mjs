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

test("collaboration execution declares its Aliyun production schema", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "collaboration-execution");
  assert.ok(capability, "collaboration execution capability must be declared");
  assert.deepEqual(capability.platforms, ["aliyun", "dingtalk"]);
  assert.equal(capability.bindings.includes("PRODUCT_FLOW_DB"), true);
  assert.deepEqual(capability.tables, [
    "collaboration_items",
    "collaboration_participants",
    "collaboration_activities"
  ]);
  assert.equal(existsSync(resolve(root, "migrations/0002_collaboration_execution.sql")), true);
});

test("development backlog declares its Aliyun control database and governed AI boundary", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "development-backlog");
  assert.ok(capability, "development backlog capability must be declared");
  assert.deepEqual(capability.platforms, ["aliyun", "lingsuan-ai-gateway"]);
  assert.deepEqual(capability.requiredIn, ["preview", "production"]);
  assert.deepEqual(capability.envVars, []);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.tables, ["development_backlog_items", "development_backlog_events"]);
  assert.equal(existsSync(resolve(root, "migrations/0014_development_backlog.sql")), true);
});

test("platform credential vault declares its root secret migration and affected providers", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "platform-credential-vault");
  assert.ok(capability, "platform credential vault capability must be declared");
  assert.deepEqual(capability.platforms, ["aliyun", "dingtalk", "kuaimai", "lingsuan-ai-gateway"]);
  assert.deepEqual(capability.requiredIn, ["preview", "production"]);
  assert.deepEqual(capability.envVars, ["PLATFORM_CREDENTIAL_MASTER_KEY"]);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.tables, ["platform_credentials", "platform_credential_audit"]);
  assert.equal(existsSync(resolve(root, "migrations/0003_platform_credentials.sql")), true);
  const revealMigration = readFileSync(resolve(root, "migrations/0010_platform_credential_reveal.sql"), "utf8");
  assert.match(revealMigration, /ALTER TABLE platform_credential_audit/);
  assert.match(revealMigration, /ADD COLUMN purpose TEXT NOT NULL DEFAULT ''/);

  const kuaimai = manifest.capabilities.find(entry => entry.id === "kuaimai-sales-sync");
  assert.deepEqual(kuaimai.requiredIn, []);
  assert.equal(kuaimai.envVars.includes("KUAIMAI_ACCESS_TOKEN"), true);
  assert.equal(kuaimai.tables.includes("data_sync_runs"), true);
  assert.match(kuaimai.description, /当前产品不调用快麦开放平台 API/);

  const chromeCollection = manifest.capabilities.find(entry => entry.id === "company-web-data-collection");
  assert.deepEqual(chromeCollection.requiredIn, ["preview", "production"]);
  assert.deepEqual(chromeCollection.platforms, [
    "aliyun",
    "kuaimai",
    "douyin-ecommerce",
    "erp-file-import"
  ]);
  assert.match(chromeCollection.description, /快麦.*MV3/);
  assert.match(chromeCollection.description, /抖店.*Ego/);
  assert.match(chromeCollection.description, /阿里云.*SQLite/);
  assert.match(chromeCollection.description, /异常.*幂等排队/);

  const registry = JSON.parse(readFileSync(resolve(root, "docs/platform/integration-registry.json"), "utf8"));
  const kuaimaiRegistry = registry.platforms.find(entry => entry.id === "kuaimai");
  assert.equal(kuaimaiRegistry.apiRoutes.includes("/api/platform/v1/data-services/sales-repair"), true);
  assert.equal(kuaimaiRegistry.codePaths.includes("functions/api/platform/v1/data-services/sales-repair.js"), true);
});

test("Aliyun declares production, test API, and static test frontend separately", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const production = manifest.capabilities.find(entry => entry.id === "aliyun-ecs-production");
  const testApi = manifest.capabilities.find(entry => entry.id === "aliyun-ecs-test-api");
  const staticTest = manifest.capabilities.find(entry => entry.id === "cloudflare-pages-static-test");

  assert.deepEqual(production.requiredIn, ["production"]);
  assert.deepEqual(production.platforms, ["aliyun", "dingtalk"]);
  assert.deepEqual(testApi.requiredIn, ["preview"]);
  assert.deepEqual(testApi.platforms, ["aliyun", "dingtalk"]);
  assert.equal(testApi.envVars.includes("PFS_PUBLIC_APP_ORIGIN"), true);
  assert.equal(testApi.envVars.includes("PFS_ALLOWED_BROWSER_ORIGIN"), true);
  assert.deepEqual(staticTest.requiredIn, ["preview"]);
  assert.deepEqual(staticTest.platforms, ["cloudflare-pages"]);
  assert.deepEqual(staticTest.bindings, []);
  assert.deepEqual(staticTest.tables, []);
});

test("core developer access declares a server-only personal token and control tables", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "local-core-developer-access");

  assert.deepEqual(capability.requiredIn, []);
  assert.deepEqual(capability.platforms, ["aliyun", "dingtalk"]);
  assert.deepEqual(capability.envVars, ["PFS_CORE_DEVELOPER_TOKEN"]);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.equal(capability.tables.includes("production_data_access_tokens"), true);
  assert.match(capability.description, /浏览器不接触 Token/);
});

test("display data environment declares separate control and business D1 requirements", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "display-data-environment");

  assert.ok(capability, "display data environment capability must be declared");
  assert.deepEqual(capability.envVars, ["DEMO_DATA_MASKING_KEY"]);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB", "DEMO_FLOW_DB"]);
  assert.deepEqual(capability.bindingTables.PRODUCT_FLOW_DB, [
    "data_environment_grants",
    "demo_data_environment_state",
    "demo_data_refresh_jobs",
    "data_environment_audit"
  ]);
  assert.equal(capability.bindingTables.DEMO_FLOW_DB.includes("product_flow_state"), true);
  assert.equal(capability.bindingTables.DEMO_FLOW_DB.includes("product_sales_daily"), true);
  assert.equal(capability.bindingTables.DEMO_FLOW_DB.includes("platform_credentials"), false);
  assert.equal(existsSync(resolve(root, "migrations/0011_demo_data_environment.sql")), true);
});

test("company AI declares one governed capability without the retired OpenAI review", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "company-ai-assistant");
  assert.ok(capability, "company AI capability must be declared");
  assert.equal(capability.name, "公司统一 AI");
  assert.deepEqual(capability.platforms, ["lingsuan-ai-gateway", "aliyun"]);
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

test("goods flow declares its Aliyun production schema without claiming Kuaimai inventory", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "goods-flow-core");
  assert.ok(capability, "goods flow capability must be declared");
  assert.deepEqual(capability.platforms, ["aliyun", "dingtalk", "kuaimai", "erp-file-import"]);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB"]);
  assert.deepEqual(capability.tables, [
    "goods_flow_events",
    "goods_flow_inventory_daily",
    "goods_flow_inventory_daily_stage",
    "goods_flow_stocktakes",
    "goods_flow_stocktake_lines",
    "goods_flow_receivable_terms",
    "goods_flow_ccc_monthly",
    "goods_flow_exceptions",
    "supply_chain_workflow_entities",
    "supply_chain_workflow_events"
  ]);
  assert.equal(existsSync(resolve(root, "migrations/0005_goods_flow_core.sql")), true);
  assert.equal(existsSync(resolve(root, "migrations/0015_data_center_supply_chain_facts.sql")), true);
  assert.equal(existsSync(resolve(root, "migrations/0016_supply_chain_workflows.sql")), true);

  const registry = JSON.parse(readFileSync(resolve(root, "docs/platform/integration-registry.json"), "utf8"));
  const kuaimai = registry.platforms.find(entry => entry.id === "kuaimai");
  assert.equal(kuaimai.capabilities.includes("库存同步"), false);
});

test("environment capability validation rejects secret values and unknown platforms", async () => {
  assert.equal(existsSync(generatorPath), true, "platform manifest generator must exist");
  const { validateEnvironmentCapabilities } = await import(generatorPath);
  const registry = { platforms: [{ id: "aliyun" }] };
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

test("Douyin Compass collection declares Ego and Aliyun SQLite without a new secret", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const capability = manifest.capabilities.find(entry => entry.id === "douyin-compass-collection");

  assert.ok(capability, "Douyin Compass collection capability must be declared");
  assert.deepEqual(capability.platforms, [
    "douyin-ecommerce",
    "erp-file-import",
    "aliyun"
  ]);
  assert.deepEqual(capability.requiredIn, []);
  assert.deepEqual(capability.envVars, []);
  assert.deepEqual(capability.bindings, ["PRODUCT_FLOW_DB", "DEMO_FLOW_DB"]);
  assert.deepEqual(capability.bindingTables.PRODUCT_FLOW_DB, [
    "web_collection_runners",
    "web_collection_stores",
    "web_collection_jobs",
    "web_collection_runs",
    "web_collection_cursors",
    "web_collection_notifications",
    "commerce_fact_batches",
    "commerce_store_daily_facts",
    "commerce_product_daily_facts",
    "commerce_live_daily_facts",
    "commerce_video_daily_facts"
  ]);
  assert.deepEqual(capability.bindingTables.DEMO_FLOW_DB, [
    "commerce_fact_batches",
    "commerce_store_daily_facts",
    "commerce_product_daily_facts",
    "commerce_live_daily_facts",
    "commerce_video_daily_facts"
  ]);
  assert.match(capability.description, /账号密码登录保持退役/);
  assert.match(capability.description, /Ego Task Space/);
  assert.match(capability.description, /阿里云.*SQLite/);
  assert.doesNotMatch(capability.description, /Cloudflare D1/);
});
