import test from "node:test";
import assert from "node:assert/strict";
import {
  dashboardTasksForExecutive,
  dashboardTasksForUser,
  riskMetaForTask,
  normalizeTaskDueDate,
  taskMatchesDepartment,
  taskMatchesUserDepartments,
  todoSyncStatus
} from "../src/domain/taskTodo.js";
import { buildTaskTodoPayload } from "../src/domain/dingTalk.js";

test("dashboard tasks only include unfinished work owned by the current user's department", () => {
  const tasks = [
    { id: "product", ownerDept: "产品部", done: false, due: "2026-07-11" },
    { id: "mixed", ownerDept: "总经办 / 运营 / 品牌", done: false, due: "2026-07-12" },
    { id: "supply", ownerDept: "供应链/采购", done: false, due: "" },
    { id: "done", ownerDept: "产品", done: true, due: "2026-07-10" }
  ];
  const user = { department: "产品部", departments: ["产品部"] };

  assert.equal(taskMatchesUserDepartments(tasks[0], user), true);
  assert.equal(taskMatchesUserDepartments(tasks[1], user), false);
  assert.deepEqual(dashboardTasksForUser(tasks, user).map(task => task.id), ["product"]);
});

test("company-wide tasks are visible to every department", () => {
  const tasks = [{ id: "company", title: "全员任务", ownerDept: "所有部门", done: false }];
  const user = { department: "产品部" };

  assert.deepEqual(dashboardTasksForUser(tasks, user).map(task => task.id), ["company"]);
});

test("executives see all departments' tasks and can narrow by department", () => {
  const tasks = [
    { id: "product", ownerDept: "产品部", done: false, due: "2026-07-12" },
    { id: "ops", ownerDept: "运营部", done: false, due: "2026-07-11" },
    { id: "company", ownerDept: "全员", done: false, due: "" },
    { id: "done", ownerDept: "产品部", done: true, due: "2026-07-10" }
  ];

  // 不筛选时看到全公司未完成待办（按截止时间排序）
  assert.deepEqual(dashboardTasksForExecutive(tasks, "all").map(task => task.id), ["ops", "product", "company"]);
  // 按部门筛选；全员任务始终可见
  assert.deepEqual(dashboardTasksForExecutive(tasks, "产品部").map(task => task.id), ["product", "company"]);
  assert.equal(taskMatchesDepartment({ ownerDept: "供应链/采购" }, "采购部"), true);
  assert.equal(taskMatchesDepartment({ ownerDept: "产品部" }, "运营部"), false);
});

test("risk only includes unfinished tasks due within two days or overdue", () => {
  const now = new Date("2026-07-10T10:00:00+08:00");

  assert.equal(riskMetaForTask({ due: "2026-07-08", done: false }, now).label, "逾期 2 天");
  assert.equal(riskMetaForTask({ due: "2026-07-10", done: false }, now).label, "今日截止");
  assert.equal(riskMetaForTask({ due: "2026-07-12", done: false }, now).label, "2 天后截止");
  assert.equal(riskMetaForTask({ due: "2026-07-13", done: false }, now), null);
  assert.equal(riskMetaForTask({ due: "2026-07-09", done: true }, now), null);
  assert.equal(riskMetaForTask({ due: "", done: false }, now), null);
});

test("todo sync state detects unsynced, stale, completed and failed tasks", () => {
  const task = { title: "整理 PRD", due: "2026-07-12", done: false, deliverable: "PRD", ownerDept: "产品部" };
  assert.equal(todoSyncStatus(task), "未同步");

  const snapshot = {
    title: task.title,
    due: task.due,
    done: false,
    deliverable: task.deliverable,
    ownerDept: task.ownerDept,
    executorUnionIds: ["union-a"]
  };
  const synced = { ...task, dingTodo: { id: "todo-1", snapshot, executorUnionIds: ["union-a"] } };
  assert.equal(todoSyncStatus(synced), "已同步");
  assert.equal(todoSyncStatus({ ...synced, due: "2026-07-13" }), "待更新");
  assert.equal(todoSyncStatus({ ...synced, done: true }), "待更新");
  assert.equal(todoSyncStatus({ ...synced, done: true, dingTodo: { ...synced.dingTodo, snapshot: { ...snapshot, done: true } } }), "已完成");
  assert.equal(todoSyncStatus({ ...synced, dingTodo: { ...synced.dingTodo, lastError: "network" } }), "同步失败");
});

test("task todo payload requires a due date and keeps a stable system source id", () => {
  const product = { id: "p1", name: "鹦鹉谷物棒" };
  const task = { id: "t1", title: "整理 PRD", due: "2026-07-12", done: false, deliverable: "PRD", ownerDept: "产品部" };
  const creator = { unionid: "creator-union" };
  const executors = [{ name: "赵雨涵", unionid: "executor-union" }];
  const payload = buildTaskTodoPayload({ product, task, creator, executors, detailUrl: "https://flow.example.com/#progress" });

  assert.equal(payload.sourceId, "task:p1:t1");
  assert.equal(payload.creatorUnionId, "creator-union");
  assert.deepEqual(payload.executorUnionIds, ["executor-union"]);
  assert.equal(payload.dueTime, new Date("2026-07-12T18:00:00+08:00").getTime());
  assert.equal(payload.done, false);
  assert.throws(() => buildTaskTodoPayload({ product, task: { ...task, due: "" }, creator, executors, detailUrl: "https://flow.example.com" }), /截止日期/);
});

test("legacy month-day deadlines normalize before DingTalk todo sync", () => {
  const now = new Date("2026-07-11T10:00:00+08:00");
  assert.equal(normalizeTaskDueDate("07-14", now), "2026-07-14");
  assert.equal(normalizeTaskDueDate("2026/07/14", now), "2026-07-14");
  assert.equal(normalizeTaskDueDate("02-30", now), "");

  const payload = buildTaskTodoPayload({
    product: { id: "p1", name: "鹦鹉谷物棒" },
    task: { id: "legacy", title: "包装确认", due: "07-14", done: false },
    creator: { unionid: "creator-union" },
    executors: [{ unionid: "executor-union" }],
    detailUrl: "https://flow.example.com/#progress",
    now
  });

  assert.equal(payload.dueTime, new Date("2026-07-14T18:00:00+08:00").getTime());
});
