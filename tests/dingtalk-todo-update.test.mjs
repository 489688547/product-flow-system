import test from "node:test";
import assert from "node:assert/strict";
import { syncDingTodoTask, updateDingTodoTask } from "../functions/api/dingtalk/_shared/dingtalk.js";
import { authorizeTaskTodoSyncRequest, onRequest as syncTodoRoute } from "../functions/api/dingtalk/todo/sync.js";

function okJson(body) {
  return { ok: true, json: async () => body };
}

function errorJson(status, body) {
  return { ok: false, status, json: async () => body };
}

test("todo sync authorization binds the actor and todo id to session-backed task state", () => {
  const state = {
    products: [{ id: "p1", productManagerUnionId: "owner-union" }],
    tasks: [{ id: "t1", productId: "p1", dingTodo: { id: "todo-state" } }]
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
    { part_key: "tasks", part_index: 0, payload: JSON.stringify([{ id: "t1", productId: "p1", dingTodo: { id: "todo-state" } }]), updated_at: "2026-07-18", updated_by: "产品负责人" }
  ];
  const db = {
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
  assert.equal(calls[0].body.priority, 40);
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
