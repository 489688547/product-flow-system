# DingTalk Todo Recovery and Deliverable CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 恢复钉钉中已存在但平台丢失 ID 的核心待办，并在产品进度页补齐交付物查看、编辑、删除闭环。

**Architecture:** 服务端只在钉钉明确返回重复 `sourceId` 时查询创建人的待办，以 `sourceId` 精确匹配并更新已有记录；其他错误保持原样。产品进度复用共享 `deliverables` 状态和现有编辑组件，不新增持久化结构。

**Tech Stack:** React 19、Node.js ESM、Node test runner、Cloudflare Pages Functions、D1、钉钉 Todo OpenAPI。

## Global Constraints

- 钉钉待办使用稳定 `sourceId`，禁止换 ID 绕过冲突或删除重建。
- 恢复只能匹配完全相同的 `sourceId`，不能按标题猜测。
- 钉钉权限继续使用已开通的 `Todo.Todo.Read` 和 `Todo.Todo.Write`。
- 产品进度与资料包共用 `state.deliverables`，不增加第二份任务附件状态。
- 删除交付物必须二次确认。
- 生产代码必须先有失败测试。

---

### Task 1: Recover Existing DingTalk Todo by sourceId

**Files:**
- Modify: `functions/api/dingtalk/_shared/dingtalk.js`
- Modify: `tests/dingtalk-todo-update.test.mjs`

**Interfaces:**
- Consumes: `syncDingTodoTask(accessToken, input, fetchImpl)`、钉钉创建错误和待办列表响应。
- Produces: `isDuplicateTodoSourceError(error) -> boolean`、`findDingTodoBySourceId(accessToken, unionId, sourceId, fetchImpl) -> todo | null`，以及恢复成功的 `{ id, updated: true, recovered: true }`。

- [ ] **Step 1: Write the duplicate source recovery test**

```js
test("syncDingTodoTask recovers an existing DingTalk task after duplicate sourceId", async () => {
  const calls = [];
  const result = await syncDingTodoTask("token-1", {
    creatorUnionId: "creator-union",
    executorUnionIds: ["executor-union"],
    sourceId: "task:p1:t1",
    subject: "立项PRD同步",
    detailUrl: "https://flow.example.com/#progress",
    dueTime: 1784301600000,
    done: false
  }, async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") return errorJson(400, { code: "todo.taskCreate.paramError", message: "task existed sourceId is task:p1:t1" });
    if (options.method === "GET") return okJson({ todoCards: [{ id: "todo-existing", sourceId: "task:p1:t1" }] });
    return okJson({ result: true });
  });
  assert.equal(result.id, "todo-existing");
  assert.equal(result.recovered, true);
  assert.deepEqual(calls.map(call => call.options.method), ["POST", "GET", "PUT"]);
});
```

- [ ] **Step 2: Run the targeted test and verify RED**

Run: `node --test tests/dingtalk-todo-update.test.mjs`

Expected: FAIL because `syncDingTodoTask` throws the duplicate-source error instead of querying and updating.

- [ ] **Step 3: Implement minimal duplicate detection and recovery**

```js
export function isDuplicateTodoSourceError(error) {
  const text = [error?.message, error?.detail?.message, error?.detail?.errmsg].filter(Boolean).join(" ");
  return /task existed sourceId/i.test(text);
}

export async function findDingTodoBySourceId(accessToken, unionId, sourceId, fetchImpl = fetch) {
  for (const isDone of [false, true]) {
    const cards = await listDingTodoTasks(accessToken, unionId, { isDone, fetchImpl });
    const found = cards.find(card => String(card.sourceId || "") === String(sourceId || ""));
    if (found) return found;
  }
  return null;
}
```

Wrap create in `syncDingTodoTask`; on the explicit duplicate error, find the existing card, extract `id || taskId || todoTaskId`, call `updateDingTodoTask`, and return `recovered: true`. If no card matches, rethrow the original error.

- [ ] **Step 4: Add completed-list and non-duplicate error tests**

Test that the second list query can recover a completed task and that permission/network errors do not trigger any list query.

- [ ] **Step 5: Run targeted API tests and verify GREEN**

Run: `node --test tests/dingtalk-todo-update.test.mjs tests/dingtalk-todo-list.test.mjs tests/dingtalk-sync.test.mjs`

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add functions/api/dingtalk/_shared/dingtalk.js tests/dingtalk-todo-update.test.mjs
git commit -m "fix(dingtalk): recover existing todo by source id"
```

---

### Task 2: Add Product Progress Deliverable Edit and Delete

**Files:**
- Modify: `src/features/progress/TaskDeliverableModal.jsx`
- Modify: `src/features/progress/ProductProgressPage.jsx`
- Modify: `src/ui/DeliverablePreviewModal.jsx`
- Modify: `react-tests/react-app.test.mjs`

**Interfaces:**
- Consumes: `updateDeliverable(id, patch)`、`deleteDeliverable(id)` from `useProductFlow()`。
- Produces: `TaskDeliverableModal({ file })` edit mode and `DeliverablePreviewModal({ onEdit, onDelete })` actions.

- [ ] **Step 1: Write failing source-contract tests**

```js
test("product progress exposes deliverable edit and delete actions", () => {
  assert.match(page, /updateDeliverable/);
  assert.match(page, /deleteDeliverable/);
  assert.match(preview, /编辑交付物/);
  assert.match(preview, /删除交付物/);
  assert.match(modal, /file\?\.id/);
});
```

- [ ] **Step 2: Run the targeted React test and verify RED**

Run: `node --test react-tests/react-app.test.mjs`

Expected: FAIL because the progress page does not wire edit/delete actions and the task modal has no edit mode.

- [ ] **Step 3: Add edit mode to TaskDeliverableModal**

Add optional `file` prop. When open, initialize `type`, `name`, `url`, and `content` from `file`; use title/button copy “编辑交付物/保存” for `file.id`, otherwise keep “添加交付物/添加”. `onSave` returns the normalized fields while preserving task/product relationship in the page handler.

- [ ] **Step 4: Add preview actions**

Add optional `onEdit` and `onDelete` props to `DeliverablePreviewModal`. Render secondary “编辑” and danger “删除” buttons only when callbacks are supplied; existing callers remain unchanged.

- [ ] **Step 5: Wire progress page state and confirmation**

Destructure `updateDeliverable` and `deleteDeliverable`. Add `editingDeliverable` and `deliverableToDelete` state. Preview actions open edit or confirmation; saving calls `updateDeliverable(id, patch)`; deleting calls `deleteDeliverable(id)`, closes preview, and clears confirmation.

- [ ] **Step 6: Run targeted React tests and verify GREEN**

Run: `node --test react-tests/react-app.test.mjs react-tests/shared-state.test.mjs`

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/progress/TaskDeliverableModal.jsx src/features/progress/ProductProgressPage.jsx src/ui/DeliverablePreviewModal.jsx react-tests/react-app.test.mjs
git commit -m "feat(progress): complete deliverable CRUD"
```

---

### Task 3: Release and Production Verification

**Files:**
- Generated: `assets/*`
- Modify: `cloudflare-entry.html`

**Interfaces:**
- Consumes: passing source tests and production credentials.
- Produces: merged `main`, Cloudflare production deployment, and one recovered real DingTalk todo.

- [ ] **Step 1: Run full quality gates**

Run: `npm run lint && npm run check:governance && npm test && npm run audit:dependencies && npm run release:pages`

Expected: lint/governance pass, React and API suites pass, 0 dependency vulnerabilities, production build succeeds.

- [ ] **Step 2: Commit release assets**

```bash
git add assets cloudflare-entry.html
git commit -m "build: publish todo recovery and deliverable CRUD"
```

- [ ] **Step 3: Push and merge through protected main**

Push `codex/todo-deliverable-crud`, create a non-draft PR, wait for required quality checks, and merge normally without bypassing branch protection.

- [ ] **Step 4: Deploy Cloudflare Pages production**

Deploy the release commit to project `product-flow-system`, branch `main`, then verify the official domain serves the generated asset hash.

- [ ] **Step 5: Verify the existing real task**

On the signed-in production page, retry “立项PRD同步” with the current user as executor. Expected: modal closes, task status becomes “已同步”, and no second core todo is created.

- [ ] **Step 6: Verify deliverable CRUD in UI**

Open the existing test deliverable in product progress, confirm edit and delete controls exist, edit without deleting user data, and verify the shared package surface reflects the update. Do not delete an existing business deliverable during verification.
