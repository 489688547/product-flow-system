# 公司战略平台第一阶段实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the company platform shell, normalized strategy domain, shared persistence, audit trail, and Product Lifecycle as a registered App.

**Architecture:** Keep the existing React and Cloudflare stack. Add a separate platform context and `/api/platform` persistence boundary so strategy data does not expand the legacy product-state JSON. Use pure domain normalization and reducers so browser and API behavior are testable without rendering React.

**Tech Stack:** React 19, Vite 7, Cloudflare Pages Functions, D1, Node test runner.

## Global Constraints

- Preserve all existing product-flow routes and user changes.
- DingTalk workbench and standalone browser share the same identity and permissions.
- Product Lifecycle remains functional as the first registered business App.
- Every important mutation records actor, time, entity, action, and reason.
- Local preview may fall back to localStorage; production API failures must be visible.

---

### Task 1: Platform domain foundation

**Files:**
- Create: `src/domain/strategyExecution.js`
- Create: `react-tests/strategy-execution.test.mjs`

**Interfaces:**
- Produces: `createDefaultPlatformState()`, `normalizePlatformState(input)`, `reducePlatformState(state, action)`, `aggregateHealth(states)`, `buildExecutiveSummary(state, context)`.

- [ ] **Step 1: Write failing normalization and health tests**

```js
test("severe child health cannot be averaged away", () => {
  assert.equal(aggregateHealth(["normal", "off_track", "completed"]), "off_track");
});

test("platform state always contains every collection", () => {
  const state = normalizePlatformState({ strategies: [] });
  assert.ok(Array.isArray(state.projects));
  assert.ok(Array.isArray(state.auditLogs));
});
```

- [ ] **Step 2: Run the tests and verify failure**

Run: `node --test react-tests/strategy-execution.test.mjs`
Expected: FAIL because `src/domain/strategyExecution.js` does not exist.

- [ ] **Step 3: Implement normalized state, health aggregation, sample data, and audited reducer actions**

```js
export const PLATFORM_COLLECTIONS = ["strategies", "objectives", "metrics", "projects", "milestones", "risks", "decisionRequests", "statusUpdates", "monthlySnapshots", "appLinks", "appEvents", "appRegistry", "auditLogs"];

export function aggregateHealth(values = []) {
  if (values.includes("off_track")) return "off_track";
  if (values.includes("at_risk")) return "at_risk";
  if (values.length && values.every(value => value === "completed")) return "completed";
  return "normal";
}
```

- [ ] **Step 4: Run the focused tests**

Run: `node --test react-tests/strategy-execution.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit the domain foundation**

```bash
git add src/domain/strategyExecution.js react-tests/strategy-execution.test.mjs
git commit -m "feat(strategy): add platform domain"
```

### Task 2: Platform provider and persistence client

**Files:**
- Create: `src/state/platformApi.js`
- Create: `src/state/PlatformProvider.jsx`
- Modify: `src/main.jsx`
- Test: `react-tests/react-app.test.mjs`

**Interfaces:**
- Consumes: domain functions from Task 1.
- Produces: `usePlatform()`, `dispatchPlatform(action)`, and automatic local/API persistence.

- [ ] **Step 1: Add a failing source-structure test**

```js
assert.match(read("src/main.jsx"), /PlatformProvider/);
assert.match(read("src/state/PlatformProvider.jsx"), /\/api\/platform/);
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test react-tests/react-app.test.mjs`
Expected: FAIL because the provider is absent.

- [ ] **Step 3: Implement the provider**

```jsx
const value = useMemo(() => ({
  state,
  loading,
  error,
  dispatch: action => setState(current => reducePlatformState(current, { ...action, actor: currentUser?.name || "" }))
}), [state, loading, error, currentUser?.name]);
```

- [ ] **Step 4: Wrap App with PlatformProvider and run tests**

Run: `node --test react-tests/react-app.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit provider wiring**

```bash
git add src/state/platformApi.js src/state/PlatformProvider.jsx src/main.jsx react-tests/react-app.test.mjs
git commit -m "feat(platform): add shared state provider"
```

### Task 3: Structured D1 platform endpoint

**Files:**
- Create: `functions/api/platform.js`
- Create: `tests/platform-api.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: authenticated session from `functions/api/_middleware.js`.
- Produces: `GET /api/platform` and `POST /api/platform` with `{ synced, state, updatedAt }`.

- [ ] **Step 1: Write failing API tests**

```js
test("platform API requires D1", async () => {
  const response = await onRequest({ request: new Request("https://example.com/api/platform"), env: {} });
  assert.equal(response.status, 501);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test tests/platform-api.test.mjs`
Expected: FAIL because the endpoint is absent.

- [ ] **Step 3: Implement table creation and collection upserts**

```sql
CREATE TABLE IF NOT EXISTS platform_records (
  entity_type TEXT NOT NULL,
  id TEXT NOT NULL,
  payload TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  updated_by TEXT,
  PRIMARY KEY (entity_type, id)
)
```

Use one record per strategy, objective, metric, project, milestone, risk, decision, update, snapshot, App link, App event, App registration, or audit entry. Reject read-only writes and validate all collections.

- [ ] **Step 4: Add the API suite to `test:api` and run it**

Run: `npm run test:api`
Expected: PASS.

- [ ] **Step 5: Commit persistence endpoint**

```bash
git add functions/api/platform.js tests/platform-api.test.mjs package.json
git commit -m "feat(api): persist platform records"
```

### Task 4: Company shell and App registration

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/domain/permissions.js`
- Create: `src/features/platform/AppCenterPage.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/react-app.test.mjs`

**Interfaces:**
- Consumes: `state.appRegistry` from PlatformProvider.
- Produces: company navigation and a visible Product Lifecycle App entry.

- [ ] **Step 1: Write failing navigation tests**

```js
assert.match(read("src/App.jsx"), /公司首页/);
assert.match(read("src/App.jsx"), /战略中心/);
assert.match(read("src/App.jsx"), /重点项目/);
assert.match(read("src/features/platform/AppCenterPage.jsx"), /产品全周期/);
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test react-tests/react-app.test.mjs`
Expected: FAIL on missing company navigation.

- [ ] **Step 3: Add navigation, permissions, and App center**

Preserve the existing product pages under the Product Lifecycle App. Add keys `home`, `strategy`, `projects`, and `apps` to permission normalization.

- [ ] **Step 4: Run React tests and build**

Run: `npm run test:react && npm run build`
Expected: PASS and a successful Vite build.

- [ ] **Step 5: Commit the platform shell**

```bash
git add src/App.jsx src/domain/permissions.js src/features/platform/AppCenterPage.jsx src/styles.css react-tests/react-app.test.mjs
git commit -m "feat(platform): add company app shell"
```
