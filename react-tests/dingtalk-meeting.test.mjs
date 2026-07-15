import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskMeetingPayload,
  createTaskMeetingRecord
} from "../src/domain/dingTalk.js";
import { normalizeTaskCategory, taskCategoryActions, TASK_CATEGORIES } from "../src/domain/productFlow.js";

test("workflow exposes the four task categories used by product progress", () => {
  assert.deepEqual(TASK_CATEGORIES, ["会前准备", "会议", "决策", "待办任务"]);
});

test("legacy task categories migrate into the four current categories", () => {
  assert.equal(normalizeTaskCategory("会议/决策"), "会议");
  assert.equal(normalizeTaskCategory("会后交付"), "待办任务");
  assert.equal(normalizeTaskCategory("准入条件"), "待办任务");
  assert.equal(normalizeTaskCategory("决策"), "决策");
});

test("task category actions expose only the relevant DingTalk operation", () => {
  assert.deepEqual(taskCategoryActions("会前准备"), { meeting: false, todo: true });
  assert.deepEqual(taskCategoryActions("会议"), { meeting: true, todo: false });
  assert.deepEqual(taskCategoryActions("决策"), { meeting: false, todo: true });
  assert.deepEqual(taskCategoryActions("待办任务"), { meeting: false, todo: true });
});

test("task meeting payload uses stable source id and DingTalk union ids", () => {
  const payload = buildTaskMeetingPayload({
    product: { id: "p1", name: "鹦鹉谷物棒" },
    task: { id: "task-review", title: "样品评审会", deliverable: "样品评审纪要" },
    organizer: { unionid: "union-owner" },
    attendees: [
      { name: "周荣庆", unionid: "union-owner" },
      { name: "赵雨涵", unionid: "union-zhao" }
    ],
    startTime: "2026-07-10T14:00",
    endTime: "2026-07-10T15:00"
  });

  assert.equal(payload.sourceId, "meeting:p1:task-review");
  assert.equal(payload.organizerUnionId, "union-owner");
  assert.deepEqual(payload.attendeeUnionIds, ["union-owner", "union-zhao"]);
  assert.match(payload.summary, /鹦鹉谷物棒/);
  assert.equal(payload.createOnlineMeeting, true);
  assert.match(payload.startTime, /^2026-07-10T14:00/);
});

test("task meeting payload rejects missing real DingTalk identities", () => {
  assert.throws(() => buildTaskMeetingPayload({
    product: { id: "p1", name: "鹦鹉谷物棒" },
    task: { id: "task-review", title: "样品评审会" },
    organizer: { name: "本地账号" },
    attendees: [],
    startTime: "2026-07-10T14:00",
    endTime: "2026-07-10T15:00"
  }), /unionId/);
});

test("created DingTalk event is persisted as task meeting metadata", () => {
  const record = createTaskMeetingRecord({
    event: { id: "event-1", onlineMeetingInfo: { url: "https://meeting.dingtalk.com/1" } },
    payload: {
      startTime: "2026-07-10T14:00:00.000+08:00",
      endTime: "2026-07-10T15:00:00.000+08:00"
    },
    attendees: [{ name: "赵雨涵", unionid: "union-zhao" }],
    syncedAt: "2026-07-10T12:00:00.000Z"
  });

  assert.equal(record.eventId, "event-1");
  assert.equal(record.joinUrl, "https://meeting.dingtalk.com/1");
  assert.deepEqual(record.attendeeNames, ["赵雨涵"]);
  assert.equal(record.syncedAt, "2026-07-10T12:00:00.000Z");
});
