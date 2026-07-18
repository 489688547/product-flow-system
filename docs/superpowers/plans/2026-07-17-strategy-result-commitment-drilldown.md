# 战略必达结果下钻与部门任务进度实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让公司战略页可以从必达结果下钻到关联部门任务和月度里程碑，并用里程碑完成情况自动计算任务进度。

**Architecture:** 继续复用 `departmentCommitments` 与 `commitmentMilestones`，通过新增 `requiredResultId` 建立明确归属，不引入重复实体。领域层负责 v4 数据迁移、进度计算和归档完整性；页面层负责行内展开、里程碑切换和编辑器约束。

**Tech Stack:** React 18、原生 CSS、Node.js `node:test`、现有 reducer/PlatformProvider 状态架构。

## Global Constraints

- 功能只在 `codex/strategy-crud` 独立分支开发，不合并 `main`、不部署线上。
- 平台状态版本升级为精确值 `strategy-platform-v4`。
- 进度精确口径为“已完成且未归档里程碑数 ÷ 全部未归档里程碑数”，四舍五入取整；0/0 显示 0% 和“未设置里程碑”。
- `requiredResultId` 只能指向同一 `strategyId` 下未归档的必达结果。
- 保留现有审批、退回、风险、完成、归档和审计规则。

---

### Task 1: v4 数据迁移与进度领域函数

**Files:**
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/domain/executionGovernance.js`
- Modify: `src/state/PlatformProvider.jsx`
- Test: `react-tests/strategy-execution.test.mjs`
- Test: `react-tests/execution-governance.test.mjs`

**Interfaces:**
- Produces: `commitmentProgress(state, commitmentId) -> { completed, total, percent, label, milestones }`
- Produces: `migratePlatformState(input)` that returns v4 and maps the eight known seeded commitments.

- [ ] **Step 1: Write failing migration and progress tests**

```js
test("v3 commitments migrate to v4 required-result links without guessing custom records", () => {
  const migrated = migratePlatformState({
    version: "strategy-platform-v3",
    strategies: [], requiredResults: [], commitmentMilestones: [],
    departmentCommitments: [
      { id: "commitment-ops-data-2026", strategyId: "strategy-organization-2026" },
      { id: "custom", strategyId: "strategy-organization-2026" }
    ]
  });
  assert.equal(migrated.version, "strategy-platform-v4");
  assert.equal(migrated.departmentCommitments[0].requiredResultId, "result-org-data");
  assert.equal(migrated.departmentCommitments[1].requiredResultId, undefined);
});

test("commitment progress ignores archived milestones and rounds percent", () => {
  const progress = commitmentProgress(normalizePlatformState({ commitmentMilestones: [
    { id: "m1", commitmentId: "c1", status: "completed" },
    { id: "m2", commitmentId: "c1", status: "pending" },
    { id: "m3", commitmentId: "c1", status: "completed", archived: true }
  ] }), "c1");
  assert.deepEqual({ completed: progress.completed, total: progress.total, percent: progress.percent }, { completed: 1, total: 2, percent: 50 });
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test react-tests/strategy-execution.test.mjs react-tests/execution-governance.test.mjs`

Expected: FAIL because v3 remains v3 and `commitmentProgress` is not exported.

- [ ] **Step 3: Implement minimal v4 migration and progress calculation**

```js
const REQUIRED_RESULT_BY_COMMITMENT_ID = {
  "commitment-brand-organization-2026": "result-org-collaboration",
  "commitment-brand-concept-2026": "result-hamster-rank",
  "commitment-brand-ip-2026": "result-bird-playbook",
  "commitment-brand-performance-2026": "result-bird-playbook",
  "commitment-brand-offline-2026": "result-hamster-rank",
  "commitment-ops-data-2026": "result-org-data",
  "commitment-ops-bird-q3": "result-bird-gmv",
  "commitment-ops-channel-2026": "result-hamster-rank"
};

export function commitmentProgress(state, commitmentId) {
  const milestones = (state.commitmentMilestones || []).filter(item => item.commitmentId === commitmentId && !item.archived);
  const completed = milestones.filter(item => item.status === "completed").length;
  const total = milestones.length;
  return { completed, total, percent: total ? Math.round(completed / total * 100) : 0, label: total ? `${completed}/${total}` : "未设置里程碑", milestones };
}
```

Update local demo normalization and default state expectations to v4 without overwriting later user edits.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test react-tests/strategy-execution.test.mjs react-tests/execution-governance.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/strategyExecution.js src/domain/executionGovernance.js src/state/PlatformProvider.jsx react-tests/strategy-execution.test.mjs react-tests/execution-governance.test.mjs
git commit -m "feat(strategy): link commitments to results"
```

### Task 2: 部门任务编辑器关联约束

**Files:**
- Modify: `src/features/strategy/DepartmentCommitmentModal.jsx`
- Modify: `src/features/strategy/StrategyCenterPage.jsx`
- Test: `react-tests/platform-ui.test.mjs`

**Interfaces:**
- Consumes: department commitment field `requiredResultId` from Task 1.
- Produces: `DepartmentCommitmentModal` props `requiredResults` and optional `defaults`.

- [ ] **Step 1: Write failing UI contract tests**

```js
assert.match(commitmentModal, /requiredResultId/);
assert.match(commitmentModal, /关联必达结果/);
assert.match(commitmentModal, /filter\(item => item\.strategyId === form\.strategyId/);
assert.match(strategyPage, /requiredResults=\{state\.requiredResults/);
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test react-tests/platform-ui.test.mjs`

Expected: FAIL because the modal has no required-result field.

- [ ] **Step 3: Implement filtered required-result selection**

```jsx
const availableResults = requiredResults.filter(item => item.strategyId === form.strategyId && !item.archived);

<label>
  <span>关联必达结果 *</span>
  <select value={form.requiredResultId} onChange={event => setForm(current => ({ ...current, requiredResultId: event.target.value }))}>
    <option value="">请选择必达结果</option>
    {availableResults.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
  </select>
</label>
```

Initialize new records from `defaults.strategyId` and `defaults.requiredResultId`; clear the result when the strategy changes; validate that the selected result belongs to the selected strategy.

- [ ] **Step 4: Run test and verify GREEN**

Run: `node --test react-tests/platform-ui.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/strategy/DepartmentCommitmentModal.jsx src/features/strategy/StrategyCenterPage.jsx react-tests/platform-ui.test.mjs
git commit -m "feat(strategy): require result on department tasks"
```

### Task 3: 必达结果行内下钻与里程碑操作

**Files:**
- Modify: `src/features/strategy/StrategyCenterPage.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/governed-execution-ui.test.mjs`

**Interfaces:**
- Consumes: `commitmentProgress(state, commitmentId)` and `saveCommitmentMilestone(record, reason)`.
- Produces: accessible result trigger with `aria-expanded`, inline task progress and milestone checklist.

- [ ] **Step 1: Write failing source-contract tests**

```js
assert.match(strategyPage, /aria-expanded=\{expandedResultId === result\.id\}/);
assert.match(strategyPage, /role="progressbar"/);
assert.match(strategyPage, /commitmentProgress/);
assert.match(strategyPage, /saveCommitmentMilestone/);
assert.match(strategyPage, /添加部门任务/);
```

- [ ] **Step 2: Run test and verify RED**

Run: `node --test react-tests/governed-execution-ui.test.mjs`

Expected: FAIL because result rows are not expandable.

- [ ] **Step 3: Implement inline expansion**

```jsx
const [expandedResultId, setExpandedResultId] = useState(null);
const commitments = state.departmentCommitments.filter(item => item.requiredResultId === result.id && !item.archived);

<button type="button" aria-expanded={expandedResultId === result.id} onClick={() => setExpandedResultId(current => current === result.id ? null : result.id)}>
  {/* existing result summary, task count, chevron */}
</button>
```

Render task details, progressbar, next milestone, due date and milestone checkboxes. Permit toggles only for total-office users, commitment owners and milestone owners; call `saveCommitmentMilestone` with `completed` or `pending`. Add empty-state action that opens the modal with the current strategy/result defaults.

- [ ] **Step 4: Add responsive CSS and run UI test**

Run: `node --test react-tests/governed-execution-ui.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/features/strategy/StrategyCenterPage.jsx src/styles.css react-tests/governed-execution-ui.test.mjs
git commit -m "feat(strategy): drill into result execution"
```

### Task 4: 总表进度与归档完整性

**Files:**
- Modify: `src/features/strategy/StrategyCenterPage.jsx`
- Modify: `src/domain/strategyExecution.js`
- Test: `react-tests/strategy-execution.test.mjs`
- Test: `react-tests/platform-ui.test.mjs`

**Interfaces:**
- Consumes: `commitmentProgress` and `requiredResultId`.
- Produces: result/progress columns and a reducer error when active tasks still link to a result.

- [ ] **Step 1: Write failing dependency and table tests**

```js
assert.throws(() => reducePlatformState(normalizePlatformState({
  requiredResults: [{ id: "r1" }],
  departmentCommitments: [{ id: "c1", requiredResultId: "r1", archived: false }]
}), { type: "archive_required_result", id: "r1" }), /部门任务/);

assert.match(strategyPage, /待关联必达结果/);
assert.match(strategyPage, /任务进度/);
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --test react-tests/strategy-execution.test.mjs react-tests/platform-ui.test.mjs`

Expected: FAIL because archive is not blocked and the table lacks progress.

- [ ] **Step 3: Implement archive block and table columns**

```js
const linkedCommitments = state.departmentCommitments.filter(item => item.requiredResultId === action.id && !item.archived);
if (linkedCommitments.length) throw new Error("该必达结果仍有关联部门任务，请先迁移或归档部门任务");
```

Render the result title or `待关联必达结果`, plus the shared progressbar and completed/total count in the department-task table.

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --test react-tests/strategy-execution.test.mjs react-tests/platform-ui.test.mjs`

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/domain/strategyExecution.js src/features/strategy/StrategyCenterPage.jsx react-tests/strategy-execution.test.mjs react-tests/platform-ui.test.mjs
git commit -m "feat(strategy): protect result task links"
```

### Task 5: 全量验证和页面设计审计

**Files:**
- Modify if required by findings: `src/features/strategy/StrategyCenterPage.jsx`
- Modify if required by findings: `src/styles.css`

**Interfaces:**
- Consumes: all Tasks 1-4.
- Produces: verified local preview on `http://127.0.0.1:8136/`.

- [ ] **Step 1: Run complete tests**

Run: `npm test`

Expected: every React and API test passes with zero failures.

- [ ] **Step 2: Run production build**

Run: `npm run build`

Expected: Vite build exits 0 without unresolved imports or Babel errors.

- [ ] **Step 3: Verify in browser**

Open `http://127.0.0.1:8136/`, enter the strategy center, expand multiple required results, verify only one remains open, inspect mapped tasks, toggle a milestone complete and back, create a department task from the empty state, and confirm edit/archive controls do not toggle the row.

- [ ] **Step 4: Complete design audit**

Check hierarchy, spacing, alignment, consistency, narrow-screen wrapping, keyboard focus, progress semantics and disabled-control behavior. Fix only observed issues, then rerun `npm test` and `npm run build`.

- [ ] **Step 5: Commit final polish if needed**

```bash
git add src/features/strategy/StrategyCenterPage.jsx src/styles.css
git commit -m "style(strategy): polish execution drilldown"
```
