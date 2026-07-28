# 多人钉钉待办与负责人验收实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show each DingTalk executor's completion progress and require the product manager to perform the final, deliverable-gated acceptance.

**Architecture:** Reuse the existing personal todo `taskId`, detail endpoint, shared-state persistence, and product progress table. The todo list route reads the same task for each bound executor; pure domain rules compute `N/(executors+manager)` and the shared-state route authorizes final completion.

**Tech Stack:** React, JavaScript domain modules, Cloudflare Pages Functions, D1 whole-state persistence, Node test runner.

## Global Constraints

- Public task categories are exactly `待办任务` and `会议`; legacy values normalize compatibly.
- Product manager is excluded from ordinary executor count.
- Five ordinary executors start at `0/6`.
- Required tasks need a linked deliverable before final completion.
- No new API route, D1 table, binding, environment variable, dependency, or real DingTalk test recipient.
- DingTalk detail reads remain capped at 40 executor-task pairs and concurrency 4.

---

### Task 1: Pure Completion Rules and Category Compatibility

**Files:**
- Create: `src/domain/taskCompletion.js`
- Modify: `src/domain/productFlow.js`
- Modify: `src/state/stateModel.js`
- Test: `react-tests/task-completion.test.mjs`
- Test: `react-tests/dingtalk-meeting.test.mjs`
- Test: `react-tests/shared-state.test.mjs`

**Interfaces:**
- Produces: `effectiveTaskExecutorIds(task, product) -> string[]`
- Produces: `taskCompletionProgress(task, product) -> {completed,total,executorsDone,executorsTotal,allExecutorsDone,coverageComplete,managerAccepted}`
- Produces: `taskAcceptanceBlockReason({task, product, deliverables, actorUnionId}) -> string`
- Produces: `buildTaskAcceptancePatch({task, actorUnionId, accepted, now}) -> object`

- [ ] Write failing tests for two public categories, legacy normalization, product-manager deduplication, `0/6`, partial progress, missing coverage, and required deliverable blocking.
- [ ] Run `node --test react-tests/task-completion.test.mjs react-tests/dingtalk-meeting.test.mjs react-tests/shared-state.test.mjs` and confirm failures are caused by missing rules.
- [ ] Add the four pure functions, set new-task default category to `待办任务`, and normalize optional status/acceptance fields without changing old completed tasks.
- [ ] Re-run the focused tests and confirm they pass.
- [ ] Commit `feat: add product task acceptance rules`.

### Task 2: Per-Executor DingTalk Read and Server Completion Guard

**Files:**
- Modify: `functions/api/dingtalk/todo/list.js`
- Modify: `functions/api/state.js`
- Modify: `src/domain/dingTalk.js`
- Test: `tests/dingtalk-todo-list.test.mjs`
- Test: `tests/shared-state.test.mjs`
- Test: `react-tests/task-todo.test.mjs`

**Interfaces:**
- Extends: `GET /api/dingtalk/todo/list?taskId=<todoId>` returns one task card with `executorStatuses` and `executorStatusCoverage`.
- Produces: `validateTaskCompletionTransitions(beforeState, nextState, session)`.
- Extends: `reconcileTaskTodosFromDingTalk(tasks, cards)` stores executor status without treating executor completion as final acceptance.

- [ ] Write failing tests for server-generated executor query pairs, manager/creator/executor authorization, 40-pair truncation, partial coverage, non-manager completion rejection, incomplete-executor rejection, and required-deliverable rejection.
- [ ] Run `node --test tests/dingtalk-todo-list.test.mjs tests/shared-state.test.mjs react-tests/task-todo.test.mjs` and confirm expected failures.
- [ ] Read bound tasks from the middleware-selected business database, query the same trusted `taskId` under each effective executor unionId in batches of four, and return safe aggregate cards.
- [ ] Validate `done: false -> true` against the product manager, persisted executor status coverage, all-executor completion, and linked deliverables before `writeCompanyState`.
- [ ] Reconcile remote executor statuses; if a known executor becomes incomplete after final acceptance, clear the acceptance and reopen the task.
- [ ] Re-run focused tests and commit `feat: track DingTalk executor completion`.

### Task 3: Product Progress UX, Durable Docs, and Delivery

**Files:**
- Create: `src/features/progress/TaskCompletionProgress.jsx`
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/state/ProductFlowProvider.jsx`
- Modify: `src/styles.css`
- Modify: `PRODUCT.md`
- Modify: `DESIGN.md`
- Modify: `docs/features/dingtalk-todo-composer/prd.md`
- Modify: `docs/features/dingtalk-todo-composer/design.md`
- Modify: `docs/features/dingtalk-todo-composer/plan.md`
- Modify: `docs/features/dingtalk-todo-composer/tasks.md`
- Test: `react-tests/task-completion-ui.test.mjs`
- Test: `react-tests/task-todo.test.mjs`

**Interfaces:**
- Consumes: Task 1 progress/block functions.
- Produces: accessible progress trigger, executor detail panel, and product-manager final acceptance control.

- [ ] Write failing UI contract tests for `2/6`, executor rows, manager-only final action, incomplete/required disabled reasons, and the two category actions.
- [ ] Run `node --test react-tests/task-completion-ui.test.mjs react-tests/task-todo.test.mjs` and confirm expected failures.
- [ ] Replace the direct task checkbox with `TaskCompletionProgress`; ordinary users see status only, product manager can accept or reopen.
- [ ] Make todo refresh include tasks where the current user is product manager, creator, or executor; keep the current focus/interval/backoff flow.
- [ ] Update durable product/design/integration documentation and mark feature tasks complete.
- [ ] Run focused tests, `npx wrangler pages functions build`, and the full Definition of Done.
- [ ] Commit `feat: add multi-person todo acceptance progress`.
- [ ] Push the feature branch, open a PR to `dev`, pass checks, merge, verify `https://deshan-tiyes-system-dev.pages.dev`, open and merge the sole `dev -> main` PR, then verify `https://deshan-tiyes-system.pages.dev`.
