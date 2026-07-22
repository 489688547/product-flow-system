import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const registryPath = resolve("docs/platform/integration-registry.json");

test("integration registry routes every AI consumer through Lingsuan", () => {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const lingsuan = registry.platforms.find(entry => entry.id === "lingsuan-ai-gateway");
  assert.ok(lingsuan, "Lingsuan gateway must be registered");
  assert.equal(registry.platforms.some(entry => entry.id === "openai-responses"), false);
  assert.match(lingsuan.summary, /公司统一 AI/);
  assert.equal(lingsuan.capabilities.includes("App 与功能归属审计"), true);
  assert.equal(lingsuan.capabilities.includes("Token 与 Skill 聚合"), true);
  assert.equal(lingsuan.codePaths.includes("functions/api/ecommerce-operations/ai-review.js"), true);
  assert.equal(lingsuan.codePaths.includes("src/features/data-center/AiModelWorkspace.jsx"), true);
  assert.equal(lingsuan.apiRoutes.includes("/api/platform/v1/ai/usage"), true);
  assert.equal(lingsuan.apiRoutes.includes("/api/ecommerce-operations/ai-review"), true);
  assert.equal(lingsuan.apiRoutes.includes("/api/platform/v1/platform-connections/:platformId/reveal"), true);
  assert.equal(lingsuan.codePaths.includes("functions/api/platform/v1/platform-connections/[platformId]/reveal.js"), true);
  assert.equal(lingsuan.evidence.includes("migrations/0010_platform_credential_reveal.sql"), true);
  assert.equal(lingsuan.evidence.includes("migrations/0009_ai_model_governance.sql"), true);
  assert.equal(JSON.stringify(lingsuan).includes("OPENAI_API_KEY"), false);
  assert.equal(JSON.stringify(lingsuan).includes("api.openai.com"), false);
});
