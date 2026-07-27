import test from "node:test";
import assert from "node:assert/strict";
import { syncDingTodoTask, updateDingTodoTask } from "../functions/api/dingtalk/_shared/dingtalk.js";
import {
  authorizeTaskTodoSyncRequest,
  onRequest as syncTodoRoute,
  persistTaskTodoSyncResult,
  safeDingTalkError
} from "../functions/api/dingtalk/todo/sync.js";

function okJson(body) {
  return { ok: true, json: async () => body };
}

function errorJson(status, body) {
  return { ok: false, status, json: async () => body };
}

test("todo sync maps provider authorization expiry to a safe re-login response", () => {
  const error = new Error("raw provider credential detail");
  error.status = 401;
  error.detail = { response: "private token response" };
  const result = safeDingTalkError(error, "同步失败");

  assert.equal(result.status, 401);
  assert.equal(result.body.code, "DINGTALK_USER_AUTH_REQUIRED");
  assert.equal(result.body.message, "请重新使用钉钉登录后再同步待办。");
  assert.equal(result.body.retryable, true);
  assert.doesNotMatch(JSON.stringify(result), /raw provider|private token/);
});

test("todo sync persists the provider result server-side and retries one shared-state conflict", async () => {
  const original = {
    version: "test",
    products: [{ id: "p1" }],
    tasks: [{
      id: "t1",
      productId: "p1",
      title: "整理 PRD",
      due: "2026-07-27",
      done: false,
      ownerDept: "产品部",
      deliverable: "PRD"
    }],
    orgCache: {
      users: [{ unionid: "executor-union", name: "周荣庆" }]
    }
  };
  const latest = {
    ...original,
    currentId: "p2",
    products: [...original.products, { id: "p2", name: "并发新增产品" }]
  };
  const reads = [
    { state: original, version: "test", updatedAt: "2026-07-27T09:00:00.000Z" },
    { state: latest, version: "test", updatedAt: "2026-07-27T09:00:01.000Z" }
  ];
  const writes = [];

  const saved = await persistTaskTodoSyncResult({
    db: {},
    sourceId: "task:p1:t1",
    payload: {
      sourceId: "task:p1:t1",
      creatorUnionId: "creator-union",
      executorUnionIds: ["executor-union"],
      draft: {
        subject: "产品 PRD 同步",
        descriptionHtml: "<p>正文</p>",
        priority: 30,
        dueDate: "2026-07-28",
        dueClock: "18:00"
      }
    },
    todo: {
      id: "todo-real-1",
      sourceId: "task:p1:t1",
      source: "todo_personal_user",
      creatorUnionId: "creator-union"
    },
    session: { name: "周荣庆" },
    syncedAt: "2026-07-27T09:01:00.000Z",
    readState: async () => reads.shift(),
    writeBinding: async ({ state, stored, session }) => {
      writes.push({
        state,
        updatedBy: session.name,
        options: { baseUpdatedAt: stored.updatedAt }
      });
      if (writes.length === 1) {
        const error = new Error("conflict");
        error.status = 409;
        error.code = "SHARED_STATE_VERSION_CONFLICT";
        throw error;
      }
      return { version: "test", updatedAt: "2026-07-27T09:01:00.001Z" };
    }
  });

  assert.equal(writes.length, 2);
  assert.equal(writes[1].options.baseUpdatedAt, "2026-07-27T09:00:01.000Z");
  assert.equal(writes[1].state.currentId, "p2");
  assert.equal(writes[1].state.products.length, 2);
  assert.equal(saved.task.due, "2026-07-28");
  assert.equal(saved.task.dingTodo.id, "todo-real-1");
  assert.equal(saved.task.dingTodo.source, "todo_personal_user");
  assert.equal(saved.task.dingTodo.creatorUnionId, "creator-union");
  assert.deepEqual(saved.task.dingTodo.executorNames, ["周荣庆"]);
  assert.equal(saved.updatedAt, "2026-07-27T09:01:00.001Z");
});

test("todo sync reports a binding conflict instead of claiming success after repeated state conflicts", async () => {
  const state = {
    version: "test",
    products: [{ id: "p1" }],
    tasks: [{ id: "t1", productId: "p1", title: "整理 PRD", due: "2026-07-27", done: false }],
    orgCache: { users: [] }
  };
  let attempts = 0;

  await assert.rejects(
    persistTaskTodoSyncResult({
      db: {},
      sourceId: "task:p1:t1",
      payload: {
        sourceId: "task:p1:t1",
        creatorUnionId: "creator-union",
        executorUnionIds: ["creator-union"],
        draft: { subject: "整理 PRD", dueDate: "2026-07-27" }
      },
      todo: { id: "todo-real-1", sourceId: "task:p1:t1", source: "todo_personal_user" },
      session: { name: "周荣庆" },
      readState: async () => ({
        state,
        version: "test",
        updatedAt: `2026-07-27T09:00:0${attempts}.000Z`
      }),
      writeBinding: async () => {
        attempts += 1;
        const error = new Error("conflict");
        error.status = 409;
        error.code = "SHARED_STATE_VERSION_CONFLICT";
        throw error;
      },
      maxAttempts: 2
    }),
    error => {
      assert.equal(error.code, "DINGTALK_TODO_BINDING_CONFLICT");
      assert.equal(error.todoId, "todo-real-1");
      assert.equal(error.retryable, true);
      return true;
    }
  );
  assert.equal(attempts, 2);
});

test("todo sync authorization binds the actor and todo id to session-backed task state", () => {
  const state = {
    products: [{ id: "p1", productManagerUnionId: "owner-union" }],
    tasks: [{ id: "t1", productId: "p1", dingTodo: { id: "todo-state", sourceId: "task:p1:t1" } }]
  };
  const input = {
    sourceId: "task:p1:t1",
    todoId: "todo-state",
    creatorUnionId: "forged-creator",
    resourceUnionId: "forged-resource",
    operatorUnionId: "forged-operator",
    executorUnionIds: ["executor-union"],
    recoveryUnionIds: ["forged-recovery"]
  };
  const authorized = authorizeTaskTodoSyncRequest(input, {
    unionId: "session-union",
    role: "product"
  }, state);

  assert.equal(authorized.creatorUnionId, "session-union");
  assert.equal(authorized.todoId, "todo-state");
  assert.equal("resourceUnionId" in authorized, false);
  assert.equal("operatorUnionId" in authorized, false);
  assert.deepEqual(authorized.recoveryUnionIds, ["owner-union"]);
  assert.throws(() => authorizeTaskTodoSyncRequest({ ...input, todoId: "todo-other" }, { unionId: "session-union", role: "product" }, state), /待办 ID/);
});

test("todo sync authorization does not reuse an unverified legacy todo id", () => {
  const state = {
    products: [{ id: "p1" }],
    tasks: [{ id: "t1", productId: "p1", dingTodo: { id: "legacy-teambition-id" } }]
  };
  const authorized = authorizeTaskTodoSyncRequest({
    sourceId: "task:p1:t1",
    executorUnionIds: ["executor-union"]
  }, { unionId: "session-union", role: "product" }, state);

  assert.equal(authorized.todoId, "");
});

test("todo sync authorization reuses only a controlled recovery source for the same task", () => {
  const state = {
    products: [{ id: "p1" }],
    tasks: [{ id: "t1", productId: "p1", dingTodo: { id: "recovered-id", sourceId: "task:p1:t1:r1" } }]
  };
  const authorized = authorizeTaskTodoSyncRequest({
    sourceId: "task:p1:t1",
    todoId: "recovered-id",
    executorUnionIds: ["executor-union"]
  }, { unionId: "session-union", role: "product" }, state);

  assert.equal(authorized.todoId, "recovered-id");
});

test("personal todo updates are restricted to the server-recorded creator", () => {
  const baseState = {
    products: [{ id: "p1" }],
    tasks: [{
      id: "t1",
      productId: "p1",
      dingTodo: {
        id: "personal-id",
        sourceId: "task:p1:t1",
        source: "todo_personal_user",
        creatorUnionId: "creator-union"
      }
    }]
  };
  const input = {
    sourceId: "task:p1:t1",
    todoId: "personal-id",
    executorUnionIds: ["executor-union"]
  };

  assert.equal(
    authorizeTaskTodoSyncRequest(input, { unionId: "creator-union", role: "product" }, baseState).todoId,
    "personal-id"
  );
  assert.throws(
    () => authorizeTaskTodoSyncRequest(input, { unionId: "other-union", role: "product" }, baseState),
    /只有.*创建人/
  );
  const missingOwnerState = {
    ...baseState,
    tasks: [{ ...baseState.tasks[0], dingTodo: { ...baseState.tasks[0].dingTodo, creatorUnionId: "" } }]
  };
  assert.throws(() => authorizeTaskTodoSyncRequest(
    input,
    { unionId: "creator-union", role: "product" },
    missingOwnerState
  ), /缺少创建人/);

  const replaceableState = {
    products: [{ id: "p1", productManagerUnionId: "manager-union" }],
    tasks: [{
      ...baseState.tasks[0],
      dingTodo: {
        ...baseState.tasks[0].dingTodo,
        creatorUnionId: "",
        executorUnionIds: ["executor-union"]
      }
    }]
  };
  const replacement = authorizeTaskTodoSyncRequest(
    input,
    { unionId: "manager-union", role: "product" },
    replaceableState
  );
  assert.equal(replacement.todoId, "");
  assert.equal(replacement.replacementOfTodoId, "personal-id");
  assert.equal(replacement.sourceId, "task:p1:t1:r1");
});

test("todo sync authorization rejects readonly, missing, and forged task sources", () => {
  const state = { products: [{ id: "p1" }], tasks: [{ id: "t1", productId: "p1" }] };
  const input = { sourceId: "task:p1:t1", executorUnionIds: ["executor-union"] };
  assert.throws(() => authorizeTaskTodoSyncRequest(input, { unionId: "u1", role: "readonly" }, state), /只读/);
  assert.throws(() => authorizeTaskTodoSyncRequest({ ...input, sourceId: "task:p1:t2" }, { unionId: "u1", role: "product" }, state), /不存在/);
  assert.throws(() => authorizeTaskTodoSyncRequest({ ...input, todoId: "todo-forged" }, { unionId: "u1", role: "product" }, state), /待办 ID/);
});

test("todo sync route uses the signed-in actor and the server-stored todo id", async () => {
  const parts = [
    { part_key: "version", part_index: 0, payload: JSON.stringify("test"), updated_at: "2026-07-18", updated_by: "产品负责人" },
    { part_key: "products", part_index: 0, payload: JSON.stringify([{ id: "p1", productManagerUnionId: "owner-union" }]), updated_at: "2026-07-18", updated_by: "产品负责人" },
    { part_key: "tasks", part_index: 0, payload: JSON.stringify([{ id: "t1", productId: "p1", dingTodo: { id: "todo-state", sourceId: "task:p1:t1" } }]), updated_at: "2026-07-18", updated_by: "产品负责人" },
    ...["demands", "deliverables", "reviews", "feedbackIssues", "productPlans"].map(part_key => ({
      part_key,
      part_index: 0,
      payload: "[]",
      updated_at: "2026-07-18",
      updated_by: "产品负责人"
    }))
  ];
  const db = {
    async batch() {
      return [{ success: true, meta: { changes: 1 } }];
    },
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() { return { success: true }; },
        async all() { return { results: parts }; },
        async first() { return null; }
      };
      return statement;
    }
  };
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/gettoken")) return okJson({ errcode: 0, access_token: "token-1" });
    return okJson({ result: true });
  };
  try {
    const response = await syncTodoRoute({
      request: new Request("https://flow.example.com/api/dingtalk/todo/sync", {
        method: "POST",
        body: JSON.stringify({
          sourceId: "task:p1:t1",
          todoId: "todo-state",
          creatorUnionId: "forged-creator",
          executorUnionIds: ["executor-union"],
          subject: "任务",
          dueTime: 1784301600000
        })
      }),
      env: { PRODUCT_FLOW_DB: db, DINGTALK_APP_KEY: "key", DINGTALK_APP_SECRET: "secret" },
      data: { session: { unionId: "session-union", role: "product" } }
    });
    assert.equal(response.status, 200);
    const todoCall = calls.find(call => call.options.method === "PUT");
    assert.match(todoCall.url, /\/users\/session-union\/tasks\/todo-state\?operatorId=session-union$/);
    assert.doesNotMatch(todoCall.url, /forged-creator/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("updateDingTodoTask keeps the DingTalk task id and updates task state", async () => {
  const calls = [];
  const result = await updateDingTodoTask("token-1", {
    todoId: "todo-1",
    creatorUnionId: "creator-union",
    executorUnionIds: ["executor-union"],
    subject: "更新后的任务",
    description: "产品任务",
    priority: 40,
    dueTime: 1783850400000,
    done: true
  }, async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return okJson({ result: true });
  });

  assert.equal(result.id, "todo-1");
  assert.equal(result.updated, true);
  assert.equal(calls[0].options.method, "PUT");
  assert.match(calls[0].url, /\/v1\.0\/todo\/users\/creator-union\/tasks\/todo-1\?operatorId=creator-union$/);
  assert.equal(calls[0].body.done, true);
  assert.equal("priority" in calls[0].body, false);
  assert.deepEqual(calls[0].body.executorIds, ["executor-union"]);
});

test("syncDingTodoTask creates once and updates when a DingTalk id exists", async () => {
  const calls = [];
  const base = {
    creatorUnionId: "creator-union",
    executorUnionIds: ["executor-union"],
    sourceId: "task:p1:t1",
    subject: "整理 PRD",
    detailUrl: "https://flow.example.com/#progress",
    dueTime: 1783850400000,
    done: false
  };
  await syncDingTodoTask("token-1", base, async (url, options) => {
    calls.push({ url, options });
    return okJson({ id: "todo-created" });
  });
  await syncDingTodoTask("token-1", { ...base, todoId: "todo-created" }, async (url, options) => {
    calls.push({ url, options });
    return okJson({ result: true });
  });

  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[1].options.method, "PUT");
});

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
    if (options.method === "POST" && !url.endsWith("/org/tasks/query")) {
      return errorJson(400, {
        code: "todo.taskCreate.paramError",
        message: "task existed sourceId is task:p1:t1"
      });
    }
    if (options.method === "POST") {
      return okJson({ todoCards: [{ id: "todo-existing", sourceId: "task:p1:t1" }] });
    }
    return okJson({ result: true });
  });

  assert.equal(result.id, "todo-existing");
  assert.equal(result.recovered, true);
  assert.match(calls[1].url, /\/v1\.0\/todo\/users\/creator-union\/org\/tasks\/query$/);
  assert.deepEqual(JSON.parse(calls[1].options.body), { isDone: false });
  assert.deepEqual(calls.map(call => call.options.method), ["POST", "POST", "PUT"]);
});

test("syncDingTodoTask also recovers a completed task with the same sourceId", async () => {
  const calls = [];
  const result = await syncDingTodoTask("token-1", {
    creatorUnionId: "creator-union",
    executorUnionIds: ["executor-union"],
    sourceId: "task:p1:done",
    subject: "已完成任务",
    detailUrl: "https://flow.example.com/#progress",
    dueTime: 1784301600000,
    done: true
  }, async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST" && !url.endsWith("/org/tasks/query")) {
      return errorJson(400, { message: "task existed sourceId is task:p1:done" });
    }
    if (options.method === "POST" && JSON.parse(options.body).isDone === false) return okJson({ todoCards: [] });
    if (options.method === "POST") return okJson({ todoCards: [{ todoTaskId: "todo-done", sourceId: "task:p1:done" }] });
    return okJson({ result: true });
  });

  assert.equal(result.id, "todo-done");
  assert.equal(result.recovered, true);
  assert.deepEqual(calls.map(call => call.options.method), ["POST", "POST", "POST", "PUT"]);
});

test("syncDingTodoTask recovers a task owned by an additional recovery user", async () => {
  const calls = [];
  const result = await syncDingTodoTask("token-1", {
    creatorUnionId: "current-union",
    executorUnionIds: ["current-union"],
    recoveryUnionIds: ["owner-union"],
    sourceId: "task:p1:owner",
    subject: "立项PRD同步",
    detailUrl: "https://flow.example.com/#progress",
    dueTime: 1784301600000,
    done: false
  }, async (url, options) => {
    calls.push({ url, options });
    if (!url.endsWith("/org/tasks/query") && options.method === "POST") {
      return errorJson(400, { message: "task existed sourceId is task:p1:owner" });
    }
    if (url.includes("/users/owner-union/org/tasks/query") && JSON.parse(options.body).isDone === false) {
      return okJson({ todoCards: [{ taskId: "todo-owner", sourceId: "task:p1:owner" }] });
    }
    if (url.endsWith("/tasks/todo-owner?operatorId=owner-union")) return okJson({ result: true });
    return okJson({ todoCards: [] });
  });

  assert.equal(result.id, "todo-owner");
  assert.equal(result.recovered, true);
  assert.equal(calls.some(call => call.url.includes("/users/owner-union/org/tasks/query")), true);
  assert.equal(calls.at(-1).options.method, "PUT");
  assert.match(calls.at(-1).url, /\/users\/owner-union\/tasks\/todo-owner\?operatorId=owner-union$/);
});

test("syncDingTodoTask does not query todos for unrelated DingTalk errors", async () => {
  const calls = [];
  await assert.rejects(
    () => syncDingTodoTask("token-1", {
      creatorUnionId: "creator-union",
      executorUnionIds: ["executor-union"],
      sourceId: "task:p1:t1",
      subject: "整理 PRD",
      detailUrl: "https://flow.example.com/#progress",
      dueTime: 1784301600000
    }, async (url, options) => {
      calls.push({ url, options });
      return errorJson(403, { code: "Forbidden", message: "permission denied" });
    }),
    /permission denied/
  );
  assert.deepEqual(calls.map(call => call.options.method), ["POST"]);
});

test("syncDingTodoTask creates one deterministic replacement when the original source is orphaned", async () => {
  const calls = [];
  const result = await syncDingTodoTask("token-1", {
      creatorUnionId: "creator-union",
      executorUnionIds: ["executor-union"],
      sourceId: "task:p1:missing",
      subject: "整理 PRD",
      detailUrl: "https://flow.example.com/#progress",
      dueTime: 1784301600000
    }, async (url, options) => {
      calls.push({ url, options });
      if (options.method === "POST" && !url.endsWith("/org/tasks/query")) {
        const body = JSON.parse(options.body);
        if (body.sourceId === "task:p1:missing") {
          return errorJson(400, { message: "task existed sourceId is task:p1:missing" });
        }
        return okJson({ id: "todo-replacement" });
      }
      return okJson({ todoCards: [] });
    });

  assert.equal(result.id, "todo-replacement");
  assert.equal(result.recovered, true);
  assert.equal(result.replacedOrphanedSource, true);
  assert.equal(JSON.parse(calls.at(-1).options.body).sourceId, "task:p1:missing:r1");
  assert.deepEqual(calls.map(call => call.options.method), ["POST", "POST", "POST", "POST", "POST", "POST"]);
});
