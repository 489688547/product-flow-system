import test from "node:test";
import assert from "node:assert/strict";
import {
  applyRemoteTodoSnapshots,
  groupPersonalTodos,
  personalTodosForUser,
  reconcilePersonalTodos
} from "../src/domain/personalTodos.js";
import { normalizePlatformState } from "../src/domain/strategyExecution.js";

const USERS = [
  { userid: "u-zhou", unionid: "union-zhou", name: "周总", department: "总经办", departments: ["总经办"] },
  { userid: "u-ye", unionid: "union-ye", name: "叶经理", department: "产品部", departments: ["产品部"] }
];

test("projects explicit responsibility sources into stable personal todos", () => {
  const todos = reconcilePersonalTodos({
    platformState: normalizePlatformState({
      projects: [{ id: "p1", name: "新品上市", strategyId: "s1", objectiveId: "o1" }],
      milestones: [{ id: "m1", projectId: "p1", title: "完成首发", owner: "周总", dueDate: "2026-07-18", status: "pending" }],
      risks: [{ id: "r1", projectId: "p1", title: "库存风险", owner: "周总", promisedAt: "2026-07-19", status: "open" }],
      decisionRequests: [{ id: "d1", projectId: "p1", title: "追加预算", decisionOwner: "周总", dueDate: "2026-07-17", status: "pending" }]
    }),
    productState: {
      products: [{ id: "product-1", name: "鹦鹉谷物棒" }],
      tasks: [{ id: "t1", productId: "product-1", title: "补齐详情页", due: "2026-07-20", done: false, dingTodo: { executorUnionIds: ["union-zhou"], executorNames: ["周总"] } }]
    },
    orgCache: { users: USERS },
    existingTodos: [],
    now: "2026-07-16T08:00:00.000Z"
  });

  assert.deepEqual(new Set(todos.map(todo => todo.sourceType)), new Set(["milestone", "risk", "decision", "product_task", "review"]));
  assert.equal(todos.find(todo => todo.sourceType === "milestone").sourceKey, "strategy-platform:milestone:m1");
  assert.equal(todos.every(todo => todo.assigneeUnionId === "union-zhou"), true);
  assert.equal(todos.find(todo => todo.sourceType === "product_task").sourceAppId, "product-flow");
});

test("department-only product tasks never become personal todos", () => {
  const todos = reconcilePersonalTodos({
    platformState: normalizePlatformState({}),
    productState: { tasks: [{ id: "t1", title: "部门公共任务", ownerDept: "产品部", done: false }] },
    orgCache: { users: USERS },
    existingTodos: [],
    now: "2026-07-16T08:00:00.000Z"
  });
  assert.equal(todos.some(todo => todo.sourceId === "t1"), false);
});

test("governed execution work projects only explicit personal responsibilities", () => {
  const todos = reconcilePersonalTodos({
    platformState: normalizePlatformState({
      departmentCommitments: [
        { id: "c-review", title: "运营年度承诺", status: "office_review", reviewerName: "周总", reviewDueDate: "2026-07-18" },
        { id: "c-returned", title: "产品年度承诺", status: "returned", owner: "叶经理", dueDate: "2026-07-20" }
      ],
      commitmentMilestones: [{ id: "cm1", commitmentId: "c-returned", title: "完成产品地图", owner: "叶经理", dueDate: "2026-07-31", status: "at_risk" }],
      incentiveProjects: [{ id: "ip1", name: "优化抖音投流", owner: "叶经理", endDate: "2026-08-31", status: "active" }],
      monthlyReports: [{ id: "mr1", month: "2026-06", department: "产品部", owner: "叶经理", dueDate: "2026-07-05", status: "returned" }]
    }),
    orgCache: { users: USERS },
    now: "2026-07-16T08:00:00.000Z"
  });
  assert.deepEqual(new Set(todos.map(todo => todo.sourceType)), new Set(["commitment", "commitment_milestone", "incentive_project", "monthly_report", "review"]));
  assert.equal(todos.find(todo => todo.sourceId === "c-review").assigneeName, "周总");
  assert.equal(todos.find(todo => todo.sourceId === "mr1").assigneeName, "叶经理");
});

test("unassigned governed records do not crash personal todo projection", () => {
  const todos = reconcilePersonalTodos({
    platformState: normalizePlatformState({
      departmentCommitments: [{ id: "c1", title: "待分配承诺", status: "office_review", reviewerName: "" }],
      monthlyReports: [{ id: "mr-empty", month: "2026-06", department: "供应链部", owner: "", status: "draft" }]
    }),
    orgCache: { users: USERS },
    now: "2026-07-16T08:00:00.000Z"
  });
  assert.equal(todos.some(todo => ["c1", "mr-empty"].includes(todo.sourceId)), false);
});

test("reconciliation preserves sync metadata and cancels removed assignments", () => {
  const existingTodos = [
    {
      id: "todo-existing",
      sourceType: "milestone",
      sourceId: "m1",
      sourceKey: "strategy-platform:milestone:m1",
      assigneeUnionId: "union-zhou",
      status: "pending",
      dingTodo: { id: "ding-1", syncedAt: "2026-07-15T09:00:00.000Z" },
      createdAt: "2026-07-15T08:00:00.000Z"
    },
    {
      id: "todo-removed",
      sourceType: "product_task",
      sourceId: "removed",
      sourceKey: "strategy-platform:product_task:removed",
      assigneeUnionId: "union-zhou",
      status: "pending",
      dingTodo: { id: "ding-removed" },
      createdAt: "2026-07-15T08:00:00.000Z"
    }
  ];
  const todos = reconcilePersonalTodos({
    platformState: normalizePlatformState({ milestones: [{ id: "m1", title: "新标题", owner: "周总", dueDate: "2026-07-20", status: "pending" }] }),
    productState: { tasks: [] },
    orgCache: { users: USERS },
    existingTodos,
    now: "2026-07-16T08:00:00.000Z"
  });
  const preserved = todos.find(todo => todo.id === "todo-existing");
  assert.equal(preserved.title, "新标题");
  assert.equal(preserved.dingTodo.id, "ding-1");
  assert.equal(preserved.createdAt, "2026-07-15T08:00:00.000Z");
  assert.equal(todos.find(todo => todo.id === "todo-removed").status, "cancelled");
});

test("personal filtering requires the current union id and grouping uses business dates", () => {
  const todos = [
    { id: "1", assigneeUnionId: "union-zhou", dueDate: "2026-07-15", status: "pending" },
    { id: "2", assigneeUnionId: "union-zhou", dueDate: "2026-07-16", status: "pending" },
    { id: "3", assigneeUnionId: "union-zhou", dueDate: "2026-07-20", status: "pending" },
    { id: "4", assigneeUnionId: "union-zhou", dueDate: "2026-08-01", status: "pending" },
    { id: "5", assigneeUnionId: "union-zhou", dueDate: "2026-07-10", status: "done" },
    { id: "6", assigneeUnionId: "union-other", dueDate: "2026-07-16", status: "pending" },
    { id: "7", assigneeUnionId: "union-zhou", dueDate: "2026-07-16", status: "cancelled" }
  ];
  const mine = personalTodosForUser(todos, { unionid: "union-zhou" });
  assert.deepEqual(mine.map(todo => todo.id), ["1", "2", "3", "4", "5"]);
  assert.deepEqual(personalTodosForUser(todos, { name: "周总" }), []);
  const groups = groupPersonalTodos(mine, "2026-07-16T08:00:00+08:00");
  assert.deepEqual(Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.map(todo => todo.id)])), {
    overdue: ["1"],
    today: ["2"],
    nextSevenDays: ["3"],
    later: ["4"],
    completed: ["5"]
  });
});

test("remote status only touches the signed-in user's linked DingTalk ids", () => {
  const input = [
    { id: "todo-1", sourceType: "milestone", sourceId: "m1", assigneeUnionId: "union-zhou", status: "pending", dingTodo: { id: "ding-1", lastEventAt: "" } },
    { id: "todo-2", sourceType: "risk", sourceId: "r1", assigneeUnionId: "union-other", status: "pending", dingTodo: { id: "ding-2" } }
  ];
  const result = applyRemoteTodoSnapshots(input, [
    { taskId: "ding-1", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" },
    { taskId: "unlinked", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" }
  ], { unionid: "union-zhou" }, "2026-07-16T09:01:00.000Z");
  assert.equal(result.todos[0].status, "done");
  assert.equal(result.todos[0].completedFrom, "dingtalk");
  assert.deepEqual(result.effects, [{ type: "complete_milestone", sourceId: "m1" }]);
  assert.equal(result.todos[1].status, "pending");
});

test("decision and risk completion require platform confirmation", () => {
  const todos = [
    { id: "d", sourceType: "decision", sourceId: "decision-1", assigneeUnionId: "u", status: "pending", dingTodo: { id: "ding-d" } },
    { id: "r", sourceType: "risk", sourceId: "risk-1", assigneeUnionId: "u", status: "pending", dingTodo: { id: "ding-r" } }
  ];
  const result = applyRemoteTodoSnapshots(todos, [
    { taskId: "ding-d", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" },
    { taskId: "ding-r", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" }
  ], { unionid: "u" }, "2026-07-16T09:01:00.000Z");
  assert.equal(result.todos.every(todo => todo.status === "done"), true);
  assert.deepEqual(result.effects, []);
  assert.match(result.audits.map(item => item.action).join(" "), /decision_pending_confirmation/);
  assert.match(result.audits.map(item => item.action).join(" "), /risk_pending_confirmation/);
});

test("duplicate and older remote snapshots are idempotent", () => {
  const todos = [{
    id: "todo-1",
    sourceType: "product_task",
    sourceId: "task-1",
    assigneeUnionId: "u",
    status: "done",
    completedFrom: "dingtalk",
    dingTodo: { id: "ding-1", lastEventAt: "2026-07-16T09:00:00.000Z", remoteSnapshotKey: "ding-1:true:2026-07-16T09:00:00.000Z" }
  }];
  const result = applyRemoteTodoSnapshots(todos, [
    { taskId: "ding-1", isDone: true, modifiedTime: "2026-07-16T09:00:00.000Z" },
    { taskId: "ding-1", isDone: false, modifiedTime: "2026-07-16T08:59:00.000Z" }
  ], { unionid: "u" }, "2026-07-16T09:01:00.000Z");
  assert.deepEqual(result.todos, todos);
  assert.deepEqual(result.effects, []);
  assert.deepEqual(result.audits, []);
});
