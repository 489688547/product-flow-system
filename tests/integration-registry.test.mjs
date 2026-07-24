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

test("Douyin restores only pre-authenticated Chrome official-report collection", () => {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const douyin = registry.platforms.find(entry => entry.id === "douyin-ecommerce");

  assert.ok(douyin, "Douyin ecommerce must be registered");
  assert.equal(douyin.status, "integrating");
  assert.match(douyin.summary, /已登录 Chrome/);
  assert.match(douyin.summary, /账号密码登录.*退役/);
  assert.equal(douyin.capabilities.includes("已登录 Chrome 官方报表采集"), true);
  assert.equal(douyin.capabilities.includes("账号密码登录保持退役"), true);
  for (const resource of ["店铺每日", "商品每日", "直播每日", "短视频每日"]) {
    assert.equal(douyin.capabilities.includes(resource), true, resource);
  }
  assert.equal(douyin.domains.includes("fxg.jinritemai.com"), true);
  assert.equal(douyin.domains.includes("compass.jinritemai.com"), true);
  assert.equal(douyin.apiRoutes.includes("/api/platform/v1/commerce-facts"), true);
  assert.equal(douyin.apiRoutes.includes("/api/platform/v1/commerce-facts/ingest"), true);
  assert.equal(douyin.evidence.includes("docs/decisions/2026-07-24-douyin-preauthenticated-chrome-collection.md"), true);
});
