import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const runtimeRoot = join(root, "functions/api");
const providerConfig = "functions/api/platform/v1/ai/_shared/provider-config.js";
const lowLevelAdapterConsumers = new Set([
  "functions/api/platform/_shared/platformConnectionTesters.js"
]);

function runtimeFiles(directory = runtimeRoot) {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "_generated" ? [] : runtimeFiles(path);
    return path.endsWith(".js") ? [path] : [];
  });
}

test("business routes cannot own model Provider endpoints, secrets, or low-level adapters", () => {
  const violations = [];
  for (const path of runtimeFiles()) {
    const file = relative(root, path).replaceAll("\\", "/");
    const source = readFileSync(path, "utf8");
    if (file !== providerConfig && /(?:api\.openai\.com|lingsuan\.top|OPENAI_API_KEY|OPENAI_MODEL|LINGSUAN_API_KEY|LINGSUAN_ACTOR_AUTHORIZATION)/.test(source)) {
      violations.push(`${file}: Provider 地址或 Secret 只能由统一配置解析`);
    }
    if (!file.startsWith("functions/api/platform/v1/ai/_shared/") && !lowLevelAdapterConsumers.has(file) && /ai\/_shared\/(?:responses-adapter|http|provider-config)/.test(source)) {
      violations.push(`${file}: 业务路由不能导入低层 Provider 适配器`);
    }
    if (!file.startsWith("functions/api/platform/v1/ai/_shared/") && /fetch\s*\([^)]*(?:responses|chat\/completions)/s.test(source)) {
      violations.push(`${file}: 业务路由不能直接请求模型协议`);
    }
  }
  assert.deepEqual(violations, []);
});

test("ecommerce review is registered and invokes the governed feature gateway", () => {
  const review = readFileSync(join(root, "functions/api/ecommerce-operations/ai-review.js"), "utf8");
  const registry = readFileSync(join(root, "functions/api/platform/v1/ai/_shared/feature-registry.js"), "utf8");
  assert.match(review, /invokeAiFeature/);
  assert.match(review, /appId:\s*"ecommerce-operations"/);
  assert.match(review, /featureId:\s*"plan-review"/);
  assert.doesNotMatch(review, /fetch\s*\(|OPENAI|api\.openai\.com|lingsuan\.top/);
  assert.match(registry, /appId:\s*"ecommerce-operations"[\s\S]*featureId:\s*"plan-review"/);
});

test("governance CI and durable agent rules enforce the Provider boundary", () => {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
  assert.match(pkg.scripts["check:governance"], /ai-provider-boundary\.test\.mjs/);
  assert.match(agents, /invokeAiFeature/);
  assert.match(agents, /AI_FEATURE_NOT_REGISTERED/);
  assert.match(agents, /业务 App.*不得.*Provider/);
});
