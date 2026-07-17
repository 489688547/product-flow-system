import test from "node:test";
import assert from "node:assert/strict";
import { syncDingTodoTask, updateDingTodoTask } from "../functions/api/dingtalk/_shared/dingtalk.js";

function okJson(body) {
  return { ok: true, json: async () => body };
}

function errorJson(status, body) {
  return { ok: false, status, json: async () => body };
}

test("updateDingTodoTask keeps the DingTalk task id and updates task state", async () => {
  const calls = [];
  const result = await updateDingTodoTask("token-1", {
    todoId: "todo-1",
    creatorUnionId: "creator-union",
    executorUnionIds: ["executor-union"],
    subject: "更新后的任务",
    description: "产品任务",
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

test("syncDingTodoTask preserves the duplicate error when the source task cannot be found", async () => {
  const calls = [];
  await assert.rejects(
    () => syncDingTodoTask("token-1", {
      creatorUnionId: "creator-union",
      executorUnionIds: ["executor-union"],
      sourceId: "task:p1:missing",
      subject: "整理 PRD",
      detailUrl: "https://flow.example.com/#progress",
      dueTime: 1784301600000
    }, async (url, options) => {
      calls.push({ url, options });
      if (options.method === "POST" && !url.endsWith("/org/tasks/query")) {
        return errorJson(400, { message: "task existed sourceId is task:p1:missing" });
      }
      return okJson({ todoCards: [] });
    }),
    /task existed sourceId/
  );
  assert.deepEqual(calls.map(call => call.options.method), ["POST", "POST", "POST"]);
});
