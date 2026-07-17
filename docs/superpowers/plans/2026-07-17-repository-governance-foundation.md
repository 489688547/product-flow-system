# Repository Governance Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make repository rules, documentation requirements, quality checks, and pull-request governance enforceable and shared by every development branch.

**Architecture:** Keep durable rules in version-controlled repository files and verify them with one deterministic Node governance checker. Run governance, lint, tests, and production build in GitHub Actions; document the one repository-settings step that cannot be enforced from source alone. This plan establishes the content and governance foundation consumed by the later in-app handbook plan.

**Tech Stack:** JavaScript ES modules, Node 22 test runner, ESLint 9 flat config, npm, GitHub Actions, Markdown, existing Vite 7 and React 19 project.

## Global Constraints

- All repository changes preserve the existing local/Cloudflare/DingTalk runtime boundaries.
- `AGENTS.md` is the repository contract; project Skills may reference it but must not duplicate changing business facts.
- Existing uncommitted changes in `react-tests/react-app.test.mjs` and `.worktrees/` are out of scope and must not be staged or overwritten.
- Existing `AGENTS.md` content is preserved and expanded in place.
- No branch-protection setting is changed remotely without explicit confirmation and authenticated GitHub access.
- New governance checks must run offline and produce concise Chinese failure messages.
- CI uses `npm ci`, `npm run lint`, `npm run check:governance`, `npm test`, and `npm run build`.
- Source files remain JavaScript/JSX; do not introduce a TypeScript migration.

---

### Task 1: Repository contract and documentation templates

**Files:**
- Modify: `AGENTS.md`
- Create: `docs/templates/prd.md`
- Create: `docs/templates/design.md`
- Create: `docs/templates/plan.md`
- Create: `docs/templates/tasks.md`
- Create: `docs/templates/adr.md`
- Create: `docs/templates/api-contract.md`
- Create: `react-tests/governance-foundation.test.mjs`

**Interfaces:**
- Consumes: Approved design at `docs/superpowers/specs/2026-07-17-platform-handbook-design.md`.
- Produces: Stable repository instructions and six reusable document templates required by later governance checks.

- [x] **Step 1: Write failing repository-contract tests**

Create `react-tests/governance-foundation.test.mjs` with assertions that:

```js
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
```

- [x] **Step 2: Run the test and verify missing-template failures**

Run: `node --test react-tests/governance-foundation.test.mjs`

Expected: FAIL because `docs/templates/prd.md` does not exist and `AGENTS.md` lacks the required sections.

- [x] **Step 3: Expand `AGENTS.md` into the repository contract**

Preserve the imported heading and add exact sections covering:

```markdown
## Architecture boundaries

- `src/domain`: pure business rules; no React, browser globals, or network requests.
- `src/ui`: business-neutral reusable UI components.
- `src/features`: page and feature composition; reuse domain, state, and UI boundaries.
- `src/state`: application orchestration and API clients; no visual component definitions.
- `functions/api`: authenticated server routes and provider adapters; reuse shared middleware.
- `docs`: product, design, platform, feature, and decision sources of truth.

Dependency direction: `features -> ui/domain/state`, `state -> API clients`, `functions/api routes -> shared middleware/provider adapters`. Features must not call DingTalk, Kuaimai, ERP, or other external systems directly.

## Feature workflow

Medium or larger work requires `docs/features/<feature>/prd.md`, `design.md`, `plan.md`, and `tasks.md`. Write or update failing tests before implementation, make one coherent change at a time, and update durable product/design/platform documentation when rules change.

## Definition of done

Run `npm run lint`, `npm run check:governance`, `npm test`, and `npm run build`. UI work also requires keyboard, laptop-width, responsive, and DingTalk WebView review. Local preview, Cloudflare deployment, and DingTalk acceptance are separate verification boundaries.
```

Also document: no direct pushes as the intended GitHub policy, no secrets in docs, API contract/version requirements, data migration/rollback requirements, and the rule that existing user changes are never overwritten.

- [x] **Step 4: Create the six concrete templates**

Each template must contain actionable Chinese headings and no unfinished-marker words:

- `prd.md`: status, background, goal, non-goals, users/permissions, current flow, target flow, business rules, data definitions, edge cases, acceptance criteria, rollout/rollback.
- `design.md`: user task, information hierarchy, layout, interaction flow, component reuse, new components, loading/empty/error/no-permission/disabled/success states, responsive, DingTalk WebView, copy, accessibility, visual acceptance.
- `plan.md`: architecture, files, interfaces, migrations, risk, rollback, verification, task order.
- `tasks.md`: dependency-ordered checkboxes with exact verification and commit boundary fields.
- `adr.md`: status, context, decision, alternatives, consequences, compatibility, superseded decisions.
- `api-contract.md`: owner, consumers, method/path/version, auth/permissions, request, response, error codes, idempotency, pagination, timeout/retry/rate limit, observability, compatibility/deprecation, contract tests.

- [x] **Step 5: Run the repository-contract test**

Run: `node --test react-tests/governance-foundation.test.mjs`

Expected: 2 tests pass, 0 fail.

- [x] **Step 6: Commit repository rules and templates**

```bash
git add AGENTS.md docs/templates react-tests/governance-foundation.test.mjs
git commit -m "docs: establish repository governance contract"
```

### Task 2: Product, handbook, and platform source documents

**Files:**
- Create: `docs/handbook/getting-started.md`
- Create: `docs/handbook/company-platform.md`
- Create: `docs/handbook/product-lifecycle.md`
- Create: `docs/handbook/faq.md`
- Create: `docs/product/core-workflows.md`
- Create: `docs/product/roles-and-permissions.md`
- Create: `docs/product/data-definitions.md`
- Create: `docs/platform/architecture.md`
- Create: `docs/platform/components.md`
- Create: `docs/platform/middleware.md`
- Create: `docs/platform/api-catalog.md`
- Create: `docs/platform/integrations.md`
- Create: `docs/platform/error-codes.md`
- Modify: `react-tests/governance-foundation.test.mjs`

**Interfaces:**
- Consumes: Existing `PRODUCT.md`, `DESIGN.md`, `src/App.jsx`, `src/domain/permissions.js`, `src/ui`, `functions/api`, and the approved design.
- Produces: Versioned Markdown sources that the later handbook UI imports explicitly.

- [x] **Step 1: Add failing source-document assertions**

Extend the governance test with:

```js
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
```

- [x] **Step 2: Run the focused test and verify missing-document failures**

Run: `node --test react-tests/governance-foundation.test.mjs`

Expected: FAIL in `handbook, product, and platform source documents are present`.

- [x] **Step 3: Write the four employee handbook documents**

Use clear employee-facing language:

- `getting-started.md`: what the platform is, login behavior, left navigation, account/organization identity, where to report a problem.
- `company-platform.md`: company home, strategy, key projects, department incentives, operating reviews, business Apps; explain that visible scope follows organization permissions.
- `product-lifecycle.md`: dashboard, demand pool, planning, progress, archive; explain demand-to-product entry and current-stage task behavior.
- `faq.md`: missing navigation, stale data, no edit permission, DingTalk login, failed save, external integration delay, and issue reporting.

Each file begins with one H1 and a short summary paragraph; avoid internal implementation jargon.

- [x] **Step 4: Write the three durable product documents**

- `core-workflows.md`: demand collection -> review/discussion -> planning -> development stages -> launch -> archive/review, including stage gates and deliverables.
- `roles-and-permissions.md`: 总经办, 产品部, operations/brand/supply chain/customer service/finance responsibilities, navigation visibility, view/edit distinction.
- `data-definitions.md`: demand, product, product manager, stage, task, deliverable, expected launch month, sales reporting time dimension, and the default exclusion of `其它` from normal channel analysis.

- [x] **Step 5: Write the six platform documents from current code**

- `architecture.md`: current React/domain/state/Cloudflare Functions/D1/external-provider flow and dependency direction.
- `components.md`: inventory `Button`, `IconAction`, `Modal`, `ConfirmDialog`, `DataTable`, `HeaderFilter`, `DatePickerField`, `ProductPicker`, `OrgSelect`, and `RichTextEditor`; record states and reuse rules.
- `middleware.md`: inventory `functions/api/_middleware.js`, auth/session shared code, DingTalk shared adapter, Kuaimai shared adapter, and expected cross-cutting responsibilities.
- `api-catalog.md`: record current `/api/state`, `/api/platform`, `/api/sales`, `/api/kuaimai/*`, `/api/auth/*`, and `/api/dingtalk/*` families as internal interfaces; reserve `/api/platform/v1/*` for future multi-system contracts.
- `integrations.md`: DingTalk, Kuaimai, ERP/sales imports, Cloudflare Pages/D1 boundaries and failure ownership.
- `error-codes.md`: define the common envelope `{ error: { code, message, requestId, retryable } }`, code prefixes `AUTH_`, `PERMISSION_`, `VALIDATION_`, `STATE_`, `DINGTALK_`, `KUAIMAI_`, `INTERNAL_`, and the rule that existing endpoints migrate incrementally.

- [x] **Step 6: Run the focused governance test**

Run: `node --test react-tests/governance-foundation.test.mjs`

Expected: 3 tests pass, 0 fail.

- [x] **Step 7: Commit the documentation source foundation**

```bash
git add docs/handbook docs/product docs/platform react-tests/governance-foundation.test.mjs
git commit -m "docs: add handbook and platform sources"
```

### Task 3: Deterministic governance checker

**Files:**
- Create: `scripts/check-project-governance.mjs`
- Modify: `package.json`
- Modify: `react-tests/governance-foundation.test.mjs`

**Interfaces:**
- Consumes: Required repository contract and document paths from Tasks 1-2.
- Produces: `checkProjectGovernance(rootDir)` returning `{ errors: string[] }`; CLI exits 1 when errors exist and 0 otherwise; npm command `check:governance`.

- [x] **Step 1: Add failing checker tests**

Extend the test file:

```js
test("governance checker accepts the repository and rejects incomplete feature docs", async () => {
  const { checkProjectGovernance } = await import("../scripts/check-project-governance.mjs");
  assert.deepEqual(checkProjectGovernance(root).errors, []);

  const fixture = resolve(root, ".tmp-governance-fixture");
  const required = [
    "AGENTS.md", "PRODUCT.md", "DESIGN.md",
    "docs/templates/prd.md", "docs/templates/design.md", "docs/templates/plan.md",
    "docs/templates/tasks.md", "docs/templates/adr.md", "docs/templates/api-contract.md",
    "docs/platform/architecture.md", "docs/platform/components.md", "docs/platform/middleware.md",
    "docs/platform/api-catalog.md", "docs/platform/integrations.md", "docs/platform/error-codes.md"
  ];
  try {
    for (const file of required) {
      mkdirSync(dirname(resolve(fixture, file)), { recursive: true });
      writeFileSync(resolve(fixture, file), "# Fixture\n");
    }
    mkdirSync(resolve(fixture, "docs/features/sample"), { recursive: true });
    writeFileSync(resolve(fixture, "docs/features/sample/prd.md"), "# Sample\n");
    const result = checkProjectGovernance(fixture);
    assert.ok(result.errors.some(error => error.includes("docs/features/sample/design.md")));
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
```

Add `mkdirSync`, `writeFileSync`, and `rmSync` to the existing `node:fs` import, and add `dirname` to the existing `node:path` import.

- [x] **Step 2: Run the test and verify the missing-module failure**

Run: `node --test react-tests/governance-foundation.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/check-project-governance.mjs`.

- [x] **Step 3: Implement the offline governance checker**

Implement:

```js
export const REQUIRED_REPOSITORY_FILES = [
  "AGENTS.md",
  "PRODUCT.md",
  "DESIGN.md",
  "docs/templates/prd.md",
  "docs/templates/design.md",
  "docs/templates/plan.md",
  "docs/templates/tasks.md",
  "docs/templates/adr.md",
  "docs/templates/api-contract.md",
  "docs/platform/architecture.md",
  "docs/platform/components.md",
  "docs/platform/middleware.md",
  "docs/platform/api-catalog.md",
  "docs/platform/integrations.md",
  "docs/platform/error-codes.md"
];

export function checkProjectGovernance(rootDir) {
  const errors = [];
  // Verify required files.
  // For every direct child under docs/features, require prd.md, design.md,
  // plan.md, and tasks.md.
  // Reject document source files containing unfinished-marker words.
  return { errors };
}
```

The CLI path prints `治理检查通过。` on success. On failure it prints `治理检查失败：` followed by one `- <message>` line per error and sets `process.exitCode = 1`.

- [x] **Step 4: Add the npm command**

Add to `package.json` scripts:

```json
"check:governance": "node scripts/check-project-governance.mjs"
```

- [x] **Step 5: Run the focused test and CLI**

Run: `node --test react-tests/governance-foundation.test.mjs && npm run check:governance`

Expected: all focused tests pass, then output contains `治理检查通过。`.

- [x] **Step 6: Commit the governance checker**

```bash
git add scripts/check-project-governance.mjs package.json react-tests/governance-foundation.test.mjs
git commit -m "chore: enforce repository governance"
```

### Task 4: Baseline lint gate

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `react-tests/governance-foundation.test.mjs`

**Interfaces:**
- Consumes: JavaScript/JSX source tree.
- Produces: `npm run lint` covering `src`, `functions`, `server`, `scripts`, `tests`, and `react-tests` while ignoring generated assets, build output, and `.worktrees`.

- [x] **Step 1: Add failing lint-contract assertions**

```js
test("package exposes the repository lint gate", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts.lint, "eslint src functions server scripts tests react-tests");
  assert.ok(pkg.devDependencies.eslint);
  assert.match(read("eslint.config.js"), /\.worktrees/);
  assert.match(read("eslint.config.js"), /no-unreachable/);
});
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `node --test react-tests/governance-foundation.test.mjs`

Expected: FAIL because `pkg.scripts.lint` is absent.

- [x] **Step 3: Install ESLint and add a conservative flat config**

Run: `npm install --save-dev eslint@^9.0.0`

Create `eslint.config.js`:

```js
export default [
  {
    ignores: ["assets/**", "dist/**", ".worktrees/**", "node_modules/**"]
  },
  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      parserOptions: { ecmaFeatures: { jsx: true } }
    },
    rules: {
      "no-constant-binary-expression": "error",
      "no-dupe-keys": "error",
      "no-duplicate-case": "error",
      "no-self-assign": "error",
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "valid-typeof": "error"
    }
  }
];
```

Add `"lint": "eslint src functions server scripts tests react-tests"` to package scripts. This first gate intentionally targets syntax and high-confidence correctness defects; stricter style and unused-variable rules require a separate baseline cleanup.

- [x] **Step 4: Run lint and the contract test**

Run: `npm run lint && node --test react-tests/governance-foundation.test.mjs`

Expected: ESLint exits 0 and all governance tests pass.

- [x] **Step 5: Commit the lint gate**

```bash
git add eslint.config.js package.json package-lock.json react-tests/governance-foundation.test.mjs
git commit -m "chore: add baseline lint gate"
```

### Task 5: Pull-request and CI governance

**Files:**
- Create: `.github/workflows/quality.yml`
- Create: `.github/pull_request_template.md`
- Create: `.github/CODEOWNERS`
- Create: `.github/BRANCH_PROTECTION.md`
- Modify: `react-tests/governance-foundation.test.mjs`

**Interfaces:**
- Consumes: npm scripts from Tasks 3-4.
- Produces: GitHub Actions job `quality`, PR checklist, ownership review rules, and exact branch-protection configuration instructions.

- [x] **Step 1: Add failing CI-governance assertions**

```js
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
```

- [x] **Step 2: Run the focused test and verify missing-file failures**

Run: `node --test react-tests/governance-foundation.test.mjs`

Expected: FAIL because `.github/workflows/quality.yml` does not exist.

- [x] **Step 3: Create the GitHub Actions workflow**

Use Node 22 and npm cache:

```yaml
name: quality

on:
  pull_request:
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run check:governance
      - run: npm test
      - run: npm run build
```

- [x] **Step 4: Create PR, ownership, and branch-protection rules**

- PR template requires: purpose, linked PRD/design/ADR or explicit small-change exemption, screenshots for UI changes, test/build results, API/data compatibility, rollback, documentation update.
- `CODEOWNERS` assigns `AGENTS.md`, `.github/`, `docs/platform/`, `docs/templates/`, `functions/api/_middleware.js`, `functions/api/auth/`, and schema/migration files to `@489688547`, matching the configured origin owner.
- `BRANCH_PROTECTION.md` specifies: protect `main`, require PR, require `quality`, require branches up to date, dismiss stale approvals, block force pushes and deletions. Note that a repository administrator must enable these settings after authenticating GitHub.

- [x] **Step 5: Run focused governance tests and all local gates**

Run: `node --test react-tests/governance-foundation.test.mjs && npm run lint && npm run check:governance`

Expected: all commands exit 0.

- [x] **Step 6: Commit CI and PR governance**

```bash
git add .github react-tests/governance-foundation.test.mjs
git commit -m "ci: require repository quality gates"
```

### Task 6: Full phase-one verification

**Files:**
- Modify only if verification exposes a defect in files created by Tasks 1-5.

**Interfaces:**
- Consumes: All phase-one governance deliverables.
- Produces: Evidence that the current application still passes its complete local acceptance suite.

- [x] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: all React and API tests pass, 0 fail.

- [x] **Step 2: Run production build**

Run: `npm run build`

Expected: Vite build exits 0 and emits production assets.

- [x] **Step 3: Re-run the enforced gates exactly as CI will**

Run: `npm run lint && npm run check:governance && npm test && npm run build`

Expected: all commands exit 0.

- [x] **Step 4: Inspect the scoped diff and dirty worktree**

Run: `git status --short && git diff --check && git log -6 --oneline`

Expected: no whitespace errors; unrelated existing modifications remain unstaged and are not included in the task commits.

- [x] **Step 5: Record the external GitHub setting still required**

If `gh auth status` is not authenticated, do not change repository settings. Report that source-level governance is complete but GitHub branch protection must be enabled after authentication and explicit confirmation.
