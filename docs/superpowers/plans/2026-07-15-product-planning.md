# 产品规划实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the React source and Cloudflare release repository, then ship a shared annual product planning timeline backed by the existing D1 company state.

**Architecture:** `/Users/roger/Documents/product-flow-system` becomes the only source and release repository. Product planning is an independent `productPlans` state slice with pure date/timeline helpers, provider CRUD actions, and a React feature page; it never mutates demand or product workflow state.

**Tech Stack:** React 19, Vite 7, Tailwind CSS 4, vanilla CSS design tokens, Node test runner, Cloudflare Pages Functions, D1.

## Global Constraints

- Everyone can view product planning; only `产品部` and `总经办` can edit.
- Historical department label `产品团队` normalizes to `产品部`.
- Dragging a demand into planning never changes demand status or initiates a product.
- A demand may have multiple independent planning records, including overlapping and cross-year ranges.
- The release repository remains compatible with the existing `/api/state` D1 row contract.
- Disabled actions expose an explicit hover reason.

---

### Task 1: Consolidate Source and Release Repositories

**Files:**
- Move into release repo: `src/**`, `vite.config.js`, React `index.html`, `package-lock.json`
- Create: `react-tests/*.test.mjs`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: passing React baseline (`98` tests).
- Produces: one repository that can run `npm run dev`, `npm test`, and `npm run build`.

- [ ] **Step 1: Record the current baseline**

Run: `cd /Users/roger/Documents/product-flow-system-react && npm test`

Expected: `98` tests pass.

- [ ] **Step 2: Copy source and React tests into the release repository**

Copy `src`, `vite.config.js`, `index.html`, and lockfile. Put React tests in `react-tests/` so they do not overwrite release API tests.

- [ ] **Step 3: Merge package scripts and dependencies**

Use these scripts:

```json
{
  "dev": "vite --host 127.0.0.1 --port 8132",
  "build": "vite build",
  "preview": "vite preview --host 127.0.0.1 --port 8133",
  "test:react": "node --test react-tests/*.test.mjs",
  "test:api": "node --test tests/dingtalk-api.test.mjs tests/dingtalk-org.test.mjs tests/dingtalk-org-routes.test.mjs tests/dingtalk-sync.test.mjs tests/dingtalk-todo-update.test.mjs tests/dingtalk-web-auth.test.mjs",
  "test": "npm run test:react && npm run test:api"
}
```

- [ ] **Step 4: Install and verify the merged repository**

Run: `npm install && npm run test:react && npm run build`

Expected: React tests pass and Vite creates `dist/`.

- [ ] **Step 5: Commit repository consolidation**

```bash
git add src react-tests vite.config.js index.html package.json package-lock.json .gitignore
git commit -m "build: consolidate React source and release repo"
```

### Task 2: Add Product Planning Domain and Shared State

**Files:**
- Create: `src/domain/productPlanning.js`
- Modify: `src/domain/productFlow.js`
- Modify: `src/domain/permissions.js`
- Modify: `src/state/stateModel.js`
- Modify: `src/state/ProductFlowProvider.jsx`
- Modify: `functions/api/state.js`
- Test: `react-tests/product-planning.test.mjs`
- Test: `react-tests/shared-state.test.mjs`
- Test: `tests/shared-state.test.mjs`

**Interfaces:**
- Produces: `normalizeProductPlans(value)`, `planIntersectsYear(plan, year)`, `timelineSegment(start, end, year)`, provider actions `addProductPlan`, `updateProductPlan`, `deleteProductPlan`.

- [ ] **Step 1: Write failing domain tests**

```js
test("planning records normalize and intersect displayed years", () => {
  const [plan] = normalizeProductPlans([{ id: "plan-1", demandId: "d1", developmentStart: "2026-12-15", developmentEnd: "2027-01-20", launchStart: "2027-02-01", launchEnd: "2027-02-10" }]);
  assert.equal(planIntersectsYear(plan, 2026), true);
  assert.equal(planIntersectsYear(plan, 2027), true);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test react-tests/product-planning.test.mjs`

Expected: FAIL because `productPlanning.js` does not exist.

- [ ] **Step 3: Implement pure planning helpers**

Normalize IDs, demand snapshots, ISO dates and audit metadata. Reject incomplete or reversed date ranges through `validateProductPlan(input)` returning `{ valid, reason }`.

- [ ] **Step 4: Add failing shared-state and permission tests**

Assert that old state receives `productPlans: []`, `产品团队` migrates to `产品部`, planning navigation is visible to all, and editing is limited to `产品部` and `总经办`.

- [ ] **Step 5: Integrate state and provider CRUD**

Add `productPlans` to `createDefaultState`, `normalizeClientState`, provider value, and backend required arrays. Provider actions must preserve all other state slices.

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test react-tests/product-planning.test.mjs react-tests/shared-state.test.mjs tests/shared-state.test.mjs`

Expected: all focused tests pass.

```bash
git add src/domain/productPlanning.js src/domain/productFlow.js src/domain/permissions.js src/state/stateModel.js src/state/ProductFlowProvider.jsx functions/api/state.js react-tests/product-planning.test.mjs react-tests/shared-state.test.mjs tests/shared-state.test.mjs
git commit -m "feat(planning): add shared annual plan state"
```

### Task 3: Build Product Planning Timeline

**Files:**
- Create: `src/features/planning/ProductPlanningPage.jsx`
- Create: `src/features/planning/PlanningDemandTray.jsx`
- Create: `src/features/planning/AnnualPlanningTimeline.jsx`
- Create: `src/features/planning/ProductPlanModal.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/react-app.test.mjs`

**Interfaces:**
- Consumes: product planning helpers and provider CRUD from Task 2, existing `DemandModal`, `Modal`, `Button`, `DatePickerField`.
- Produces: `#planning` route with demand tray and annual timeline.

- [ ] **Step 1: Write failing page wiring tests**

Assert navigation order `demands -> planning -> progress`, `CalendarRange` icon use, shared `DemandModal`, draggable demand items, a twelve-month timeline, two labelled bars, and read-only disabled reasons.

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test react-tests/react-app.test.mjs`

Expected: FAIL because the planning route and components are absent.

- [ ] **Step 3: Implement the page shell and demand tray**

Show year selector, “添加需求机会”, and compact thumbnail/name demand chips. Implement HTML drag data as `application/x-product-demand-id`; provide a keyboard/touch “安排” action.

- [ ] **Step 4: Implement timeline and plan modal**

Use a sticky product column and twelve equal month tracks. Render blue `开发` and green `上线` bars using `timelineSegment`. Drop opens `ProductPlanModal` with the target month prefilled; save validates four dates.

- [ ] **Step 5: Add editing, deletion and missing-demand state**

Click a bar to edit. Delete uses `window.confirm`. Missing demand records use `demandSnapshot` and show “来源需求已删除”.

- [ ] **Step 6: Add responsive and interaction styles**

Use fixed timeline geometry, horizontal overflow, sticky first column, visible focus rings, reduced-motion fallbacks, and tooltips for disabled edit actions.

- [ ] **Step 7: Run tests and commit**

Run: `npm run test:react`

Expected: all React tests pass.

```bash
git add src/features/planning src/App.jsx src/styles.css react-tests/react-app.test.mjs
git commit -m "feat(planning): add annual product timeline"
```

### Task 4: Verify and Publish from the Unified Repository

**Files:**
- Modify generated: `index.html`, `assets/**`
- Modify: `docs/superpowers/plans/2026-07-15-product-planning.md`

**Interfaces:**
- Consumes: complete merged source and tests.
- Produces: verified root static assets for the existing Cloudflare Pages deployment.

- [ ] **Step 1: Run full verification**

Run: `npm test && npm run build`

Expected: React and focused API tests pass; build exits `0`.

- [ ] **Step 2: Run local visual acceptance**

Start `npm run dev`. Verify `#planning` at 1440×900 and 1280×800: demand tray, drag/drop modal, cross-month bars, edit/delete, read-only behavior, and no text overlap.

- [ ] **Step 3: Sync built assets to repository root**

Replace root `index.html` and root `assets/` with `dist/index.html` and `dist/assets/` so the current Pages configuration continues to serve the React build.

- [ ] **Step 4: Run release API tests and inspect the diff**

Run: `npm run test:api && git diff --check && git status --short`

Expected: tests pass, no whitespace errors, only intended files changed.

- [ ] **Step 5: Commit release artifacts**

```bash
git add index.html assets docs/superpowers/plans/2026-07-15-product-planning.md
git commit -m "build: publish product planning assets"
```

Deployment is a separate external action: push only after local acceptance and explicit publication instruction.
