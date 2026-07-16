import test from "node:test";
import assert from "node:assert/strict";
import { listDingTodoTasks } from "../functions/api/dingtalk/_shared/dingtalk.js";
import { onRequest } from "../functions/api/dingtalk/todo/list.js";

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
  assert.match(calls[0].url, /\/v1\.0\/todo\/users\/union-zhou\/tasks/);
  assert.match(calls[0].url, /isDone=true/);
  assert.match(calls[1].url, /nextToken=next-1/);
  assert.equal(calls.every(call => call.options.method === "GET"), true);
});

test("DingTalk todo list rejects missing identity", async () => {
  await assert.rejects(() => listDingTodoTasks("token", ""), /unionId/);
});

test("todo list endpoint ignores client identity and queries the signed-in user", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), options });
    if (String(url).includes("/gettoken")) return okJson({ errcode: 0, access_token: "access-token" });
    const done = String(url).includes("isDone=true");
    return okJson({ todoCards: [{ taskId: done ? "done-1" : "pending-1", isDone: done }], nextToken: "" });
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
    const todoCalls = calls.filter(call => call.url.includes("/v1.0/todo/"));
    assert.equal(todoCalls.length, 2);
    assert.equal(todoCalls.every(call => call.url.includes("/users/union-session/tasks")), true);
    assert.equal(todoCalls.some(call => call.url.includes("union-attacker")), false);
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
