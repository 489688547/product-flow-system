import test from "node:test";
import assert from "node:assert/strict";
import {
  getDingTodoTask,
  listDingPersonalTodoTasks,
  listDingTodoTasks
} from "../functions/api/dingtalk/_shared/dingtalk.js";
import {
  buildBoundTodoQueries,
  collectDingTodoCards,
  loadBoundTaskDetails,
  onRequest
} from "../functions/api/dingtalk/todo/list.js";

function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}

test("DingTalk todo list uses the requested union id and paginates", async () => {
  const calls = [];
  const todos = await listDingTodoTasks("token", "union-zhou", {
    isDone: true,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return okJson(calls.length === 1
        ? { todoCards: [{ taskId: "d1", isDone: true }], nextToken: "next-1" }
        : { todoCards: [{ taskId: "d2", isDone: true }], nextToken: "" });
    }
  });

  assert.deepEqual(todos.map(item => item.taskId), ["d1", "d2"]);
  assert.match(calls[0].url, /\/v1\.0\/todo\/users\/union-zhou\/org\/tasks\/query$/);
  assert.deepEqual(JSON.parse(calls[0].options.body), { isDone: true });
  assert.deepEqual(JSON.parse(calls[1].options.body), { isDone: true, nextToken: "next-1" });
  assert.equal(calls.every(call => call.options.method === "POST"), true);
});

test("DingTalk todo list bounds pagination and normalizes the requested completion state", async () => {
  const calls = [];
  const todos = await listDingTodoTasks("token", "union-zhou", {
    isDone: true,
    maxPages: 2,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return okJson({
        todoCards: [{ taskId: `done-${calls.length}`, finalStatusStage: 2 }],
        nextToken: `next-${calls.length}`
      });
    }
  });

  assert.equal(calls.length, 2);
  assert.deepEqual(todos.map(item => item.taskId), ["done-1", "done-2"]);
  assert.equal(todos.every(item => item.isDone === true), true);
});

test("DingTalk work todo list resumes from the supplied cursor", async () => {
  const calls = [];
  const todos = await listDingTodoTasks("token", "union-zhou", {
    isDone: false,
    maxPages: 1,
    nextToken: "cursor-2",
    fetchImpl: async (url, options) => {
      calls.push(JSON.parse(options.body));
      return okJson({ todoCards: [{ taskId: "later-work" }], nextToken: "cursor-3" });
    }
  });

  assert.deepEqual(calls[0], { isDone: false, nextToken: "cursor-2" });
  assert.equal(todos.nextToken, "cursor-3");
  assert.equal(todos.truncated, true);
});

test("DingTalk todo list rejects missing identity", async () => {
  await assert.rejects(() => listDingTodoTasks("token", ""), /unionId/);
});

test("DingTalk reads one bound native personal todo through its task id", async () => {
  const calls = [];
  const todo = await getDingTodoTask("token", "union-zhou", "task-personal-1", {
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return okJson({
        id: "task-personal-1",
        subject: "原生个人待办",
        done: true,
        modifiedTime: 1785213000000
      });
    }
  });

  assert.equal(todo.taskId, "task-personal-1");
  assert.equal(todo.isDone, true);
  assert.equal(todo.source, "todo_personal_user");
  assert.equal(todo.subject, "原生个人待办");
  assert.match(calls[0].url, /\/v1\.0\/todo\/users\/union-zhou\/tasks\/task-personal-1$/);
  assert.equal(calls[0].options.method, "GET");
});

test("personal todo list reads native completion state through the DingTalk todo MCP", async () => {
  const calls = [];
  const todos = await listDingPersonalTodoTasks("user-token", {
    isDone: true,
    maxPages: 2,
    fetchImpl: async (url, options) => {
      calls.push({ url, options, body: JSON.parse(options.body) });
      return okJson({
        result: {
          structuredContent: {
            result: {
              hasMore: calls.length === 1,
              todoCards: [{ taskId: `personal-${calls.length}`, finalStatusStage: 2 }]
            },
            success: true
          }
        }
      });
    }
  });

  assert.deepEqual(todos.map(item => item.taskId), ["personal-1", "personal-2"]);
  assert.equal(todos.every(item => item.isDone === true), true);
  assert.equal(todos.every(item => item.source === "todo_personal_user"), true);
  assert.equal(calls.length, 2);
  assert.match(calls[0].url, /mcp-gw\.dingtalk\.com\/server\/0f51140e/);
  assert.equal(calls[0].body.params.name, "get_user_todos_in_current_org");
  assert.deepEqual(calls[0].body.params.arguments, {
    isDone: "true",
    todoStatus: "true",
    pageNum: "1",
    pageSize: "20"
  });
  assert.equal(calls[0].options.headers["x-user-access-token"], "user-token");
});

test("personal todo list rotates beyond the first two pages", async () => {
  const calls = [];
  const todos = await listDingPersonalTodoTasks("user-token", {
    isDone: false,
    maxPages: 2,
    startPage: 3,
    fetchImpl: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push(body.params.arguments.pageNum);
      return okJson({
        result: {
          structuredContent: {
            result: {
              hasMore: true,
              todoCards: [{ taskId: `personal-${body.params.arguments.pageNum}` }]
            }
          }
        }
      });
    }
  });

  assert.deepEqual(calls, ["3", "4"]);
  assert.deepEqual(todos.map(item => item.taskId), ["personal-3", "personal-4"]);
  assert.equal(todos.nextPage, 5);
  assert.equal(todos.truncated, true);
});

test("personal todo collection remains available when the legacy work lane fails", async () => {
  const result = await collectDingTodoCards({
    personalAuthorized: true,
    loadPersonal: async () => ({
      cards: [{ taskId: "personal-1", isDone: true }],
      truncated: true
    }),
    loadWork: async () => {
      const error = new Error("provider payload must stay private");
      error.status = 429;
      error.detail = { raw: "private" };
      throw error;
    }
  });

  assert.deepEqual(result.todos.map(todo => todo.taskId), ["personal-1"]);
  assert.equal(result.coverage.personal.ok, true);
  assert.equal(result.coverage.personal.truncated, true);
  assert.equal(result.coverage.work.ok, false);
  assert.deepEqual(result.warnings.map(item => item.code), [
    "DINGTALK_RESULTS_TRUNCATED",
    "DINGTALK_RATE_LIMITED"
  ]);
  assert.doesNotMatch(JSON.stringify(result), /provider payload|private/);
});

test("personal todo collection exposes reauthorization instead of silently disabling sync", async () => {
  const result = await collectDingTodoCards({
    personalAuthorized: false,
    loadWork: async () => ({ cards: [], truncated: false })
  });

  assert.equal(result.coverage.personal.authorized, false);
  assert.equal(result.warnings[0].code, "DINGTALK_USER_AUTH_REQUIRED");
});

test("personal todo collection converts provider token expiry into reauthorization", async () => {
  const result = await collectDingTodoCards({
    personalAuthorized: true,
    loadPersonal: async () => {
      const error = new Error("raw provider token detail");
      error.status = 401;
      error.detail = { raw: "private" };
      throw error;
    },
    loadWork: async () => ({ cards: [{ taskId: "work-1" }], truncated: false })
  });

  assert.deepEqual(result.todos.map(todo => todo.taskId), ["work-1"]);
  assert.equal(result.coverage.personal.authorized, false);
  assert.equal(result.warnings[0].code, "DINGTALK_USER_AUTH_REQUIRED");
  assert.doesNotMatch(JSON.stringify(result), /raw provider|private/);
});

test("bound todo queries read every ordinary executor and exclude the product manager", () => {
  const state = {
    products: [{ id: "p1", productManagerUnionId: "manager-1" }],
    tasks: [{
      id: "t1",
      productId: "p1",
      dingTodo: {
        id: "todo-1",
        creatorUnionId: "creator-1",
        executorUnionIds: ["executor-1", "manager-1", "executor-2", "executor-1"]
      }
    }]
  };

  assert.deepEqual(buildBoundTodoQueries(state, ["todo-1"], "manager-1"), [
    { taskId: "todo-1", executorUnionId: "executor-1" },
    { taskId: "todo-1", executorUnionId: "executor-2" }
  ]);
  assert.deepEqual(buildBoundTodoQueries(state, ["todo-1"], "attacker"), []);
});

test("bound todo detail loading aggregates per-person completion with bounded concurrency", async () => {
  let active = 0;
  let peak = 0;
  const result = await loadBoundTaskDetails("token", [
    { taskId: "todo-1", executorUnionId: "executor-1" },
    { taskId: "todo-1", executorUnionId: "executor-2" },
    { taskId: "todo-1", executorUnionId: "executor-3" },
    { taskId: "todo-1", executorUnionId: "executor-4" },
    { taskId: "todo-1", executorUnionId: "executor-5" }
  ], async (accessToken, unionId, taskId) => {
    active += 1;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active -= 1;
    return { taskId, subject: "多人待办", isDone: unionId.endsWith("1") };
  });

  assert.equal(peak <= 4, true);
  assert.deepEqual(result.cards[0].executorStatuses, [
    { unionId: "executor-1", isDone: true },
    { unionId: "executor-2", isDone: false },
    { unionId: "executor-3", isDone: false },
    { unionId: "executor-4", isDone: false },
    { unionId: "executor-5", isDone: false }
  ]);
  assert.deepEqual(result.cards[0].executorStatusCoverage, {
    complete: true,
    expectedCount: 5,
    statusCount: 5
  });
});

test("todo list endpoint requires a session union id", async () => {
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/dingtalk/todo/list"),
    env: {},
    data: { session: { name: "本地账号" } }
  });
  assert.equal(response.status, 400);
  assert.match((await response.json()).message, /unionId/);
});

test("bound todo detail loading marks partial coverage without exposing provider errors", async () => {
  const result = await loadBoundTaskDetails("token", [
    { taskId: "todo-1", executorUnionId: "executor-1" },
    { taskId: "todo-1", executorUnionId: "executor-2" }
  ], async (accessToken, unionId, taskId) => {
    if (unionId === "executor-2") throw new Error("private provider detail");
    return { taskId, isDone: true };
  });

  assert.equal(result.cards[0].executorStatusCoverage.complete, false);
  assert.equal(result.cards[0].executorStatusCoverage.statusCount, 1);
  assert.equal(result.warning.code, "DINGTALK_EXECUTOR_STATUS_PARTIAL");
  assert.doesNotMatch(JSON.stringify(result), /private provider detail/);
});
