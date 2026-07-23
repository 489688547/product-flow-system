import assert from "node:assert/strict";
import test from "node:test";
import { onRequest as createCalendar } from "../functions/api/dingtalk/calendar/create.js";
import { onRequest as createTodo } from "../functions/api/dingtalk/todo/create.js";
import {
  externalActionMode
} from "../functions/api/platform/_shared/externalActionMode.js";
import {
  simulateDingCalendarEvent,
  simulateDingTodoSync
} from "../functions/api/platform/_shared/displayExternalActionAdapter.js";
import { createDataEnvironmentD1Mock } from "./helpers/data-environment-d1-mock.mjs";

const displayData = {
  session: { userId: "executive-1", unionId: "union-1", role: "executive" },
  dataEnvironment: { id: "display", version: 7 }
};

test("external action mode is provider in production and simulation only in display", () => {
  assert.equal(externalActionMode({ dataEnvironment: { id: "production" } }), "provider");
  assert.equal(externalActionMode(displayData), "simulate");
});

test("display todo creation returns a stable compatible result without Provider credentials", async () => {
  const controlDb = createDataEnvironmentD1Mock();
  const request = () => new Request("https://flow.example.com/api/dingtalk/todo/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      creatorUnionId: "union-1",
      executorUnionIds: ["union-2"],
      subject: "展示任务",
      detailUrl: "https://flow.example.com/tasks/1",
      sourceId: "task:product-1:task-1"
    })
  });
  const first = await createTodo({
    request: request(),
    env: { PRODUCT_FLOW_DB: controlDb },
    data: { ...displayData, controlDb }
  });
  const second = await createTodo({
    request: request(),
    env: { PRODUCT_FLOW_DB: controlDb },
    data: { ...displayData, controlDb }
  });
  const firstBody = await first.json();
  const secondBody = await second.json();

  assert.equal(first.status, 200);
  assert.equal(firstBody.todo.simulated, true);
  assert.equal(firstBody.todo.id, secondBody.todo.id);
  assert.match(firstBody.todo.id, /^display-todo-/);
  assert.equal(controlDb.audits.length, 2);
});

test("display calendar creation is simulated and keeps the normal event shape", async () => {
  const controlDb = createDataEnvironmentD1Mock();
  const response = await createCalendar({
    request: new Request("https://flow.example.com/api/dingtalk/calendar/create", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        organizerUnionId: "union-1",
        sourceId: "meeting-1",
        summary: "展示会议",
        startTime: "2026-07-24T09:00:00+08:00",
        endTime: "2026-07-24T10:00:00+08:00"
      })
    }),
    env: { PRODUCT_FLOW_DB: controlDb },
    data: { ...displayData, controlDb }
  });
  const body = await response.json();

  assert.equal(response.status, 200);
  assert.equal(body.event.simulated, true);
  assert.equal(body.event.summary, "展示会议");
  assert.match(body.event.id, /^display-calendar-/);
});

test("display todo sync still enforces normal required fields", () => {
  assert.throws(
    () => simulateDingTodoSync({
      creatorUnionId: "union-1",
      executorUnionIds: ["union-2"],
      detailUrl: "https://flow.example.com/tasks/1",
      sourceId: "task-1"
    }),
    error => error?.status === 400
  );
  assert.equal(simulateDingCalendarEvent({
    organizerUnionId: "union-1",
    sourceId: "meeting-1",
    startTime: "2026-07-24T09:00:00+08:00",
    endTime: "2026-07-24T10:00:00+08:00"
  }).simulated, true);
});
