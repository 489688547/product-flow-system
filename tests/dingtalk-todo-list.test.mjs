import test from "node:test";
import assert from "node:assert/strict";
import {
  listDingPersonalTodoTasks,
  listDingTodoTasks
} from "../functions/api/dingtalk/_shared/dingtalk.js";
import { collectDingTodoCards, onRequest } from "../functions/api/dingtalk/todo/list.js";

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

test("todo list endpoint ignores client identity and queries the signed-in user", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let activeTodoCalls = 0;
  let peakTodoCalls = 0;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/gettoken")) return okJson({ errcode: 0, access_token: "access-token" });
    activeTodoCalls += 1;
    peakTodoCalls = Math.max(peakTodoCalls, activeTodoCalls);
    await Promise.resolve();
    const done = JSON.parse(options.body || "{}").isDone === true;
    const response = okJson({
      todoCards: [{ taskId: done ? "done-1" : "pending-1", finalStatusStage: done ? 2 : 0 }],
      nextToken: ""
    });
    activeTodoCalls -= 1;
    return response;
  };
  try {
    const response = await onRequest({
      request: new Request("https://flow.example.com/api/dingtalk/todo/list?unionId=union-attacker"),
      env: { DINGTALK_APP_KEY: "key", DINGTALK_APP_SECRET: "secret" },
      data: { session: { unionId: "union-session", name: "周总" } }
    });
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.synced, true);
    assert.deepEqual(body.todos.map(item => item.taskId).sort(), ["done-1", "pending-1"]);
    assert.equal(body.todos.find(item => item.taskId === "done-1").isDone, true);
    assert.equal(body.todos.find(item => item.taskId === "pending-1").isDone, false);
    const todoCalls = calls.filter(call => call.url.includes("/v1.0/todo/"));
    assert.equal(todoCalls.length, 2);
    assert.equal(todoCalls.every(call => call.url.includes("/users/union-session/org/tasks/query")), true);
    assert.equal(todoCalls.every(call => call.options.method === "POST"), true);
    assert.equal(todoCalls.some(call => call.url.includes("union-attacker")), false);
    assert.equal(peakTodoCalls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
