import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

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

test("governance checker accepts the repository and rejects incomplete feature docs", async () => {
  const { checkProjectGovernance, REQUIRED_REPOSITORY_FILES } = await import("../scripts/check-project-governance.mjs");
  assert.deepEqual(checkProjectGovernance(root).errors, []);

  const fixture = resolve(root, ".tmp-governance-fixture");
  try {
    for (const file of REQUIRED_REPOSITORY_FILES) {
      mkdirSync(dirname(resolve(fixture, file)), { recursive: true });
      writeFileSync(resolve(fixture, file), "# Fixture\n");
    }
    mkdirSync(resolve(fixture, "docs/features/sample"), { recursive: true });
    writeFileSync(resolve(fixture, "docs/features/sample/prd.md"), "# Sample\n");
    const result = checkProjectGovernance(fixture);
    assert.ok(result.errors.some(error => error.includes("docs/features/sample/design.md")));
    assert.ok(result.errors.some(error => error.includes("docs/features/sample/plan.md")));
    assert.ok(result.errors.some(error => error.includes("docs/features/sample/tasks.md")));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});

test("package exposes the repository lint gate", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.lint, "eslint src functions server scripts tests react-tests");
  assert.ok(pkg.devDependencies.eslint);
  assert.match(read("eslint.config.js"), /\.worktrees/);
  assert.match(read("eslint.config.js"), /no-unreachable/);
});

test("pull requests run required repository quality gates", () => {
  const workflow = read(".github/workflows/quality.yml");
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm run check:governance/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(read(".github/pull_request_template.md"), /PRD/);
  assert.match(read(".github/CODEOWNERS"), /AGENTS\.md/);
  assert.match(read(".github/BRANCH_PROTECTION.md"), /Require branches to be up to date/);
});
