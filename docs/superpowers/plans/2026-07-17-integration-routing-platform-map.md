# Integration Routing And Platform Map Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use superpowers:test-driven-development for every behavior change and superpowers:verification-before-completion before claiming completion.

**Goal:** Make external-platform knowledge executable across coding, pull requests, CI, authenticated internal documentation, and the in-app handbook.

**Architecture:** A public JSON integration registry is the single source for platform metadata and routing. Pure Node/domain functions validate and query it; CI compares changed paths with machine-readable PR declarations. A separate authenticated D1 overlay stores non-secret internal metadata and is merged with the public registry by a dedicated handbook feature.

**Tech Stack:** React 19, Vite 7, Cloudflare Pages Functions, D1, Node.js test runner, ESLint, GitHub Actions.

---

## Task 1: Public registry and executable router

**Files:**
- Create: `docs/platform/integration-registry.json`
- Create: `scripts/integration-registry.mjs`
- Create: `react-tests/integration-routing.test.mjs`

**Step 1: Write the failing tests**

Cover JSON loading, allowed public fields, unique IDs, legal lifecycle states, valid relations, integrating evidence, sensitive-pattern rejection, keyword matches, path matches, and one-hop relation expansion.

**Step 2: Run the focused test and confirm failure**

Run: `node --test react-tests/integration-routing.test.mjs`
Expected: FAIL because registry and router do not exist.

**Step 3: Implement the minimal registry and pure functions**

Export `loadIntegrationRegistry`, `validateIntegrationRegistry`, and `matchIntegrationPlatforms`. Add all approved initial platforms with verified official public documentation URLs and no internal metadata.

**Step 4: Run the focused test and confirm success**

Run: `node --test react-tests/integration-routing.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/platform/integration-registry.json scripts/integration-registry.mjs react-tests/integration-routing.test.mjs
git commit -m "feat(platform): add integration registry router"
```

## Task 2: Coding skill, AGENTS preflight, PR declaration, and CI

**Files:**
- Create: `.agents/skills/integration-router/SKILL.md`
- Create: `scripts/check-integration-impact.mjs`
- Modify: `react-tests/integration-routing.test.mjs`
- Modify: `scripts/check-project-governance.mjs`
- Modify: `AGENTS.md`
- Modify: `.github/pull_request_template.md`
- Modify: `.github/workflows/quality.yml`
- Modify: `package.json`
- Modify: `docs/features/integration-routing/tasks.md`

**Step 1: Extend tests for PR parsing and enforcement**

Cover correct declarations, missing declarations, unknown IDs, incomplete path coverage, `none` with and without a reason, and push events that only validate the registry.

**Step 2: Run the focused test and confirm failure**

Run: `node --test react-tests/integration-routing.test.mjs`
Expected: FAIL because impact parsing and checks do not exist.

**Step 3: Add the smallest governance implementation**

Implement pure PR parsing/checking in the registry module and a CLI wrapper that reads `GITHUB_EVENT_PATH`. Add `check:integrations`, wire it into `quality`, add the project skill to required files, and document the preflight and PR fields.

**Step 4: Run focused and governance checks**

Run: `node --test react-tests/integration-routing.test.mjs && npm run check:governance && npm run check:integrations`
Expected: PASS; local non-PR execution validates the registry and reports that PR declaration enforcement is skipped.

**Step 5: Commit**

```bash
git add .agents/skills/integration-router/SKILL.md scripts/check-integration-impact.mjs scripts/check-project-governance.mjs AGENTS.md .github/pull_request_template.md .github/workflows/quality.yml package.json react-tests/integration-routing.test.mjs docs/features/integration-routing/tasks.md
git commit -m "feat(ci): enforce integration impact declarations"
```

## Task 3: Authenticated internal platform profiles API

**Files:**
- Create: `functions/api/platform/v1/integrations.js`
- Create: `tests/integration-profiles-api.test.mjs`
- Modify: `package.json`
- Modify: `docs/features/integration-routing/tasks.md`

**Step 1: Write route contract tests**

Cover unauthenticated 401 via middleware-compatible session input, employee GET, non-admin PUT 403, admin UPSERT, allowed-field normalization, unknown/sensitive field rejection, invalid URL/date rejection, missing D1 501, and audit rows containing field names only.

**Step 2: Run the focused test and confirm failure**

Run: `node --test tests/integration-profiles-api.test.mjs`
Expected: FAIL because the route does not exist.

**Step 3: Implement route, validation, schema, and audit**

Use `GET` and `PUT`. Create `integration_private_profiles` and `integration_profile_audit` idempotently. Store the normalized profile JSON and audit only changed field names. Do not log field values.

**Step 4: Run focused API tests**

Run: `node --test tests/integration-profiles-api.test.mjs`
Expected: PASS.

**Step 5: Commit**

```bash
git add functions/api/platform/v1/integrations.js tests/integration-profiles-api.test.mjs package.json docs/features/integration-routing/tasks.md
git commit -m "feat(api): add internal integration profiles"
```

## Task 4: Integration domain and state client

**Files:**
- Create: `src/domain/integrations.js`
- Create: `src/state/integrationProfilesApi.js`
- Create: `react-tests/integrations-domain.test.mjs`

**Step 1: Write failing domain tests**

Cover public/private merge, search across platform/capability/problem terms, status filtering, counts, relation resolution, and 180-day stale detection.

**Step 2: Run and confirm failure**

Run: `node --test react-tests/integrations-domain.test.mjs`
Expected: FAIL because the domain module does not exist.

**Step 3: Implement pure domain functions and minimal API client**

Keep filtering and merge logic browser-independent. The state client performs credentialed GET/PUT and throws a normalized Chinese error.

**Step 4: Run focused tests and lint touched files**

Run: `node --test react-tests/integrations-domain.test.mjs && npx eslint src/domain/integrations.js src/state/integrationProfilesApi.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/domain/integrations.js src/state/integrationProfilesApi.js react-tests/integrations-domain.test.mjs
git commit -m "feat(platform): add integration map domain"
```

## Task 5: Handbook platform map and admin editor

**Files:**
- Create: `docs/platform/external-platform-map.md`
- Create: `src/features/handbook/IntegrationPlatformMap.jsx`
- Create: `src/features/handbook/integration-platform-map.css`
- Create: `react-tests/integration-platform-map.test.mjs`
- Modify: `src/features/handbook/HandbookPage.jsx`
- Modify: `src/App.jsx`
- Modify: `docs/features/integration-routing/tasks.md`

**Step 1: Write failing composition tests**

Assert the special handbook slug renders the platform map, authenticated user context is passed through, the public registry is imported, and the UI includes search, status filters, API degradation, edit permission, disabled saving, and empty states.

**Step 2: Run and confirm failure**

Run: `node --test react-tests/integration-platform-map.test.mjs`
Expected: FAIL because the component does not exist.

**Step 3: Implement the product UI**

Use the existing handbook shell. Render a dense list/detail layout, load internal profiles after public content is available, expose inline editing only to total-office users, and maintain keyboard/focus/responsive behavior.

**Step 4: Run focused tests and build**

Run: `node --test react-tests/integration-platform-map.test.mjs && npm run build`
Expected: PASS.

**Step 5: Commit**

```bash
git add docs/platform/external-platform-map.md src/features/handbook/IntegrationPlatformMap.jsx src/features/handbook/integration-platform-map.css src/features/handbook/HandbookPage.jsx src/App.jsx react-tests/integration-platform-map.test.mjs docs/features/integration-routing/tasks.md
git commit -m "feat(handbook): add external platform map"
```

## Task 6: Durable documentation, audit, and release verification

**Files:**
- Create: `docs/decisions/2026-07-17-integration-registry.md`
- Modify: `docs/platform/integrations.md`
- Modify: `docs/platform/api-catalog.md`
- Modify: `docs/platform/error-codes.md`
- Modify: `docs/features/integration-routing/tasks.md`

**Step 1: Update durable sources**

Document registry ownership, lifecycle policy, API contract, authorization, D1 tables, errors, security boundary, audit, staleness, migration, rollback, and the initial platform catalog.

**Step 2: Run automated verification**

Run:

```bash
npm run lint
npm run check:governance
npm run check:integrations
npm test
npm run build
```

Expected: every command exits 0.

**Step 3: Run visual verification**

Start the local app, open the handbook platform-map route, and inspect desktop and narrow viewport states. Verify hierarchy, spacing, focus, search/filter behavior, empty/error/disabled states, responsive layout, and DingTalk WebView-safe overflow.

**Step 4: Review the diff and task checklist**

Run: `git diff --check && git status --short`
Expected: no whitespace errors; only feature-related files are changed; all task checkboxes are complete.

**Step 5: Commit**

```bash
git add docs/decisions/2026-07-17-integration-registry.md docs/platform/integrations.md docs/platform/api-catalog.md docs/platform/error-codes.md docs/features/integration-routing/tasks.md
git commit -m "docs(platform): document integration governance"
```
