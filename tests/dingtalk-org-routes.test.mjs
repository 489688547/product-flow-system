import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as syncOrgRequest } from "../functions/api/dingtalk/org/sync.js";
import { onRequest as createTodoRequest } from "../functions/api/dingtalk/todo/create.js";
import { onRequest as createCalendarRequest } from "../functions/api/dingtalk/calendar/create.js";
import { onRequest as listCalendarRequest } from "../functions/api/dingtalk/calendar/events.js";

test("org sync route reports missing DingTalk credentials", async () => {
  const response = await syncOrgRequest({
    request: new Request("https://flow.example.com/api/dingtalk/org/sync", { method: "POST" }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});

test("todo create route validates DingTalk credentials", async () => {
  const response = await createTodoRequest({
    request: new Request("https://flow.example.com/api/dingtalk/todo/create", {
      method: "POST",
      body: JSON.stringify({ subject: "整理 PRD" })
    }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});

test("calendar create route validates DingTalk credentials", async () => {
  const response = await createCalendarRequest({
    request: new Request("https://flow.example.com/api/dingtalk/calendar/create", {
      method: "POST",
      body: JSON.stringify({ summary: "立项评审会" })
    }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});

test("calendar events route validates DingTalk credentials", async () => {
  const response = await listCalendarRequest({
    request: new Request("https://flow.example.com/api/dingtalk/calendar/events", {
      method: "POST",
      body: JSON.stringify({ userUnionId: "user-union" })
    }),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /缺少钉钉应用配置/);
});
