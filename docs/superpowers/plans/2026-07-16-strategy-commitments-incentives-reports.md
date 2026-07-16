# Strategy Commitments, Incentives, and Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add enforceable company strategy outcomes, approved department commitments, department-funded incentive projects, and manually authored monthly department reports to the strategy execution platform.

**Architecture:** Keep the existing platform state boundary and add focused governance collections plus pure domain transition functions. Expose the three business modules as separate React workspaces, then aggregate their facts in the existing company cockpit and unified personal todo projection.

**Tech Stack:** React 19, Vite 7, Node test runner, existing reducer-based shared platform state, existing DingTalk todo sync boundary.

## Global Constraints

- A company strategy is attained only after every required result is completed and verified.
- Department work contains annual or quarterly commitments plus monthly milestones, not daily task management.
- Department heads may start incentive projects within their department reward budget; over-budget and cross-department projects require escalation.
- Final incentive awards are decided by the department head and require a recorded reason.
- Monthly reports are manually written, may be returned, and become immutable after the monthly meeting; corrections are append-only.
- Existing projects and monthly snapshots remain compatible and are not silently converted.
- Existing DingTalk safety rules remain: explicit assignee unionId, known saved DingTalk task ID, no title matching, and no import of private tasks.

---

### Task 1: Governance domain and normalized state

**Files:**
- Create: `src/domain/executionGovernance.js`
- Modify: `src/domain/strategyExecution.js`
- Test: `react-tests/execution-governance.test.mjs`
- Test: `react-tests/strategy-execution.test.mjs`

**Interfaces:**
- Produces: `strategyAttainment(state, strategyId)`, `transitionDepartmentCommitment(commitment, action)`, `incentiveBudgetCheck(state, project)`, `settleIncentiveProject(project, award)`, `transitionMonthlyReport(report, action)`, and `ensureMonthlyReports(state, month, departments)`.
- Adds platform collections: `requiredResults`, `departmentCommitments`, `commitmentMilestones`, `incentiveProjects`, `departmentRewardBudgets`, `monthlyReports`, and `reportCorrections`.

- [ ] **Step 1: Write failing domain tests**

```js
test("strategy attainment requires every result to be verified", () => {
  const state = normalizePlatformState({
    strategies: [{ id: "s1" }],
    requiredResults: [
      { id: "r1", strategyId: "s1", status: "verified" },
      { id: "r2", strategyId: "s1", status: "completed" }
    ]
  });
  assert.equal(strategyAttainment(state, "s1").attained, false);
  state.requiredResults[1].status = "verified";
  assert.equal(strategyAttainment(state, "s1").attained, true);
});

test("frozen reports reject overwrite and accept append-only corrections", () => {
  const report = { id: "mr1", status: "frozen", corrections: [] };
  assert.throws(() => transitionMonthlyReport(report, { type: "edit" }), /冻结/);
  const next = transitionMonthlyReport(report, { type: "append_correction", text: "更正数据口径", actor: "周荣庆" });
  assert.equal(next.corrections.length, 1);
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test react-tests/execution-governance.test.mjs react-tests/strategy-execution.test.mjs`

Expected: FAIL because the governance module and collections do not exist.

- [ ] **Step 3: Implement pure rules and state collections**

```js
export function strategyAttainment(state, strategyId) {
  const results = state.requiredResults.filter(item => item.strategyId === strategyId && !item.archived);
  return {
    attained: results.length >= 2 && results.every(item => item.status === "verified"),
    completed: results.filter(item => item.status === "verified").length,
    total: results.length,
    results
  };
}

export function settleIncentiveProject(project, { amount, reason, decidedBy, decidedAt }) {
  const award = Number(amount);
  if (!reason?.trim()) throw new Error("请填写奖金决定理由。");
  if (award < 0 || award > Number(project.rewardCap || 0)) throw new Error("最终奖金不能超过项目奖金上限。");
  return { ...project, status: "closed", finalReward: award, rewardReason: reason.trim(), rewardDecidedBy: decidedBy, rewardDecidedAt: decidedAt, payoutStatus: award ? "pending" : "not_applicable" };
}
```

- [ ] **Step 4: Seed the three real company strategies without deleting legacy linked records**

Use stable IDs `strategy-organization-2026`, `strategy-bird-gmv-2026`, and `strategy-hamster-brand-2026`; link the existing hamster demo project to the hamster strategy.

- [ ] **Step 5: Run focused tests**

Run: `node --test react-tests/execution-governance.test.mjs react-tests/strategy-execution.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/executionGovernance.js src/domain/strategyExecution.js react-tests/execution-governance.test.mjs react-tests/strategy-execution.test.mjs
git commit -m "feat(strategy): add execution governance domain"
```

### Task 2: Audited platform actions and todo projection

**Files:**
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/domain/personalTodos.js`
- Modify: `src/state/PlatformProvider.jsx`
- Modify: `functions/api/platform.js`
- Test: `react-tests/execution-governance.test.mjs`
- Test: `react-tests/personal-todos.test.mjs`
- Test: `tests/platform-api.test.mjs`

**Interfaces:**
- Consumes Task 1 governance transition functions.
- Produces provider commands `saveRequiredResult`, `saveDepartmentCommitment`, `transitionCommitment`, `saveCommitmentMilestone`, `saveIncentiveProject`, `settleIncentive`, `saveMonthlyReport`, `transitionReport`, and `appendReportCorrection`.

- [ ] **Step 1: Write failing reducer and todo tests**

```js
test("department commitment approval is audited", () => {
  const next = reducePlatformState(normalizePlatformState({ departmentCommitments: [{ id: "c1", status: "office_review" }] }), {
    type: "transition_department_commitment",
    id: "c1",
    transition: "office_approve",
    actor: "总经办"
  });
  assert.equal(next.departmentCommitments[0].status, "executive_review");
  assert.equal(next.auditLogs[0].entityType, "department_commitment");
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run: `node --test react-tests/execution-governance.test.mjs react-tests/personal-todos.test.mjs tests/platform-api.test.mjs`

Expected: FAIL because audited transitions and projections are missing.

- [ ] **Step 3: Add audited actions and persistence collections**

Add every new collection to API `COLLECTION_KEYS`, and route reducer actions through the pure transition functions. Every transition records actor, action, entity type, entity ID, reason, and timestamp.

- [ ] **Step 4: Extend personal todo candidates**

Create explicit todos for commitment review/return, assigned monthly milestones, incentive responsibilities/settlement/payout, and report submit/review/freeze. Keep `sourceType` values stable: `commitment`, `commitment_milestone`, `incentive_project`, `monthly_report`, and `reward_payout`.

- [ ] **Step 5: Add provider commands**

```js
const transitionReport = useCallback((id, transition, reason = "") => {
  dispatch({ type: "transition_monthly_report", id, transition, reason });
}, [dispatch]);
```

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test react-tests/execution-governance.test.mjs react-tests/personal-todos.test.mjs tests/platform-api.test.mjs`

Expected: PASS.

```bash
git add src/domain/strategyExecution.js src/domain/personalTodos.js src/state/PlatformProvider.jsx functions/api/platform.js react-tests/execution-governance.test.mjs react-tests/personal-todos.test.mjs tests/platform-api.test.mjs
git commit -m "feat(strategy): persist governed execution workflows"
```

### Task 3: Strategy and department commitment workspace

**Files:**
- Modify: `src/features/strategy/StrategyCenterPage.jsx`
- Create: `src/features/strategy/RequiredResultModal.jsx`
- Create: `src/features/strategy/DepartmentCommitmentModal.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/platform-ui.test.mjs`

**Interfaces:**
- Consumes platform state and provider commands from Task 2.
- Produces the four-level strategy drill-down and approval actions.

- [ ] **Step 1: Add failing UI structure tests**

```js
test("strategy center shows required results and department commitments", () => {
  const page = read("src/features/strategy/StrategyCenterPage.jsx");
  assert.match(page, /必达结果/);
  assert.match(page, /部门承诺/);
  assert.match(page, /月度节点/);
  assert.doesNotMatch(page, /综合完成率/);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test react-tests/platform-ui.test.mjs`

Expected: FAIL on the new labels.

- [ ] **Step 3: Build the strategy hierarchy**

Show three strategy cards. Each card displays verified required results as `n / total`, never a weighted percentage. Expand a strategy into required results, then linked department commitments and monthly milestones.

- [ ] **Step 4: Add forms and approval controls**

Required-result form enforces objective evidence fields. Department-commitment form enforces strategy, required result, department, owner, period, acceptance standard, and at least one monthly milestone. Render actions according to current status and role.

- [ ] **Step 5: Add responsive CSS and run tests**

Run: `node --test react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs && npm run build`

Expected: PASS and Vite exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/features/strategy/StrategyCenterPage.jsx src/features/strategy/RequiredResultModal.jsx src/features/strategy/DepartmentCommitmentModal.jsx src/styles.css react-tests/platform-ui.test.mjs
git commit -m "feat(strategy): add department commitment workspace"
```

### Task 4: Incentive project workspace

**Files:**
- Create: `src/features/incentives/IncentiveProjectsPage.jsx`
- Create: `src/features/incentives/IncentiveProjectModal.jsx`
- Create: `src/features/incentives/IncentiveSettlementModal.jsx`
- Modify: `src/App.jsx`
- Modify: `src/domain/permissions.js`
- Modify: `src/styles.css`
- Test: `react-tests/platform-ui.test.mjs`

**Interfaces:**
- Consumes incentive project and reward budget state plus provider commands from Task 2.
- Produces route `incentives` and filters by department, status, owner, and strategy linkage.

- [ ] **Step 1: Add a failing navigation and page test**

```js
test("incentive workspace separates rewarded improvements from key projects", () => {
  assert.match(read("src/App.jsx"), /激励项目/);
  const page = read("src/features/incentives/IncentiveProjectsPage.jsx");
  assert.match(page, /部门奖金额度/);
  assert.match(page, /待结项/);
  assert.match(page, /待发放/);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `node --test react-tests/platform-ui.test.mjs`

Expected: FAIL because route and page are absent.

- [ ] **Step 3: Implement list, creation, and settlement**

The create modal validates budget and escalates over-budget or cross-department projects. The settlement modal requires actual effect, final reward, and decision reason. Finance actions only change payout status.

- [ ] **Step 4: Add navigation permission and responsive styles**

Add `incentives` to the company operation navigation group and default permission matrix without changing product lifecycle routes.

- [ ] **Step 5: Run tests, build, and commit**

Run: `node --test react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs && npm run build`

Expected: PASS and Vite exits 0.

```bash
git add src/features/incentives src/App.jsx src/domain/permissions.js src/styles.css react-tests/platform-ui.test.mjs
git commit -m "feat(incentives): add rewarded improvement projects"
```

### Task 5: Manual monthly department reports

**Files:**
- Create: `src/features/reviews/MonthlyReportModal.jsx`
- Create: `src/features/reviews/MonthlyReportCorrectionModal.jsx`
- Modify: `src/features/reviews/OperatingReviewPage.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/platform-ui.test.mjs`
- Test: `react-tests/execution-governance.test.mjs`

**Interfaces:**
- Consumes monthly report state and provider commands from Task 2.
- Produces manual authoring, submit/return/approve, meeting freeze, and append-only correction flows.

- [ ] **Step 1: Add failing report workflow tests**

```js
test("monthly reports are manually authored and frozen after the meeting", () => {
  const page = read("src/features/reviews/OperatingReviewPage.jsx");
  const modal = read("src/features/reviews/MonthlyReportModal.jsx");
  assert.match(page, /部门月度汇报/);
  assert.match(page, /退回修改/);
  assert.match(page, /冻结月报/);
  assert.match(modal, /上月重点成果/);
  assert.match(modal, /本月重点工作/);
  assert.doesNotMatch(modal, /自动生成正文/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs`

Expected: FAIL because monthly report components are absent.

- [ ] **Step 3: Implement report authoring and workflow**

Render one report per active department and month. The report modal uses explicit text fields and optional relation selectors. Return requires a reason. Freeze requires an approved report and a meeting conclusion. Frozen reports render corrections separately from the immutable original.

- [ ] **Step 4: Run tests, build, and commit**

Run: `node --test react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs && npm run build`

Expected: PASS and Vite exits 0.

```bash
git add src/features/reviews/OperatingReviewPage.jsx src/features/reviews/MonthlyReportModal.jsx src/features/reviews/MonthlyReportCorrectionModal.jsx src/styles.css react-tests/platform-ui.test.mjs react-tests/execution-governance.test.mjs
git commit -m "feat(reports): add governed monthly department reports"
```

### Task 6: Cockpit, todo routes, migration, and final verification

**Files:**
- Modify: `src/features/company/CompanyHomePage.jsx`
- Modify: `src/features/company/PersonalTodoWorkbench.jsx`
- Modify: `src/domain/personalTodos.js`
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/styles.css`
- Test: `react-tests/platform-ui.test.mjs`
- Test: `react-tests/personal-todos.test.mjs`
- Test: `react-tests/strategy-execution.test.mjs`

**Interfaces:**
- Consumes all prior task state and routes.
- Produces executive summaries for attainment, department coverage, incentive budgets, report submission, and direct deep links from personal todos.

- [ ] **Step 1: Add failing cockpit tests**

```js
test("cockpit summarizes strategic attainment incentives and reports", () => {
  const home = read("src/features/company/CompanyHomePage.jsx");
  assert.match(home, /必达结果/);
  assert.match(home, /部门承接/);
  assert.match(home, /激励项目/);
  assert.match(home, /月报提交/);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `node --test react-tests/platform-ui.test.mjs react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs`

Expected: FAIL on the new cockpit and todo routing assertions.

- [ ] **Step 3: Implement summaries, deep links, and safe migration**

Add a department coverage matrix, required-result counts, incentive reward totals, and report submission strip. Route new todo source types to `strategy`, `incentives`, or `reviews`. Preserve legacy objectives, projects, and monthly snapshots; do not fabricate historical reports.

- [ ] **Step 4: Run feature tests**

Run: `node --test react-tests/execution-governance.test.mjs react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs react-tests/platform-provider.test.mjs react-tests/platform-ui.test.mjs tests/platform-api.test.mjs tests/dingtalk-todo-list.test.mjs tests/dingtalk-todo-update.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run full verification**

Run: `npm test && npm run build`

Expected: all tests pass and Vite exits 0. A chunk-size warning is acceptable; errors are not.

- [ ] **Step 6: Perform browser QA**

Verify desktop and 390 px mobile layouts, no horizontal overflow, strategy drill-down, commitment approval, incentive settlement, report return/freeze/correction, cockpit summaries, and personal todo deep links. Do not execute real DingTalk writes during visual QA.

- [ ] **Step 7: Commit**

```bash
git add src/features/company/CompanyHomePage.jsx src/features/company/PersonalTodoWorkbench.jsx src/domain/personalTodos.js src/domain/strategyExecution.js src/styles.css react-tests/platform-ui.test.mjs react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs
git commit -m "feat(company): integrate governed execution cockpit"
```

