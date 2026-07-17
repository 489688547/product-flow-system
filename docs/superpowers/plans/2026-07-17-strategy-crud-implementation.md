# 战略数据与安全 CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将《提野星2026年重点工作》迁移为 v3 战略执行数据，并为经营执行平台的核心对象补齐受权限和审计规则约束的增删改查。

**Architecture:** 保持现有 React 页面、PlatformProvider 和纯领域 reducer 三层结构。所有数据变化先进入 `reducePlatformState`，界面只触发命令；删除统一写成归档并记录审计，v2 数据通过一次性纯函数迁移到 v3。

**Tech Stack:** React 19、Vite 7、Node test runner、Cloudflare Pages Functions、D1 JSON records。

## Global Constraints

- 仅总经办可进入经营执行平台，不能放宽现有身份灰度。
- 不物理删除 D1 记录，不修改冻结月报和月度快照的不可变规则。
- 使用现有 `Modal`、`ConfirmDialog`、`Button` 和页面视觉语言。
- 不改动产品全周期 App 的行为。
- 所有新行为先写失败测试，再写最小实现。

---

### Task 1: v3 文档数据迁移

**Files:**
- Modify: `src/domain/strategyExecution.js`
- Test: `react-tests/strategy-execution.test.mjs`

**Interfaces:**
- Produces: `migratePlatformState(input)`，返回 `strategy-platform-v3` 状态。
- Consumes: `normalizePlatformState(input)` 在标准化集合前应用迁移。

- [ ] **Step 1: Write the failing tests**

添加测试，断言 v2 的三大战略更新为文档口径，新增组织复盘/数据资产、仓鼠品牌理念、品牌部与运营部承诺；保留用户自建记录；再次迁移 v3 不改变数据。

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test react-tests/strategy-execution.test.mjs`
Expected: FAIL because `migratePlatformState` and v3 seed records do not exist.

- [ ] **Step 3: Implement the migration**

在 `strategyExecution.js` 中定义稳定 ID 的 v3 战略、必达结果、部门承诺和里程碑。仅当版本不是 v3 时按 ID 合并：系统预置 ID 使用文档字段覆盖并保留状态/时间，缺失 ID 新增，未知 ID 原样保留，最后写入 `version: "strategy-platform-v3"`。

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test react-tests/strategy-execution.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(strategy): migrate document data to v3`

### Task 2: 受控归档领域命令

**Files:**
- Modify: `src/domain/strategyExecution.js`
- Modify: `src/state/PlatformProvider.jsx`
- Test: `react-tests/strategy-execution.test.mjs`
- Test: `react-tests/platform-provider.test.mjs`

**Interfaces:**
- Produces provider commands: `archiveStrategy`, `archiveRequiredResult`, `archiveDepartmentCommitment`, `archiveProject`, `archiveProjectChild`, `archiveIncentiveProject`, `archiveMonthlyReport`, `archiveStatusUpdate`.
- Each command dispatches the same-named reducer action with `id`, optional `collection`, and a Chinese audit reason.

- [ ] **Step 1: Write failing reducer tests**

覆盖战略依赖阻止、战略与必达结果级联归档、部门承诺状态限制、项目子记录级联、激励项目状态限制、月报状态限制、周报归档和审计日志。

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test react-tests/strategy-execution.test.mjs react-tests/platform-provider.test.mjs`
Expected: FAIL because archive actions and provider commands do not exist.

- [ ] **Step 3: Implement reducer actions and provider commands**

使用 `archived: true`、`archivedAt`、`archivedBy` 更新记录并调用现有 `audit(...)`。业务违规时抛出中文 `Error`；项目归档同时归档 `milestones`、`risks`、`decisionRequests`；战略归档同时归档 `requiredResults`。

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test react-tests/strategy-execution.test.mjs react-tests/platform-provider.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(platform): add audited archive commands`

### Task 3: 战略与部门承诺完整 CRUD

**Files:**
- Create: `src/features/strategy/StrategyModal.jsx`
- Modify: `src/features/strategy/StrategyCenterPage.jsx`
- Modify: `src/features/strategy/RequiredResultModal.jsx`
- Modify: `src/features/strategy/DepartmentCommitmentModal.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/governed-execution-ui.test.mjs`

**Interfaces:**
- `StrategyModal({ open, record, currentUser, onClose, onSave })` returns `{ id?, name, intent, successStandard, owner, year, status }`.
- Strategy page consumes Task 2 archive commands and existing save commands.

- [ ] **Step 1: Write failing UI contract tests**

断言存在“新建战略”、战略编辑/删除、必达结果删除、部门承诺删除、`ConfirmDialog` 和错误提示；断言编辑承诺时被移除的里程碑会调用归档命令。

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test react-tests/governed-execution-ui.test.mjs`
Expected: FAIL because CRUD controls are absent.

- [ ] **Step 3: Implement minimal strategy CRUD UI**

新增战略弹窗；在战略卡和结果行加入不触发父级点击的紧凑操作；使用一个 `deleteTarget` 状态驱动 `ConfirmDialog`；捕获 reducer 错误并显示 `inline-alert`。编辑部门承诺保存时比较原里程碑 ID，归档被移除项。

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test react-tests/governed-execution-ui.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(strategy): complete strategy CRUD`

### Task 4: 项目、激励、月报和周度确认 CRUD

**Files:**
- Modify: `src/features/projects/KeyProjectsPage.jsx`
- Modify: `src/features/projects/ProjectDetailModal.jsx`
- Modify: `src/features/incentives/IncentiveProjectsPage.jsx`
- Modify: `src/features/reviews/OperatingReviewPage.jsx`
- Modify: `src/features/reviews/StatusUpdateModal.jsx`
- Modify: `src/styles.css`
- Test: `react-tests/governed-execution-ui.test.mjs`
- Test: `react-tests/platform-ui.test.mjs`

**Interfaces:**
- Lists consume Task 2 archive commands.
- `StatusUpdateModal` accepts optional `record` and returns the edited record ID when present.
- Project child edit/delete continues using `dispatch` for upsert and uses `archiveProjectChild(collection, id)` for deletion.

- [ ] **Step 1: Write failing UI tests**

断言重点项目、项目里程碑/风险/决策、激励项目、草稿月报、周度状态均有编辑和删除或取消入口；断言冻结月报与历史快照没有删除入口。

- [ ] **Step 2: Run tests to verify RED**

Run: `node --test react-tests/governed-execution-ui.test.mjs react-tests/platform-ui.test.mjs`
Expected: FAIL because archive controls are incomplete.

- [ ] **Step 3: Implement CRUD controls**

复用 `ConfirmDialog`。列表行操作按钮阻止打开详情；项目详情为每类子记录增加编辑/删除；激励项目按状态显示删除或取消；月报仅草稿显示删除；周度状态使用现有弹窗编辑并支持归档。所有 reducer 错误显示在当前页面。

- [ ] **Step 4: Run tests to verify GREEN**

Run: `node --test react-tests/governed-execution-ui.test.mjs react-tests/platform-ui.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat(platform): complete execution CRUD`

### Task 5: 持久化、回归与浏览器验收

**Files:**
- Modify if required by failures: files changed in Tasks 1–4 only
- Verify: `functions/api/platform.js`
- Verify: `tests/platform-api.test.mjs`

**Interfaces:**
- The existing `/api/platform` POST persists v3 collections and `archived` fields unchanged.

- [ ] **Step 1: Add persistence regression test if current coverage does not retain v3/archived fields**

在 `tests/platform-api.test.mjs` 保存一条 `version: strategy-platform-v3` 且 `archived: true` 的记录，重新 GET 并断言字段保留。

- [ ] **Step 2: Run targeted and full verification**

Run: `npm test && npm run build`
Expected: all tests PASS; production build succeeds.

- [ ] **Step 3: Browser QA on local preview**

在 Chrome 的本地测试页验证新增、编辑、删除确认、取消和刷新持久化；检查控制台无新错误，并确认非总经办身份灰度代码未改变。

- [ ] **Step 4: Review the complete diff**

Run: `git diff --check` and `git status --short`.
Expected: no whitespace errors; `AGENTS.md` remains untracked and untouched.

- [ ] **Step 5: Commit final verification fixes only when needed**

Commit: `test(platform): cover v3 CRUD persistence`
