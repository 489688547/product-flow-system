import assert from "node:assert/strict";
import test from "node:test";
import {
  checkIntegrationImpact,
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

test("router keeps ambiguous candidates instead of silently choosing one", () => {
  const registry = loadIntegrationRegistry(rootDir);
  const result = matchIntegrationPlatforms(registry, {
    text: "检查开放平台商品能力",
    paths: []
  });

  assert.ok(result.direct.length > 1);
  assert.equal(result.ambiguous, true);
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
