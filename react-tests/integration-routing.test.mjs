import assert from "node:assert/strict";
import test from "node:test";
import {
  checkRuleWriteback,
  checkIntegrationImpact,
  isIntegrationCodePath,
  loadIntegrationRegistry,
  matchIntegrationPlatforms,
  parseIntegrationImpact,
  validateIntegrationRegistry
} from "../scripts/integration-registry.mjs";

const rootDir = new URL("..", import.meta.url).pathname;

test("integration registry is valid and contains the approved initial lifecycle", () => {
  const registry = loadIntegrationRegistry(rootDir);
  assert.deepEqual(validateIntegrationRegistry(registry), []);

  const statusById = Object.fromEntries(registry.platforms.map(platform => [platform.id, platform.status]));
  assert.equal(statusById.dingtalk, "connected");
  assert.equal(statusById.kuaimai, "connected");
  assert.equal(statusById["cloudflare-pages"], "connected");
  assert.equal(statusById["cloudflare-d1"], "connected");
  assert.equal(statusById.aliyun, "integrating");
  assert.equal(statusById["erp-file-import"], "integrating");
  assert.equal(statusById["taobao-open-platform"], "planned");
  assert.equal(statusById["pinduoduo-open-platform"], "planned");
  assert.equal(statusById["xiaohongshu-open-platform"], "planned");
  assert.equal(statusById["oceanengine-qianchuan"], "planned");
});

test("registry validation rejects duplicate ids, invalid relations, and public secrets", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const invalid = structuredClone(registry);
  invalid.platforms.push({ ...structuredClone(invalid.platforms[0]) });
  invalid.platforms[0].relations.push({
    platformId: "missing-platform",
    type: "depends-on",
    description: "invalid"
  });
  invalid.platforms[0].password = "should-never-exist";

  const errors = validateIntegrationRegistry(invalid);
  assert.ok(errors.some(error => error.includes("重复")));
  assert.ok(errors.some(error => error.includes("missing-platform")));
  assert.ok(errors.some(error => error.includes("password")));
});

test("registry validation requires evidence for integrating platforms", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const invalid = structuredClone(registry);
  invalid.platforms.find(platform => platform.id === "aliyun").evidence = [];

  assert.ok(validateIntegrationRegistry(invalid).some(error => error.includes("integrating") && error.includes("evidence")));
});

test("router matches prompt keywords and expands one-hop related platforms", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const result = matchIntegrationPlatforms(registry, {
    text: "快麦订单同步到销售档案失败",
    paths: []
  });

  assert.deepEqual(result.direct.map(match => match.id), ["kuaimai"]);
  assert.ok(result.related.some(match => match.id === "cloudflare-d1"));
  assert.ok(result.direct[0].evidence.some(item => item.type === "keyword"));
});

test("router treats changed code paths as mandatory evidence", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const result = matchIntegrationPlatforms(registry, {
    text: "调整登录回调",
    paths: ["functions/api/auth/dingtalk/callback.js"]
  });

  const dingtalk = result.direct.find(match => match.id === "dingtalk");
  assert.ok(dingtalk);
  assert.equal(dingtalk.required, true);
  assert.ok(dingtalk.evidence.some(item => item.type === "path"));
});

test("router treats provider domains, env vars, and API routes in changed code as mandatory evidence", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const result = matchIntegrationPlatforms(registry, {
    content: `
      const endpoint = "https://api.dingtalk.com/v1.0/todo/users";
      const key = env.KUAIMAI_APP_KEY;
      fetch("/api/kuaimai/pull");
    `
  });

  const dingtalk = result.direct.find(match => match.id === "dingtalk");
  const kuaimai = result.direct.find(match => match.id === "kuaimai");
  assert.equal(dingtalk.required, true);
  assert.ok(dingtalk.evidence.some(item => item.type === "domain"));
  assert.equal(kuaimai.required, true);
  assert.ok(kuaimai.evidence.some(item => item.type === "env"));
  assert.ok(kuaimai.evidence.some(item => item.type === "api-route"));
});

test("router keeps ambiguous candidates instead of silently choosing one", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const result = matchIntegrationPlatforms(registry, {
    text: "检查开放平台商品能力",
    paths: []
  });

  assert.ok(result.direct.length > 1);
  assert.equal(result.ambiguous, true);
});

test("integration content routing ignores generated Pages assets but keeps source code", () => {
  assert.equal(isIntegrationCodePath("assets/HandbookPage-QWj1s2m5.js"), false);
  assert.equal(isIntegrationCodePath("assets/index-DJmNTJZv.js"), false);
  assert.equal(isIntegrationCodePath("react-tests/integration-routing.test.mjs"), false);
  assert.equal(isIntegrationCodePath("tests/deployed-readiness.test.mjs"), false);
  assert.equal(isIntegrationCodePath("src/features/handbook/HandbookPage.jsx"), true);
  assert.equal(isIntegrationCodePath("functions/api/platform/v1/example.js"), true);
});

test("PR impact parser reads machine-readable fields", () => {
  assert.deepEqual(parseIntegrationImpact(`
## 变更

Integration-Impact: dingtalk, cloudflare-pages
Integration-Impact-Reason: 登录回调由 Pages Functions 承载
  `), {
    declaredIds: ["dingtalk", "cloudflare-pages"],
    reason: "登录回调由 Pages Functions 承载"
  });
});

test("impact check accepts complete declarations and rejects missing path coverage", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const paths = ["functions/api/auth/dingtalk/callback.js"];
  const accepted = checkIntegrationImpact(registry, {
    paths,
    body: "Integration-Impact: dingtalk, cloudflare-pages, cloudflare-d1\nIntegration-Impact-Reason: 调整登录回调"
  });
  assert.deepEqual(accepted.errors, []);

  const rejected = checkIntegrationImpact(registry, {
    paths,
    body: "Integration-Impact: cloudflare-pages, cloudflare-d1\nIntegration-Impact-Reason: 调整登录回调"
  });
  assert.ok(rejected.errors.some(error => error.includes("dingtalk")));
});

test("impact check also requires platforms detected from changed code content", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const rejected = checkIntegrationImpact(registry, {
    paths: ["src/state/providerClient.js"],
    content: "fetch('https://api.dingtalk.com/v1.0/contact/users/me')",
    body: "Integration-Impact: none\nIntegration-Impact-Reason: 新增服务端调用"
  });
  assert.ok(rejected.errors.some(error => error.includes("dingtalk")));
});

test("impact check rejects missing declarations, unknown ids, and empty reasons", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const paths = ["functions/api/kuaimai/pull.js"];

  assert.ok(checkIntegrationImpact(registry, { paths, body: "" }).errors.some(error => error.includes("Integration-Impact")));
  assert.ok(checkIntegrationImpact(registry, {
    paths,
    body: "Integration-Impact: mystery\nIntegration-Impact-Reason: 新平台"
  }).errors.some(error => error.includes("mystery")));
  assert.ok(checkIntegrationImpact(registry, {
    paths,
    body: "Integration-Impact: kuaimai, cloudflare-pages"
  }).errors.some(error => error.includes("Reason")));
});

test("none is allowed only with a reason and no mandatory path matches", () => {
  const registry = loadIntegrationRegistry(rootDir);
  assert.deepEqual(checkIntegrationImpact(registry, {
    paths: ["src/features/handbook/HandbookPage.jsx"],
    body: "Integration-Impact: none\nIntegration-Impact-Reason: 仅调整本地说明书布局"
  }).errors, []);
  assert.ok(checkIntegrationImpact(registry, {
    paths: ["src/features/handbook/HandbookPage.jsx"],
    body: "Integration-Impact: none"
  }).errors.some(error => error.includes("Reason")));
  assert.ok(checkIntegrationImpact(registry, {
    paths: ["functions/api/kuaimai/pull.js"],
    body: "Integration-Impact: none\nIntegration-Impact-Reason: 没有外部影响"
  }).errors.some(error => error.includes("kuaimai")));
});

test("shared boundary changes require an explicit durable rule write-back", () => {
  const missing = checkRuleWriteback({
    paths: ["functions/api/platform/v1/example.js"],
    body: "Rule-Writeback: none\nRule-Writeback-Reason: 只是一个功能实现，不需要更新长期规则"
  });
  assert.ok(missing.errors.some(error => error.includes("长期规则")));

  const accepted = checkRuleWriteback({
    paths: ["functions/api/platform/v1/example.js", "docs/platform/api-catalog.md"],
    body: [
      "Rule-Writeback: docs/platform/api-catalog.md",
      "Rule-Writeback-Reason: 共享 API 契约已同步到平台目录"
    ].join("\n")
  });
  assert.deepEqual(accepted.errors, []);
});

test("every pull request declares rule write-back and only names changed durable files", () => {
  assert.ok(checkRuleWriteback({
    paths: ["src/features/handbook/HandbookPage.jsx"],
    body: ""
  }).errors.some(error => error.includes("Rule-Writeback")));

  assert.ok(checkRuleWriteback({
    paths: ["src/features/handbook/HandbookPage.jsx"],
    body: "Rule-Writeback: docs/platform/api-catalog.md\nRule-Writeback-Reason: 已更新目录"
  }).errors.some(error => error.includes("未在本 PR 变更")));

  assert.deepEqual(checkRuleWriteback({
    paths: ["src/features/handbook/HandbookPage.jsx"],
    body: "Rule-Writeback: none\nRule-Writeback-Reason: 仅调整现有手册布局，没有改变共享契约"
  }).errors, []);
});
