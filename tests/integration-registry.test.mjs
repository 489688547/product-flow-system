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

test("Douyin uses Ego only and writes formal facts through Aliyun", () => {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  const douyin = registry.platforms.find(entry => entry.id === "douyin-ecommerce");

  assert.ok(douyin, "Douyin ecommerce must be registered");
  assert.equal(douyin.status, "integrating");
  assert.match(douyin.summary, /Ego/);
  assert.match(douyin.summary, /阿里云.*SQLite/);
  assert.doesNotMatch(douyin.summary, /Chrome.*默认|默认.*Chrome/);
  assert.match(douyin.summary, /账号密码登录.*退役/);
  assert.equal(douyin.capabilities.includes("Ego Task Space 官方报表采集"), true);
  assert.equal(douyin.capabilities.includes("已登录 Chrome 官方报表采集"), false);
  assert.equal(douyin.capabilities.includes("账号密码登录保持退役"), true);
  for (const resource of ["店铺每日", "商品每日", "直播每日", "短视频每日"]) {
    assert.equal(douyin.capabilities.includes(resource), true, resource);
  }
  assert.equal(douyin.domains.includes("fxg.jinritemai.com"), true);
  assert.equal(douyin.domains.includes("compass.jinritemai.com"), true);
  assert.equal(douyin.apiRoutes.includes("/api/platform/v1/commerce-facts"), true);
  assert.equal(douyin.apiRoutes.includes("/api/platform/v1/commerce-facts/ingest"), true);
  assert.equal(douyin.evidence.includes("docs/features/douyin-ego-collector/design.md"), true);
  const aliyun = douyin.relations.find(relation => relation.platformId === "aliyun");
  assert.equal(aliyun?.type, "formal-facts-target");
  assert.match(aliyun.description, /ECS.*SQLite/);
  const d1 = douyin.relations.find(relation => relation.platformId === "cloudflare-d1");
  assert.equal(d1?.type, "rollback-only");
  assert.match(d1.description, /不接收.*Ego/);
});

test("ADR directory is not a provider code path", () => {
  const registry = JSON.parse(readFileSync(registryPath, "utf8"));
  // docs/decisions/** 曾挂在 aliyun 名下，使每个 ADR 都被强制声明 Integration-Impact: aliyun。
  // 决策记录是跨领域文档，不属于任何 Provider 的代码路径。
  for (const platform of registry.platforms) {
    assert.equal(
      platform.codePaths.some(path => path === "docs/decisions/**" || path.startsWith("docs/decisions/")),
      false,
      `${platform.id} 不应把 docs/decisions 登记为代码路径`
    );
  }
});

test("durable rule declarations accept every source of truth named in AGENTS.md", async () => {
  const { checkRuleWriteback } = await import("../scripts/integration-registry.mjs");
  const body = paths => `Rule-Writeback: ${paths}\nRule-Writeback-Reason: 同步持久规则`;

  for (const path of ["AGENTS.md", "DESIGN.md", "PRODUCT.md", "docs/product/x.md", "docs/platform/y.md", "docs/decisions/z.md"]) {
    const { errors } = checkRuleWriteback({ paths: [path], body: body(path) });
    assert.deepEqual(errors, [], `${path} 应被接受为长期规则文件`);
  }
  // 普通实现文件仍然不能充当规则反写目标
  const rejected = checkRuleWriteback({ paths: ["src/styles.css"], body: body("src/styles.css") });
  assert.equal(rejected.errors.some(error => error.includes("只能声明长期规则文件")), true);
});
