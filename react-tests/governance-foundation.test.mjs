import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(new URL("..", import.meta.url).pathname);
const read = path => readFileSync(resolve(root, path), "utf8");

test("repository contract defines architecture, workflow, and verification rules", () => {
  const agents = read("AGENTS.md");
  assert.match(agents, /## Architecture boundaries/);
  assert.match(agents, /## Feature workflow/);
  assert.match(agents, /## Definition of done/);
  assert.match(agents, /npm run check:governance/);
  assert.match(agents, /npm test/);
  assert.match(agents, /npm run build/);
});

test("repository provides complete feature and platform templates", () => {
  for (const file of ["prd.md", "design.md", "plan.md", "tasks.md", "adr.md", "api-contract.md"]) {
    assert.equal(existsSync(resolve(root, "docs/templates", file)), true, `${file} should exist`);
  }
  assert.match(read("docs/templates/prd.md"), /## 验收标准/);
  assert.match(read("docs/templates/design.md"), /## 页面状态/);
  assert.match(read("docs/templates/api-contract.md"), /## 兼容与废弃/);
});

test("handbook, product, and platform source documents are present", () => {
  const required = [
    "docs/handbook/getting-started.md",
    "docs/handbook/company-platform.md",
    "docs/handbook/product-lifecycle.md",
    "docs/handbook/faq.md",
    "docs/product/core-workflows.md",
    "docs/product/roles-and-permissions.md",
    "docs/product/data-definitions.md",
    "docs/platform/architecture.md",
    "docs/platform/components.md",
    "docs/platform/middleware.md",
    "docs/platform/api-catalog.md",
    "docs/platform/integrations.md",
    "docs/platform/error-codes.md"
  ];
  for (const file of required) assert.equal(existsSync(resolve(root, file)), true, `${file} should exist`);
  assert.match(read("docs/platform/architecture.md"), /src\/domain/);
  assert.match(read("docs/platform/api-catalog.md"), /\/api\/state/);
  assert.match(read("docs/handbook/getting-started.md"), /登录/);
});
