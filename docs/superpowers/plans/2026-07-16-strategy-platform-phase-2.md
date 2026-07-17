# 公司战略平台第二阶段实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the strategy, metric, key-project, risk, decision, and executive-dashboard workflow.

**Architecture:** UI pages dispatch audited actions to PlatformProvider. Pure selectors compute health and executive summaries with exception precedence; pages never invent a second reporting state.

**Tech Stack:** React 19, existing UI primitives, Lucide, Node test runner.

## Global Constraints

- A quarterly objective belongs to one annual strategy.
- Every objective has at least one metric or project.
- A key project links to a strategy or objective.
- Severe metric, milestone, or risk states cannot average to normal.
- Company summaries are visible by default; edits remain role and ownership scoped.

---

### Task 1: Strategy and metric management

**Files:**
- Create: `src/features/strategy/StrategyCenterPage.jsx`
- Create: `src/features/strategy/StrategyEditorModal.jsx`
- Create: `react-tests/strategy-ui.test.mjs`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: `dispatch({ type: "upsert_strategy" | "upsert_objective" | "upsert_metric", record })`.
- Produces: annual strategy tree with quarterly objectives and metrics.

- [ ] **Step 1: Write failing UI contract tests**

```js
assert.match(read("src/features/strategy/StrategyCenterPage.jsx"), /年度战略/);
assert.match(read("src/features/strategy/StrategyEditorModal.jsx"), /季度目标/);
assert.match(read("src/features/strategy/StrategyEditorModal.jsx"), /关键指标/);
```

- [ ] **Step 2: Verify failure**

Run: `node --test react-tests/strategy-ui.test.mjs`
Expected: FAIL because the pages do not exist.

- [ ] **Step 3: Implement create/edit/archive flows**

Use controlled form sections for strategy, objective, and metric. Validate owner, cycle, success standard, baseline, target, direction, thresholds, source, and frequency before dispatch.

- [ ] **Step 4: Run focused tests**

Run: `node --test react-tests/strategy-ui.test.mjs react-tests/strategy-execution.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit strategy management**

```bash
git add src/features/strategy react-tests/strategy-ui.test.mjs src/App.jsx
git commit -m "feat(strategy): add goal management"
```

### Task 2: Key projects, milestones, risks, and decisions

**Files:**
- Create: `src/features/projects/KeyProjectsPage.jsx`
- Create: `src/features/projects/ProjectEditorModal.jsx`
- Create: `src/features/projects/ProjectDetailModal.jsx`
- Create: `react-tests/key-projects-ui.test.mjs`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: audited `upsert_project`, `upsert_milestone`, `upsert_risk`, `upsert_decision`, and `resolve_decision` actions.
- Produces: filterable project portfolio and detail workflow.

- [ ] **Step 1: Write failing source and reducer tests**

```js
assert.match(read("src/features/projects/KeyProjectsPage.jsx"), /重点项目/);
assert.match(read("src/features/projects/ProjectDetailModal.jsx"), /待决策/);
```

- [ ] **Step 2: Verify failure**

Run: `node --test react-tests/key-projects-ui.test.mjs`
Expected: FAIL.

- [ ] **Step 3: Implement project list, editor, and detail actions**

Project creation requires name, goal, owner, department, dates, success standard, and a strategy/objective link. Detail supports milestone completion, risk actions, decision creation, and management resolution.

- [ ] **Step 4: Run focused tests**

Run: `node --test react-tests/key-projects-ui.test.mjs react-tests/strategy-execution.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit project execution**

```bash
git add src/features/projects react-tests/key-projects-ui.test.mjs src/App.jsx
git commit -m "feat(projects): add execution workflow"
```

### Task 3: Role-aware company home and executive cockpit

**Files:**
- Create: `src/features/company/CompanyHomePage.jsx`
- Create: `src/features/company/HealthBadge.jsx`
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/strategy-execution.test.mjs`

**Interfaces:**
- Consumes: `buildExecutiveSummary(state, { currentUser, productState, today })`.
- Produces: decision queue, severe risks, strategy map, project portfolio, personal work list.

- [ ] **Step 1: Add failing exception-precedence summary tests**

```js
const summary = buildExecutiveSummary(state, { today: "2026-07-16" });
assert.equal(summary.offTrackObjectives.length, 1);
assert.equal(summary.pendingDecisions[0].status, "pending");
```

- [ ] **Step 2: Verify failure**

Run: `node --test react-tests/strategy-execution.test.mjs`
Expected: FAIL on incomplete summary output.

- [ ] **Step 3: Implement selectors and role-aware page**

Executives see exception-first sections. Other users see owned objectives, projects, milestones, and product tasks. Every row links to the relevant strategy, project, or Product Lifecycle screen.

- [ ] **Step 4: Run tests and build**

Run: `npm run test:react && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit the cockpit**

```bash
git add src/features/company src/domain/strategyExecution.js src/App.jsx src/styles.css react-tests/strategy-execution.test.mjs
git commit -m "feat(dashboard): add executive cockpit"
```
