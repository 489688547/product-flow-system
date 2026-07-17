# 总经办个人待办与钉钉同步实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为总经办提供默认打开的个人待办工作台，把平台责任事项统一投影为个人待办，并通过钉钉官方企业待办查询接口安全地实现状态双向同步，同时在本地只读预览真实线上待办。

**Architecture:** `personalTodos` 是战略平台的持久化执行投影，原始项目、风险、决策和产品任务仍是业务事实源。前端只按当前用户 `unionId` 展示和拉取状态，服务端只查询会话本人；远端返回数据只与已保存的 `dingTodo.id` 求交集，绝不按标题匹配或导入其他待办。本地 DWS 桥接仅存在于 Node 开发服务并强制回环地址和 GET 请求。

**Tech Stack:** React 19、Node.js ESM、Node test runner、Cloudflare Pages Functions、D1、钉钉 OpenAPI、DWS CLI、Vite 7。

## Global Constraints

- 功能只保留在 `codex/company-strategy-platform`，不合并进 `main`，不部署线上。
- 以 `unionId` 作为钉钉身份依据；姓名只用于显示和旧数据迁移。
- 只同步和回流带有已保存 `dingTodo.id` 的平台关联待办，不导入私人待办或其他系统待办。
- 决策在钉钉完成后不能自动批准；风险在钉钉完成后不能自动关闭。
- 钉钉查询或同步失败不能阻塞平台待办保存和公司驾驶舱。
- 本地 DWS 接口只允许回环地址上的 GET 查询，不提供任何写命令，不持久化返回数据。
- 生产状态拉取必须使用当前服务端会话的 `unionId`，忽略客户端传入的其他用户身份。
- 所有生产代码遵循测试先行：先看到目标测试因缺少行为而失败，再写最小实现。

---

### Task 1: Unified Personal Todo Projection

**Files:**
- Create: `src/domain/personalTodos.js`
- Create: `react-tests/personal-todos.test.mjs`
- Modify: `src/domain/strategyExecution.js`

**Interfaces:**
- Consumes: `platformState`, `productState`, `orgCache.users`, and a deterministic `now`.
- Produces: `reconcilePersonalTodos(input) -> PersonalTodo[]`, `personalTodosForUser(todos, user) -> PersonalTodo[]`, `groupPersonalTodos(todos, now) -> grouped object`, `applyRemoteTodoSnapshots(todos, snapshots, user, now) -> { todos, effects, audits }`.

- [ ] **Step 1: Write failing projection tests**

```js
test("projects all explicit responsibility sources into stable personal todos", () => {
  const todos = reconcilePersonalTodos({
    platformState: normalizePlatformState({
      projects: [{ id: "p1", name: "新品上市", strategyId: "s1", objectiveId: "o1" }],
      milestones: [{ id: "m1", projectId: "p1", title: "完成首发", owner: "周总", dueDate: "2026-07-18", status: "pending" }],
      risks: [{ id: "r1", projectId: "p1", title: "库存风险", owner: "周总", promisedAt: "2026-07-19", status: "open" }],
      decisionRequests: [{ id: "d1", projectId: "p1", title: "追加预算", decisionOwner: "周总", dueDate: "2026-07-17", status: "pending" }]
    }),
    productState: { tasks: [{ id: "t1", productId: "product-1", title: "补齐详情页", due: "2026-07-20", done: false, dingTodo: { executorUnionIds: ["union-zhou"], executorNames: ["周总"] } }] },
    orgCache: { users: [{ userid: "u-zhou", unionid: "union-zhou", name: "周总", department: "总经办" }] },
    existingTodos: [],
    now: "2026-07-16T08:00:00.000Z"
  });
  assert.deepEqual(new Set(todos.map(todo => todo.sourceType)), new Set(["milestone", "risk", "decision", "product_task", "review"]));
  assert.equal(todos.find(todo => todo.sourceType === "milestone").sourceKey, "strategy-platform:milestone:m1");
  assert.equal(todos.every(todo => todo.assigneeUnionId === "union-zhou"), true);
});

test("department-only product tasks never become personal todos", () => {
  const todos = reconcilePersonalTodos({
    platformState: normalizePlatformState({}),
    productState: { tasks: [{ id: "t1", title: "部门公共任务", ownerDept: "产品部", done: false }] },
    orgCache: { users: [{ unionid: "union-ye", name: "叶经理", department: "产品部" }] },
    existingTodos: [],
    now: "2026-07-16T08:00:00.000Z"
  });
  assert.equal(todos.some(todo => todo.sourceId === "t1"), false);
});
```

- [ ] **Step 2: Run the projection tests and verify RED**

Run: `node --test react-tests/personal-todos.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/domain/personalTodos.js`.

- [ ] **Step 3: Implement the minimal projection and collection normalization**

```js
export function reconcilePersonalTodos({ platformState, productState = {}, orgCache = {}, existingTodos = [], now = new Date() }) {
  const users = Array.isArray(orgCache.users) ? orgCache.users : [];
  const candidates = [
    ...platformState.milestones.filter(item => !item.archived).map(item => sourceCandidate("milestone", item, item.owner, item.dueDate)),
    ...platformState.risks.filter(item => !item.archived && item.status !== "closed").map(item => sourceCandidate("risk", item, item.owner, item.promisedAt)),
    ...platformState.decisionRequests.filter(item => !item.archived && item.status === "pending").map(item => sourceCandidate("decision", item, item.decisionOwner, item.dueDate)),
    ...productTaskCandidates(productState.tasks || [], users),
    ...weeklyReviewCandidates(platformState.statusUpdates, users, now)
  ];
  return reconcileCandidates(candidates, existingTodos, users, now);
}

export function personalTodosForUser(todos, user) {
  const unionId = String(user?.unionid || user?.unionId || "");
  return unionId ? todos.filter(todo => todo.assigneeUnionId === unionId && todo.status !== "cancelled") : [];
}

export function groupPersonalTodos(todos, now = new Date()) {
  const today = localDate(now);
  const sevenDaysLater = addDays(today, 7);
  return todos.reduce((groups, todo) => {
    const key = todo.status === "done" ? "completed"
      : todo.dueDate && todo.dueDate < today ? "overdue"
        : todo.dueDate === today ? "today"
          : todo.dueDate && todo.dueDate <= sevenDaysLater ? "nextSevenDays"
            : "later";
    groups[key].push(todo);
    return groups;
  }, { overdue: [], today: [], nextSevenDays: [], later: [], completed: [] });
}
```

Add `"personalTodos"` to `PLATFORM_COLLECTIONS` and add `personalTodos: []` to `createDefaultPlatformState()`.

- [ ] **Step 4: Add grouping, reassignment, preservation, and remote snapshot tests**

```js
test("remote status only touches the signed-in user's linked DingTalk ids", () => {
  const input = [
    { id: "todo-1", sourceType: "milestone", sourceId: "m1", assigneeUnionId: "union-zhou", status: "pending", dingTodo: { id: "ding-1", lastEventAt: "" } },
    { id: "todo-2", sourceType: "risk", sourceId: "r1", assigneeUnionId: "union-other", status: "pending", dingTodo: { id: "ding-2" } }
  ];
  const result = applyRemoteTodoSnapshots(input, [
    { taskId: "ding-1", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" },
    { taskId: "unlinked", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" }
  ], { unionid: "union-zhou" }, "2026-07-16T09:01:00.000Z");
  assert.equal(result.todos[0].status, "done");
  assert.deepEqual(result.effects, [{ type: "complete_milestone", sourceId: "m1" }]);
  assert.equal(result.todos[1].status, "pending");
});

test("decision and risk completion require platform confirmation", () => {
  const todos = [
    { id: "d", sourceType: "decision", sourceId: "decision-1", assigneeUnionId: "u", status: "pending", dingTodo: { id: "ding-d" } },
    { id: "r", sourceType: "risk", sourceId: "risk-1", assigneeUnionId: "u", status: "pending", dingTodo: { id: "ding-r" } }
  ];
  const result = applyRemoteTodoSnapshots(todos, [
    { taskId: "ding-d", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" },
    { taskId: "ding-r", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" }
  ], { unionid: "u" }, "2026-07-16T09:01:00.000Z");
  assert.equal(result.todos.every(todo => todo.status === "done"), true);
  assert.deepEqual(result.effects, []);
  assert.match(result.audits.map(item => item.action).join(" "), /decision_pending_confirmation/);
  assert.match(result.audits.map(item => item.action).join(" "), /risk_pending_confirmation/);
});
```

- [ ] **Step 5: Run the domain tests and verify GREEN**

Run: `node --test react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs`

Expected: all tests PASS, including normalization of `personalTodos`.

- [ ] **Step 6: Commit the domain model**

```bash
git add src/domain/personalTodos.js src/domain/strategyExecution.js react-tests/personal-todos.test.mjs react-tests/strategy-execution.test.mjs
git commit -m "feat(todo): add unified personal todo projection"
```

### Task 2: DingTalk List API and Personal Todo Payload

**Files:**
- Modify: `functions/api/dingtalk/_shared/dingtalk.js`
- Create: `functions/api/dingtalk/todo/list.js`
- Modify: `src/domain/platformNotifications.js`
- Create: `tests/dingtalk-todo-list.test.mjs`
- Modify: `react-tests/platform-notifications.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: authenticated `data.session.unionId`; `PersonalTodo` and current creator identity.
- Produces: `listDingTodoTasks(accessToken, unionId, { isDone, fetchImpl })`, GET `/api/dingtalk/todo/list`, and `buildPersonalTodoPayload(todo, creator, detailUrl)`.

- [ ] **Step 1: Write failing API and payload tests**

```js
test("DingTalk todo list uses the authenticated session identity and paginates", async () => {
  const calls = [];
  const todos = await listDingTodoTasks("token", "union-zhou", { isDone: true, fetchImpl: async url => {
    calls.push(url);
    return okJson(calls.length === 1
      ? { todoCards: [{ taskId: "d1", isDone: true }], nextToken: "next-1" }
      : { todoCards: [{ taskId: "d2", isDone: true }], nextToken: "" });
  }});
  assert.deepEqual(todos.map(item => item.taskId), ["d1", "d2"]);
  assert.match(calls[0], /users\/union-zhou\/tasks/);
  assert.match(calls[0], /isDone=true/);
  assert.match(calls[1], /nextToken=next-1/);
});

test("personal todo payload keeps a stable platform source id", () => {
  const payload = buildPersonalTodoPayload({
    id: "todo-1", sourceType: "milestone", sourceId: "m1", title: "完成首发", dueDate: "2026-07-18",
    assigneeUnionId: "union-owner", status: "pending", dingTodo: {}
  }, { unionid: "union-creator" }, "https://flow.example.com/#company");
  assert.equal(payload.sourceId, "strategy-platform:milestone:m1");
  assert.deepEqual(payload.executorUnionIds, ["union-owner"]);
  assert.equal(payload.done, false);
});
```

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test tests/dingtalk-todo-list.test.mjs react-tests/platform-notifications.test.mjs`

Expected: FAIL because the list function, endpoint, and payload builder do not exist.

- [ ] **Step 3: Implement list pagination and the authenticated endpoint**

```js
export async function listDingTodoTasks(accessToken, unionId, { isDone = false, fetchImpl = fetch } = {}) {
  if (!unionId) throw Object.assign(new Error("当前登录账号缺少 unionId，无法查询钉钉待办。"), { status: 400 });
  const cards = [];
  let nextToken = "";
  do {
    const query = new URLSearchParams({ isDone: String(Boolean(isDone)) });
    if (nextToken) query.set("nextToken", nextToken);
    const page = await requestDingOpenApi(accessToken, "GET", `/v1.0/todo/users/${encodeURIComponent(unionId)}/tasks?${query}`, null, fetchImpl);
    cards.push(...(page.todoCards || []));
    nextToken = String(page.nextToken || "");
  } while (nextToken);
  return cards;
}
```

The Pages Function reads `data.session.unionId`, ignores user identity in the request, fetches both `isDone=false` and `isDone=true`, and returns `{ synced: true, todos }`:

```js
export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const unionId = String(data.session?.unionId || "");
  if (!unionId) return jsonResponse({ synced: false, message: "当前登录账号缺少 unionId。" }, 400);
  const accessToken = await getDingAccessToken(env);
  const [pending, completed] = await Promise.all([
    listDingTodoTasks(accessToken, unionId, { isDone: false }),
    listDingTodoTasks(accessToken, unionId, { isDone: true })
  ]);
  return jsonResponse({ synced: true, todos: [...pending, ...completed] });
}
```

- [ ] **Step 4: Implement the generic outbound payload**

```js
export function buildPersonalTodoPayload(todo, creator, detailUrl) {
  const creatorUnionId = identityUnionId(creator);
  if (!creatorUnionId || !todo?.assigneeUnionId) throw new Error("当前待办缺少可用的钉钉身份。");
  return {
    todoId: todo.dingTodo?.id || "",
    sourceId: todo.sourceKey || `strategy-platform:${todo.sourceType}:${todo.sourceId}`,
    subject: todo.title,
    description: todo.description || "公司战略执行平台责任事项",
    creatorUnionId,
    executorUnionIds: [todo.assigneeUnionId],
    detailUrl,
    dueTime: new Date(`${todo.dueDate}T18:00:00+08:00`).getTime(),
    priority: todo.priority || 20,
    done: todo.status === "done"
  };
}
```

- [ ] **Step 5: Register and run API tests**

Add `tests/dingtalk-todo-list.test.mjs` to `test:api` and run:

`node --test tests/dingtalk-todo-list.test.mjs tests/dingtalk-todo-update.test.mjs react-tests/platform-notifications.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit the API boundary**

```bash
git add functions/api/dingtalk/_shared/dingtalk.js functions/api/dingtalk/todo/list.js src/domain/platformNotifications.js tests/dingtalk-todo-list.test.mjs react-tests/platform-notifications.test.mjs package.json
git commit -m "feat(todo): add authenticated DingTalk status pull"
```

### Task 3: Platform Reducer, Persistence, and Safe Writeback

**Files:**
- Modify: `src/domain/strategyExecution.js`
- Modify: `functions/api/platform.js`
- Modify: `tests/platform-api.test.mjs`
- Modify: `src/state/PlatformProvider.jsx`
- Modify: `src/state/ProductFlowProvider.jsx`
- Modify: `react-tests/platform-provider.test.mjs`

**Interfaces:**
- Consumes: reconciliation results from Task 1 and payload/API from Task 2.
- Produces: reducer actions `replace_personal_todos`, `update_personal_todo_notification`, `apply_personal_todo_status`; provider methods `syncPersonalTodo`, `refreshPersonalTodoStatuses`, `setPersonalTodoDone`.

- [ ] **Step 1: Write failing reducer, persistence, and provider contract tests**

```js
test("personal todo updates are audited and persisted", () => {
  const state = normalizePlatformState({ personalTodos: [{ id: "todo-1", status: "pending", dingTodo: {} }] });
  const next = reducePlatformState(state, {
    type: "apply_personal_todo_status", id: "todo-1", status: "done", completedFrom: "dingtalk",
    remoteSnapshotKey: "ding-1:true:2026-07-16T09:00:00.000Z", actor: "周总", timestamp: "2026-07-16T09:01:00.000Z"
  });
  assert.equal(next.personalTodos[0].status, "done");
  assert.equal(next.auditLogs[0].action, "complete_from_dingtalk");
});
```

Update the D1 fixture to include `personalTodos: [{ id: "todo-1", title: "完成首发" }]` and assert it survives POST/GET.

Assert provider source contains `syncPersonalTodo`, `refreshPersonalTodoStatuses`, `/api/dingtalk/todo/list`, and explicit milestone/product-task writeback calls.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --test react-tests/personal-todos.test.mjs react-tests/platform-provider.test.mjs tests/platform-api.test.mjs`

Expected: FAIL because the collection is not persisted and provider methods do not exist.

- [ ] **Step 3: Implement reducer and D1 collection support**

Add `"personalTodos"` to the Pages Function collection list. Implement reducer branches that preserve immutable source fields, merge `dingTodo`, write one audit per effective status transition, and return the same state for duplicate snapshot keys.

```js
if (action.type === "replace_personal_todos") {
  return { ...state, personalTodos: action.todos.map(item => ({ ...item })), updatedAt: timestamp };
}
if (action.type === "update_personal_todo_notification") {
  return { ...state, personalTodos: state.personalTodos.map(item => item.id === action.id
    ? { ...item, dingTodo: { ...item.dingTodo, ...action.dingTodo }, updatedAt: timestamp }
    : item), updatedAt: timestamp };
}
```

- [ ] **Step 4: Implement provider reconciliation and safe source writeback**

Use `useProductFlow()` inside `PlatformProvider` to access `productState`, `currentUser`, `orgCache`, and `updateTask`. Reconcile projections only when their semantic JSON signature changes. `refreshPersonalTodoStatuses()` fetches the authenticated list, calls `applyRemoteTodoSnapshots`, dispatches effective todo updates, then:

```js
for (const effect of result.effects) {
  if (effect.type === "complete_milestone") {
    const milestone = state.milestones.find(item => item.id === effect.sourceId);
    if (milestone) dispatch({ type: "upsert_milestone", record: { ...milestone, status: "completed" }, reason: "钉钉待办完成" });
  }
  if (effect.type === "complete_product_task") updateTask(effect.sourceId, { done: true });
}
```

Decision and risk effects are never emitted. Product assignment details are retained in `dingTodo.executorUnionIds/executorNames` even when outbound sync fails so an explicit assignee still has a platform todo.

- [ ] **Step 5: Implement outbound status and manual completion**

`syncPersonalTodo(id)` posts `buildPersonalTodoPayload(...)` to the existing sync endpoint and stores success/error. `setPersonalTodoDone(id, done)` updates the unified todo, performs allowed source writeback for milestones/product tasks, and then attempts outbound sync without rolling back the local state on failure.

```js
const syncPersonalTodo = useCallback(async id => {
  const todo = state.personalTodos.find(item => item.id === id);
  if (!todo) throw new Error("个人待办不存在。");
  const payload = buildPersonalTodoPayload(todo, currentUser, `${window.location.origin}/#company`);
  try {
    const response = await fetch("/api/dingtalk/todo/sync", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.synced) throw new Error(result.message || "钉钉待办同步失败。");
    dispatch({ type: "update_personal_todo_notification", id, dingTodo: { id: result.todo?.id || result.todo?.taskId || payload.todoId, syncedAt: new Date().toISOString(), lastError: "" } });
    return result.todo;
  } catch (error) {
    dispatch({ type: "update_personal_todo_notification", id, dingTodo: { lastError: error.message, failedAt: new Date().toISOString() } });
    throw error;
  }
}, [currentUser, dispatch, state.personalTodos]);
```

- [ ] **Step 6: Run focused and regression tests**

Run: `node --test react-tests/personal-todos.test.mjs react-tests/platform-provider.test.mjs react-tests/strategy-execution.test.mjs tests/platform-api.test.mjs tests/dingtalk-todo-update.test.mjs`

Expected: all tests PASS.

- [ ] **Step 7: Commit state orchestration**

```bash
git add src/domain/strategyExecution.js functions/api/platform.js tests/platform-api.test.mjs src/state/PlatformProvider.jsx src/state/ProductFlowProvider.jsx react-tests/platform-provider.test.mjs
git commit -m "feat(todo): reconcile and write back personal status"
```

### Task 4: Loopback-only DWS Real Data Preview

**Files:**
- Create: `server/dwsTodoPreview.mjs`
- Modify: `server.mjs`
- Create: `tests/dws-todo-preview.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `dws todo task list --page <n> --size 50 --status <bool> --format json` through `execFile`.
- Produces: `readDwsTodoPreview({ status, execFileImpl })` and local-only GET `/api/dev/dws/todos?status=false`.

- [ ] **Step 1: Write failing parser and route-safety tests**

```js
test("DWS preview normalizes real todo cards without write commands", async () => {
  const calls = [];
  const result = await readDwsTodoPreview({ status: false, execFileImpl: async (file, args) => {
    calls.push({ file, args });
    return { stdout: JSON.stringify({ result: { todoCards: [{ taskId: "real-1", subject: "真实待办", dueTime: 1784304000000, isDone: false }] } }) };
  }});
  assert.equal(result.todos[0].taskId, "real-1");
  assert.deepEqual(calls[0].args.slice(0, 3), ["todo", "task", "list"]);
  assert.equal(calls[0].args.includes("done"), false);
  assert.equal(calls[0].args.includes("update"), false);
});

test("loopback detection rejects non-local remote addresses", () => {
  assert.equal(isLoopbackAddress("127.0.0.1"), true);
  assert.equal(isLoopbackAddress("::1"), true);
  assert.equal(isLoopbackAddress("192.168.1.8"), false);
});
```

- [ ] **Step 2: Run the DWS test and verify RED**

Run: `node --test tests/dws-todo-preview.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `server/dwsTodoPreview.mjs`.

- [ ] **Step 3: Implement command isolation and normalization**

```js
export async function readDwsTodoPreview({ status = false, execFileImpl = execFileAsync } = {}) {
  const { stdout } = await execFileImpl("dws", ["todo", "task", "list", "--page", "1", "--size", "50", "--status", String(Boolean(status)), "--format", "json"], { timeout: 30000, maxBuffer: 2_000_000 });
  const payload = JSON.parse(stdout || "{}");
  const cards = payload.result?.todoCards || payload.todoCards || payload.data?.todoCards || [];
  return { todos: cards.map(normalizeDwsTodoCard), readonly: true, source: "dws-current-account" };
}
```

The server route rejects non-GET methods with 405 and non-loopback `req.socket.remoteAddress` with 403. It never writes the preview into either JSON state file.

```js
if (url.pathname === "/api/dev/dws/todos") {
  if (req.method !== "GET") return json(res, 405, { readonly: true, message: "Method not allowed" });
  if (!isLoopbackAddress(req.socket.remoteAddress)) return json(res, 403, { readonly: true, message: "仅允许本机访问。" });
  try {
    return json(res, 200, await readDwsTodoPreview({ status: url.searchParams.get("status") === "true" }));
  } catch (error) {
    return json(res, 502, { readonly: true, message: error.message || "DWS 待办查询失败。" });
  }
}
```

- [ ] **Step 4: Register and run tests**

Add the new test to `test:api` and run:

`node --test tests/dws-todo-preview.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit the local read-only bridge**

```bash
git add server/dwsTodoPreview.mjs server.mjs tests/dws-todo-preview.test.mjs package.json
git commit -m "feat(dev): add read-only DWS todo preview"
```

### Task 5: Executive Personal Todo Workbench

**Files:**
- Create: `src/features/company/PersonalTodoWorkbench.jsx`
- Create: `src/features/company/DwsTodoPreview.jsx`
- Modify: `src/features/company/CompanyHomePage.jsx`
- Modify: `src/styles.css`
- Modify: `react-tests/platform-ui.test.mjs`

**Interfaces:**
- Consumes: `state.personalTodos`, `currentUser`, `syncPersonalTodo`, `refreshPersonalTodoStatuses`, `setPersonalTodoDone`, and local DWS preview endpoint.
- Produces: executive default segmented view `我的待办｜公司驾驶舱`, grouped/filterable todo rows, sync controls, and a clearly separated read-only real-data panel.

- [ ] **Step 1: Write failing UI contract tests**

```js
test("executive home defaults to the personal todo workbench", () => {
  const home = read("src/features/company/CompanyHomePage.jsx");
  const workbench = read("src/features/company/PersonalTodoWorkbench.jsx");
  assert.match(home, /useState\("todos"\)/);
  assert.match(home, /我的待办/);
  assert.match(home, /公司驾驶舱/);
  assert.match(workbench, /已逾期/);
  assert.match(workbench, /今日截止/);
  assert.match(workbench, /未来 7 天/);
  assert.match(workbench, /刷新钉钉状态/);
});

test("local real-data panel is explicitly read-only and development-only", () => {
  const preview = read("src/features/company/DwsTodoPreview.jsx");
  assert.match(preview, /import\.meta\.env\.DEV/);
  assert.match(preview, /线上钉钉待办（只读测试）/);
  assert.match(preview, /\/api\/dev\/dws\/todos/);
  assert.doesNotMatch(preview, /method:\s*["']POST/);
});
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `node --test react-tests/platform-ui.test.mjs`

Expected: FAIL because the two new components do not exist.

- [ ] **Step 3: Implement the segmented executive home**

Use `const [executiveView, setExecutiveView] = useState("todos")`. Keep the existing cockpit JSX in a `CompanyCockpit` function and render it unchanged when `executiveView === "cockpit"`. The segment labels include the current user’s pending count.

```jsx
const [executiveView, setExecutiveView] = useState("todos");
const myTodos = useMemo(() => personalTodosForUser(state.personalTodos, currentUser), [currentUser, state.personalTodos]);
return <section className="page company-home">
  <div className="company-view-switch" role="tablist" aria-label="公司首页视图">
    <button role="tab" aria-selected={executiveView === "todos"} onClick={() => setExecutiveView("todos")}>我的待办（{myTodos.filter(todo => todo.status === "pending").length}）</button>
    <button role="tab" aria-selected={executiveView === "cockpit"} onClick={() => setExecutiveView("cockpit")}>公司驾驶舱</button>
  </div>
  {executiveView === "todos" ? <PersonalTodoWorkbench todos={myTodos} onNavigate={onNavigate} /> : <CompanyCockpit summary={summary} state={state} onNavigate={onNavigate} />}
</section>;
```

- [ ] **Step 4: Implement grouped rows and guarded actions**

Each row renders source label, project, due date, priority, sync state, open-source action, completion/reopen action, and sync/retry action. The workbench filters by source and project; decision and risk rows that came back done from DingTalk display “待平台确认结论/关闭”.

```jsx
const groups = groupPersonalTodos(filteredTodos, new Date());
return <>
  <button type="button" onClick={refreshPersonalTodoStatuses}>刷新钉钉状态</button>
  {GROUPS.map(group => <section key={group.key} className="personal-todo-group">
    <h2>{group.label}<span>{groups[group.key].length}</span></h2>
    {groups[group.key].map(todo => <TodoRow key={todo.id} todo={todo} onOpen={() => onNavigate(SOURCE_ROUTES[todo.sourceType])} onToggle={() => setPersonalTodoDone(todo.id, todo.status !== "done")} onSync={() => syncPersonalTodo(todo.id)} />)}
  </section>)}
</>;
```

- [ ] **Step 5: Implement the local DWS preview panel**

When `import.meta.env.DEV` is false the component returns `null`. In development it performs GET only after the user expands the panel or clicks refresh, shows count/subject/due/status, and includes this copy:

`真实线上数据，仅用于核对展示字段；不会导入平台，也不会修改钉钉。`

```jsx
export function DwsTodoPreview() {
  const [payload, setPayload] = useState(null);
  if (!import.meta.env.DEV) return null;
  async function load() {
    const response = await fetch("/api/dev/dws/todos?status=false");
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "真实待办读取失败。");
    setPayload(data);
  }
  return <section className="dws-preview-panel"><h2>线上钉钉待办（只读测试）</h2><p>真实线上数据，仅用于核对展示字段；不会导入平台，也不会修改钉钉。</p><button type="button" onClick={load}>读取当前账号</button>{payload ? <DwsPreviewRows todos={payload.todos} /> : null}</section>;
}
```

- [ ] **Step 6: Add responsive styles and run UI tests**

Append namespaced `.personal-todo-*` and `.dws-preview-*` rules; do not rewrite unrelated existing styles. Run:

`node --test react-tests/platform-ui.test.mjs react-tests/react-app.test.mjs`

Expected: all tests PASS.

- [ ] **Step 7: Commit the workbench**

```bash
git add src/features/company/PersonalTodoWorkbench.jsx src/features/company/DwsTodoPreview.jsx src/features/company/CompanyHomePage.jsx src/styles.css react-tests/platform-ui.test.mjs
git commit -m "feat(todo): add executive personal workbench"
```

### Task 6: Real-data and Full Regression Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-07-16-executive-personal-todo-dingtalk-sync-design.md` only if observed real payload fields require a documented mapping correction.

**Interfaces:**
- Consumes: completed local app, loopback DWS endpoint, browser, full automated suite.
- Produces: verification evidence without changing any existing online todo.

- [ ] **Step 1: Run the complete automated suite**

Run: `npm test`

Expected: all React and API tests PASS with zero failures.

- [ ] **Step 2: Build the production bundle**

Run: `npm run build`

Expected: Vite build succeeds; no production Pages Function exists for `/api/dev/dws/todos`.

- [ ] **Step 3: Query the local read-only endpoint with real online data**

Run: `curl --fail --silent 'http://127.0.0.1:8127/api/dev/dws/todos?status=false'`

Expected: `{ "readonly": true, "source": "dws-current-account", "todos": [...] }`; do not print subjects in the final handoff, only counts and field coverage.

- [ ] **Step 4: Verify the page in the in-app browser**

Open `http://127.0.0.1:8134/`, confirm the executive home defaults to “我的待办”, switches back to the unchanged cockpit, groups/filter/actions render, and the DWS panel is visibly read-only.

- [ ] **Step 5: Verify there are no writes to online DingTalk data**

Inspect the local bridge command log/test and confirm it only invoked `dws todo task list`. No `create`, `update`, `done`, or `delete` DWS commands are permitted in this phase.

- [ ] **Step 6: Record the prelaunch live-sync gate**

Before deployment, use newly created `strategy-platform:` test todos to validate create/update/complete/reopen and safe decision/risk behavior through the official API. Existing personal todos remain out of scope and untouched.
