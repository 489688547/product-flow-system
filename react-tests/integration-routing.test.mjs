import assert from "node:assert/strict";
import test from "node:test";
import {
  loadIntegrationRegistry,
  matchIntegrationPlatforms,
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
