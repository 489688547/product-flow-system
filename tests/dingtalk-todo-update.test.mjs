import test from "node:test";
import assert from "node:assert/strict";
import { syncDingTodoTask, updateDingTodoTask } from "../functions/api/dingtalk/_shared/dingtalk.js";

function okJson(body) {
  return { ok: true, json: async () => body };
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
