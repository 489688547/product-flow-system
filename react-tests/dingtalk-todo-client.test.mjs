import test from "node:test";
import assert from "node:assert/strict";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value))
  };
}

async function freshClient() {
  globalThis.window = { localStorage: memoryStorage() };
  return import(new URL(`../src/state/dingTalkTodoClient.js?test=${Date.now()}-${Math.random()}`, import.meta.url));
}

function okJson(body) {
  return { ok: true, status: 200, json: async () => body };
}

test("todo client keeps available work cards when personal authorization needs renewal", async () => {
  const { fetchDingTalkTodoStatuses } = await freshClient();
  const result = await fetchDingTalkTodoStatuses({
    force: true,
    fetchImpl: async () => okJson({
      synced: true,
      personalTodoAuthorized: false,
      todos: [{ taskId: "legacy-work-1", isDone: true }],
      warnings: [{ code: "DINGTALK_USER_AUTH_REQUIRED", message: "请重新登录" }]
    })
  });

  assert.deepEqual(result.todos.map(todo => todo.taskId), ["legacy-work-1"]);
  assert.equal(result.warnings[0].code, "DINGTALK_USER_AUTH_REQUIRED");
});

test("todo client backs off after a source-level rate-limit warning", async () => {
  const { fetchDingTalkTodoStatuses } = await freshClient();
  let calls = 0;
  const now = Date.now();
  const fetchImpl = async () => {
    calls += 1;
    return okJson({
      synced: true,
      personalTodoAuthorized: true,
      todos: [],
      warnings: [{ code: "DINGTALK_RATE_LIMITED", message: "稍后重试" }]
    });
  };

  await fetchDingTalkTodoStatuses({ fetchImpl, now });
  const skipped = await fetchDingTalkTodoStatuses({ fetchImpl, now: now + 45_001 });
  assert.equal(calls, 1);
  assert.equal(skipped.skipped, true);
});

test("todo client persists rotating cursors without storing todo content", async () => {
  const { fetchDingTalkTodoStatuses } = await freshClient();
  const urls = [];
  const fetchImpl = async url => {
    urls.push(String(url));
    return okJson({
      synced: true,
      personalTodoAuthorized: true,
      todos: [{ taskId: "private-card" }],
      nextCursor: {
        personalPage: 3,
        workPendingToken: "pending-2",
        workCompletedToken: "done-2"
      }
    });
  };

  await fetchDingTalkTodoStatuses({ force: true, fetchImpl });
  await fetchDingTalkTodoStatuses({ force: true, fetchImpl });
  assert.match(urls[1], /personalPage=3/);
  assert.match(urls[1], /workPendingToken=pending-2/);
  assert.doesNotMatch(JSON.stringify(globalThis.window.localStorage), /private-card/);
});

test("todo client requests only unique bound task ids", async () => {
  const { fetchDingTalkTodoStatuses } = await freshClient();
  let requestUrl = "";
  await fetchDingTalkTodoStatuses({
    force: true,
    taskIds: ["task-a", "task-b", "task-a", "", "unsafe/id"],
    fetchImpl: async url => {
      requestUrl = String(url);
      return okJson({ synced: true, todos: [] });
    }
  });

  const url = new URL(requestUrl, "https://flow.example.com");
  assert.deepEqual(url.searchParams.getAll("taskId"), ["task-a", "task-b"]);
});
