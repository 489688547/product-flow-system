import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDingCalendarEventPayload,
  buildDingTodoPayload,
  createDingCalendarEvent,
  createDingTodoTask
} from "../functions/api/dingtalk/_shared/dingtalk.js";

function okJson(body) {
  return {
    ok: true,
    json: async () => body
  };
}

test("buildDingTodoPayload creates a work todo with detailUrl and unionId executors", () => {
  const payload = buildDingTodoPayload({
    sourceId: "task-1",
    subject: "整理 PRD",
    description: "产品：鹦鹉谷物棒",
    creatorUnionId: "creator-union",
    executorUnionIds: ["u-a", "u-b"],
    detailUrl: "https://flow.example.com/?task=task-1",
    dueTime: 1783401600000
  });

  assert.equal(payload.sourceId, "task-1");
  assert.equal(payload.creatorId, "creator-union");
  assert.deepEqual(payload.executorIds, ["u-a", "u-b"]);
  assert.deepEqual(payload.detailUrl, {
    appUrl: "https://flow.example.com/?task=task-1",
    pcUrl: "https://flow.example.com/?task=task-1"
  });
  assert.equal(payload.isOnlyShowExecutor, true);
  assert.equal(payload.priority, 20);
});

test("createDingTodoTask posts to the DingTalk todo endpoint with operatorId", async () => {
  const calls = [];
  const result = await createDingTodoTask("token-1", {
    creatorUnionId: "creator-union",
    executorUnionIds: ["executor-union"],
    sourceId: "task-1",
    subject: "整理 PRD",
    detailUrl: "https://flow.example.com/?task=task-1"
  }, async (url, options) => {
    calls.push({ url, options });
    return okJson({ id: "todo-1" });
  });

  assert.equal(result.id, "todo-1");
  assert.match(calls[0].url, /\/v1\.0\/todo\/users\/creator-union\/tasks\?operatorId=creator-union$/);
  assert.equal(calls[0].options.headers["x-acs-dingtalk-access-token"], "token-1");
});

test("buildDingCalendarEventPayload creates a primary-calendar meeting event", () => {
  const payload = buildDingCalendarEventPayload({
    summary: "立项评审会",
    description: "产品：鹦鹉谷物棒",
    startTime: "2026-07-06T09:00:00+08:00",
    endTime: "2026-07-06T10:00:00+08:00",
    attendeeUserIds: ["u-a", "u-b"]
  });

  assert.equal(payload.summary, "立项评审会");
  assert.equal(payload.start.timeZone, "Asia/Shanghai");
  assert.equal(payload.end.dateTime, "2026-07-06T10:00:00+08:00");
  assert.deepEqual(payload.attendees, [{ id: "u-a" }, { id: "u-b" }]);
});

test("createDingCalendarEvent posts to the primary calendar endpoint", async () => {
  const calls = [];
  const result = await createDingCalendarEvent("token-1", {
    organizerUserId: "organizer-user",
    summary: "立项评审会",
    startTime: "2026-07-06T09:00:00+08:00",
    endTime: "2026-07-06T10:00:00+08:00",
    attendeeUserIds: ["u-a"]
  }, async (url, options) => {
    calls.push({ url, options });
    return okJson({ id: "event-1" });
  });

  assert.equal(result.id, "event-1");
  assert.match(calls[0].url, /\/v1\.0\/calendar\/users\/organizer-user\/calendars\/primary\/events$/);
  assert.equal(calls[0].options.headers["x-acs-dingtalk-access-token"], "token-1");
});
