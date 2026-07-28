# 钉钉原生待办复选框实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Product tasks create DingTalk native personal todos with the standard left-side checkbox, and remote completion flows back to product progress.

**Architecture:** Reuse the existing personal todo adapter and authenticated user-token resolver instead of the enterprise work-todo create path. Persist the personal taskId as the authoritative binding, keep work-todo reads only for migration, and retire a legacy work card only after its personal replacement is created and the new binding is safely persisted.

**Tech Stack:** React, Cloudflare Pages Functions, DingTalk personal todo OpenAPI/MCP tools, Cloudflare D1, Node test runner.

## Global Constraints

- No new environment variables, Cloudflare bindings, D1 tables, provider permissions, or browser-side credentials.
- Product features call only internal APIs; DingTalk calls remain under `functions/api`.
- User authorization failure must return `DINGTALK_USER_AUTH_REQUIRED`; do not fall back to enterprise work-todo creation.
- Do not send fields not already supported by the repository's verified personal-todo adapter.
- Production delivery remains GitOps-only through GitHub `main` and Cloudflare Pages.

---

### Task 1: Personal Todo Synchronization Contract

**Files:**
- Modify: `tests/dingtalk-sync.test.mjs`
- Modify: `tests/dingtalk-todo-update.test.mjs`
- Modify: `functions/api/dingtalk/_shared/dingtalk.js`

**Interfaces:**
- Consumes: `createDingPersonalTodoTask(userAccessToken, input, fetchImpl)` and `updateDingPersonalTodoTask(userAccessToken, input, fetchImpl)`.
- Produces: `syncDingPersonalTodoTask(userAccessToken, input, fetchImpl)` returning `{id, taskId, source:"todo_personal_user", actionVersion:2}`.

- [x] **Step 1: Write failing tests**

Add behavior tests that require a new product-task sync to call `/v1.0/todo/users/me/personalTasks`, never call `/v1.0/todo/users/{unionId}/tasks`, and update an existing personal task through `update_todo_task` without creating a duplicate.

- [x] **Step 2: Verify RED**

Run: `node --test tests/dingtalk-sync.test.mjs tests/dingtalk-todo-update.test.mjs`

Expected: FAIL because product-task synchronization still calls the enterprise work-todo adapter.

- [x] **Step 3: Implement the minimal personal sync helper**

Create `syncDingPersonalTodoTask` that validates `dueTime`, calls `updateDingPersonalTodoTask` when `todoId` is present, otherwise calls `createDingPersonalTodoTask`, and returns interaction version `2`.

- [x] **Step 4: Verify GREEN**

Run: `node --test tests/dingtalk-sync.test.mjs tests/dingtalk-todo-update.test.mjs`

Expected: PASS.

### Task 2: Authenticated Route and Legacy Work-Card Migration

**Files:**
- Modify: `tests/dingtalk-todo-update.test.mjs`
- Modify: `functions/api/dingtalk/todo/sync.js`
- Modify: `functions/api/dingtalk/_shared/dingtalk.js`
- Modify: `src/domain/taskTodo.js`

**Interfaces:**
- Consumes: `getValidDingUserToken(request, env)`, `syncDingPersonalTodoTask`, `getDingAccessToken(env)`.
- Produces: a sync route that creates/updates personal todos and retires a legacy work card only after replacement creation.

- [x] **Step 1: Write failing route tests**

Cover these literal outcomes: a valid user token creates a personal task; missing/expired authorization returns `DINGTALK_USER_AUTH_REQUIRED`; a bound `todo_open_*` card is replaced by a personal task; a bound `todo_personal_user` taskId is reused; retirement failure reports the existing retryable migration error.

- [x] **Step 2: Verify RED**

Run: `node --test tests/dingtalk-todo-update.test.mjs`

Expected: FAIL because the route resolves only the application access token and treats personal bindings as replacement candidates.

- [x] **Step 3: Implement route orchestration**

Resolve the valid user token before real external writes. Reuse trusted personal bindings with `actionVersion >= 2`; create a personal replacement for legacy work bindings; use the application token only to retire a replaced work card; persist the new taskId through `persistTaskTodoSyncResult`.

- [x] **Step 4: Verify GREEN**

Run: `node --test tests/dingtalk-todo-update.test.mjs react-tests/task-todo.test.mjs`

Expected: PASS.

### Task 3: Remove the Custom Completion Action

**Files:**
- Modify: `react-tests/task-todo.test.mjs`
- Modify: `react-tests/todo-composer-ui.test.mjs`
- Modify: `src/App.jsx`
- Modify: `src/domain/taskTodo.js`
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: personal todo completion snapshots from `reconcileTaskTodosFromDingTalk`.
- Produces: product progress UI with no `todoAction=complete` confirmation banner and a sync-status version of `2`.

- [x] **Step 1: Write failing UI/domain tests**

Require the composer payload to request interaction version `2`, personal bindings to show “已同步”, legacy work bindings to show “待更新”, and normal product-detail navigation to remain read-only without a completion confirmation action.

- [x] **Step 2: Verify RED**

Run: `node --test react-tests/task-todo.test.mjs react-tests/todo-composer-ui.test.mjs`

Expected: FAIL because version `1` and the custom completion banner are still present.

- [x] **Step 3: Implement the minimal UI/domain change**

Set the interaction version to `2`, remove the custom completion banner and `todoAction=complete` parsing branch, retain product/task selection for ordinary detail links, and leave remote completion reconciliation unchanged.

- [x] **Step 4: Verify GREEN**

Run: `node --test react-tests/task-todo.test.mjs react-tests/todo-composer-ui.test.mjs`

Expected: PASS.

### Task 4: Full Verification and GitOps Delivery

**Files:**
- Modify: `docs/features/dingtalk-todo-composer/tasks.md`

**Interfaces:**
- Consumes: all preceding implementation and tests.
- Produces: reviewed pull request, merged `main`, Cloudflare production deployment, and real-account acceptance evidence.

- [x] **Step 1: Run focused and full verification**

Run:

```bash
node --test tests/dingtalk-sync.test.mjs tests/dingtalk-todo-update.test.mjs react-tests/task-todo.test.mjs react-tests/todo-composer-ui.test.mjs
npx wrangler pages functions build
npm run lint
npm run check:governance
npm run check:integrations
npm run check:environment-capabilities
npm test
npm run build
```

- [ ] **Step 2: Publish through a pull request**

Declare `Integration-Impact: dingtalk, cloudflare-pages, cloudflare-d1` and name the durable rule files under `Rule-Writeback`. Run `npm run check:pr` against the exact PR body before pushing.

- [ ] **Step 3: Verify production**

Run deployed readiness for DingTalk, Cloudflare Pages, and Cloudflare D1. With the explicitly authorized test account, resync one product task, confirm the DingTalk card has the native left-side checkbox, mark it complete only when authorized for the acceptance step, and confirm product progress reflects completion after refresh/polling.
