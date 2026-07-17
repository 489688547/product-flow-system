# 公司战略平台第四阶段实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add weekly confirmations, immutable monthly reviews, trends, data-freshness signals, and final end-to-end verification.

**Architecture:** Status updates and snapshots are append-only records. Trend selectors derive month-to-month changes from snapshots. App registry and freshness metadata make partial failures explicit without blocking unrelated modules.

**Tech Stack:** React 19, Recharts 3, Cloudflare D1, Node test runner.

## Global Constraints

- Weekly updates answer change, largest risk, and coordination/decision need.
- Monthly snapshots are immutable and retain management conclusions.
- Stale data never displays as healthy without a freshness warning.
- One App failure does not hide other strategy or project information.

---

### Task 1: Weekly updates and monthly snapshots

**Files:**
- Create: `src/features/reviews/OperatingReviewPage.jsx`
- Create: `src/features/reviews/StatusUpdateModal.jsx`
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/App.jsx`
- Create: `react-tests/operating-review.test.mjs`

**Interfaces:**
- Consumes: `append_status_update` and `create_monthly_snapshot` actions.
- Produces: current weekly confirmation queue and immutable month snapshots.

- [ ] **Step 1: Write failing append-only tests**

```js
const next = reducePlatformState(state, { type: "create_monthly_snapshot", record: snapshot });
assert.equal(next.monthlySnapshots[0].id, snapshot.id);
assert.throws(() => reducePlatformState(next, { type: "update_monthly_snapshot", record: snapshot }));
```

- [ ] **Step 2: Verify failure**

Run: `node --test react-tests/operating-review.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement update form, confirmation queue, and snapshot creation**

Snapshot records copy computed strategy, objective, metric, project, risk, and decision states plus owner explanation and management conclusion.

- [ ] **Step 4: Run focused tests**

Run: `node --test react-tests/operating-review.test.mjs react-tests/strategy-execution.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit operating reviews**

```bash
git add src/features/reviews src/domain/strategyExecution.js src/App.jsx react-tests/operating-review.test.mjs
git commit -m "feat(review): add operating cadence"
```

### Task 2: Trends, freshness, and App health

**Files:**
- Create: `src/features/company/StrategyTrendChart.jsx`
- Modify: `src/features/company/CompanyHomePage.jsx`
- Modify: `src/features/platform/AppCenterPage.jsx`
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/styles.css`
- Test: `react-tests/strategy-execution.test.mjs`

**Interfaces:**
- Produces: `buildMonthlyTrend(snapshots)` and `buildAppHealth(appRegistry, appEvents, today)`.

- [ ] **Step 1: Write failing trend and stale-source tests**

```js
assert.deepEqual(buildMonthlyTrend(snapshots).map(point => point.month), ["2026-06", "2026-07"]);
assert.equal(buildAppHealth(apps, events, "2026-07-16")[0].freshness, "stale");
```

- [ ] **Step 2: Verify failure**

Run: `node --test react-tests/strategy-execution.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement trend chart and source-health states**

Show month-over-month normal, risk, off-track, and completed counts. Display last sync, stale, failed, or healthy state for each App.

- [ ] **Step 4: Run tests and build**

Run: `npm run test:react && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit trend and health UI**

```bash
git add src/features/company/StrategyTrendChart.jsx src/features/company/CompanyHomePage.jsx src/features/platform/AppCenterPage.jsx src/domain/strategyExecution.js src/styles.css react-tests/strategy-execution.test.mjs
git commit -m "feat(dashboard): add strategy trends"
```

### Task 3: Full verification and release assets

**Files:**
- Modify only if verification exposes a defect.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: passing tests, production build, and generated Pages release assets.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`
Expected: all React and API tests pass.

- [ ] **Step 2: Build the production bundle**

Run: `npm run build`
Expected: Vite exits successfully without missing imports.

- [ ] **Step 3: Generate Cloudflare Pages assets**

Run: `npm run release:pages`
Expected: build succeeds and `cloudflare-entry.html` references the latest hashed assets.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check && git status --short`
Expected: no whitespace errors; unrelated pre-existing user changes remain preserved.

- [ ] **Step 5: Commit release assets only when they changed because of this feature**

```bash
git add cloudflare-entry.html assets
git commit -m "build: publish strategy platform"
```
