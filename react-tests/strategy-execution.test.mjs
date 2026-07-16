import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateHealth,
  buildAppHealth,
  buildExecutiveSummary,
  buildMonthlyTrend,
  createDefaultPlatformState,
  metricHealth,
  normalizePlatformState,
  objectiveHealth,
  projectHealth,
  reducePlatformState
} from "../src/domain/strategyExecution.js";

test("severe child health cannot be averaged away", () => {
  assert.equal(aggregateHealth(["normal", "off_track", "completed"]), "off_track");
  assert.equal(aggregateHealth(["normal", "at_risk", "completed"]), "at_risk");
  assert.equal(aggregateHealth(["completed", "completed"]), "completed");
});

test("platform state normalizes every shared collection", () => {
  const state = normalizePlatformState({ strategies: [] });
  [
    "strategies", "requiredResults", "departmentCommitments", "commitmentMilestones",
    "incentiveProjects", "departmentRewardBudgets", "monthlyReports", "reportCorrections",
    "objectives", "metrics", "projects", "milestones", "risks",
    "decisionRequests", "personalTodos", "statusUpdates", "monthlySnapshots", "appLinks", "appEvents",
    "appRegistry", "auditLogs"
  ].forEach(key => assert.ok(Array.isArray(state[key]), `${key} should be an array`));
});

test("personal todo status transitions are audited and duplicate snapshots are ignored", () => {
  const base = normalizePlatformState({
    personalTodos: [{ id: "todo-1", sourceType: "milestone", sourceId: "m1", status: "pending", dingTodo: {} }]
  });
  const completed = reducePlatformState(base, {
    type: "apply_personal_todo_status",
    id: "todo-1",
    status: "done",
    completedFrom: "dingtalk",
    completedAt: "2026-07-16T09:00:00.000Z",
    remoteSnapshotKey: "ding-1:true:2026-07-16T09:00:00.000Z",
    actor: "周总",
    timestamp: "2026-07-16T09:01:00.000Z"
  });
  assert.equal(completed.personalTodos[0].status, "done");
  assert.equal(completed.personalTodos[0].completedFrom, "dingtalk");
  assert.equal(completed.personalTodos[0].dingTodo.remoteSnapshotKey, "ding-1:true:2026-07-16T09:00:00.000Z");
  assert.equal(completed.auditLogs[0].action, "complete_from_dingtalk");

  const duplicate = reducePlatformState(completed, {
    type: "apply_personal_todo_status",
    id: "todo-1",
    status: "done",
    completedFrom: "dingtalk",
    remoteSnapshotKey: "ding-1:true:2026-07-16T09:00:00.000Z",
    timestamp: "2026-07-16T09:02:00.000Z"
  });
  assert.equal(duplicate, completed);
});

test("personal todo replacement and notification updates preserve sync state", () => {
  const base = normalizePlatformState({
    personalTodos: [{ id: "todo-1", status: "pending", dingTodo: { id: "ding-1" } }]
  });
  const replaced = reducePlatformState(base, {
    type: "replace_personal_todos",
    todos: [{ id: "todo-1", status: "pending", dingTodo: { id: "ding-1" } }, { id: "todo-2", status: "pending", dingTodo: {} }],
    timestamp: "2026-07-16T09:00:00.000Z"
  });
  assert.equal(replaced.personalTodos.length, 2);
  const notified = reducePlatformState(replaced, {
    type: "update_personal_todo_notification",
    id: "todo-1",
    dingTodo: { syncedAt: "2026-07-16T09:01:00.000Z", lastError: "" },
    timestamp: "2026-07-16T09:01:00.000Z"
  });
  assert.equal(notified.personalTodos[0].dingTodo.id, "ding-1");
  assert.equal(notified.personalTodos[0].dingTodo.syncedAt, "2026-07-16T09:01:00.000Z");
});

test("metric health reports completion, threshold breaches, and stale facts", () => {
  const base = {
    id: "m1",
    direction: "increase",
    baseline: 0,
    target: 100,
    warningLine: 70,
    offTrackLine: 50,
    frequencyDays: 7,
    updatedAt: "2026-07-15T00:00:00.000Z"
  };
  assert.equal(metricHealth({ ...base, current: 100 }, "2026-07-16").health, "completed");
  assert.equal(metricHealth({ ...base, current: 60 }, "2026-07-16").health, "at_risk");
  assert.equal(metricHealth({ ...base, current: 40 }, "2026-07-16").health, "off_track");
  assert.equal(metricHealth({ ...base, current: 90, updatedAt: "2026-06-01T00:00:00.000Z" }, "2026-07-16").freshness, "stale");
});

test("critical milestone and severe risk drive project health", () => {
  const state = normalizePlatformState({
    projects: [{ id: "p1", name: "重点项目", updatedAt: "2026-07-15T00:00:00.000Z" }],
    milestones: [{ id: "ms1", projectId: "p1", title: "关键上线", dueDate: "2026-07-10", critical: true, status: "pending" }],
    risks: [{ id: "r1", projectId: "p1", severity: "critical", status: "open" }]
  });
  const result = projectHealth(state, state.projects[0], "2026-07-16");
  assert.equal(result.health, "off_track");
  assert.match(result.reasons.join(" "), /关键里程碑|重大风险/);
});

test("objective health preserves the worst linked fact", () => {
  const state = normalizePlatformState({
    objectives: [{ id: "o1", strategyId: "s1", title: "季度目标" }],
    metrics: [
      { id: "m1", objectiveId: "o1", current: 100, target: 100, direction: "increase", updatedAt: "2026-07-15", frequencyDays: 7 },
      { id: "m2", objectiveId: "o1", current: 10, target: 100, direction: "increase", warningLine: 70, offTrackLine: 50, updatedAt: "2026-07-15", frequencyDays: 7 }
    ]
  });
  assert.equal(objectiveHealth(state, state.objectives[0], "2026-07-16").health, "off_track");
});

test("audited reducer records actor and rejects mutable monthly snapshots", () => {
  const base = createDefaultPlatformState();
  const changed = reducePlatformState(base, {
    type: "upsert_strategy",
    actor: "周总",
    record: { id: "s-new", name: "渠道增长", owner: "周总", year: 2026 }
  });
  assert.equal(changed.strategies.some(item => item.id === "s-new"), true);
  assert.equal(changed.auditLogs[0].actor, "周总");

  const snapshotted = reducePlatformState(changed, {
    type: "create_monthly_snapshot",
    actor: "周总",
    record: { id: "snapshot-2026-07", month: "2026-07", conclusion: "继续推进" }
  });
  assert.equal(snapshotted.monthlySnapshots[0].month, "2026-07");
  assert.throws(() => reducePlatformState(snapshotted, {
    type: "update_monthly_snapshot",
    record: { id: "snapshot-2026-07" }
  }), /不可修改/);
});

test("App event ingestion is idempotent and updates linked project facts", () => {
  const base = normalizePlatformState({
    projects: [{ id: "p1", name: "新品上市", sourceAppId: "product-flow", sourceEntityId: "product-1" }]
  });
  const event = {
    id: "event-1",
    appId: "product-flow",
    entityType: "product",
    entityId: "product-1",
    kind: "progress_changed",
    health: "at_risk",
    progress: 45,
    occurredAt: "2026-07-16T00:00:00.000Z",
    syncedAt: "2026-07-16T01:00:00.000Z",
    idempotencyKey: "product-flow:product-1:progress:45"
  };
  const once = reducePlatformState(base, { type: "ingest_app_events", events: [event] });
  const twice = reducePlatformState(once, { type: "ingest_app_events", events: [event] });
  assert.equal(twice.appEvents.length, once.appEvents.length);
  assert.equal(twice.projects[0].sourceHealth, "at_risk");
  assert.equal(twice.projects[0].sourceProgress, 45);
});

test("executive summary orders decisions and exposes off-track objectives", () => {
  const state = normalizePlatformState({
    strategies: [{ id: "s1", name: "增长", year: 2026 }],
    objectives: [{ id: "o1", strategyId: "s1", title: "增长目标" }],
    metrics: [{ id: "m1", objectiveId: "o1", current: 10, target: 100, direction: "increase", warningLine: 70, offTrackLine: 50, updatedAt: "2026-07-15", frequencyDays: 7 }],
    decisionRequests: [
      { id: "d2", title: "晚决策", status: "pending", dueDate: "2026-07-20" },
      { id: "d1", title: "早决策", status: "pending", dueDate: "2026-07-18" }
    ]
  });
  const summary = buildExecutiveSummary(state, { today: "2026-07-16" });
  assert.equal(summary.offTrackObjectives.length, 1);
  assert.equal(summary.pendingDecisions[0].id, "d1");
});

test("monthly trends and App health retain history and data freshness", () => {
  const trend = buildMonthlyTrend([
    { id: "july", month: "2026-07", summary: { normal: 3, atRisk: 1, offTrack: 1, completed: 0 } },
    { id: "june", month: "2026-06", summary: { normal: 2, atRisk: 2, offTrack: 0, completed: 0 } }
  ]);
  assert.deepEqual(trend.map(item => item.month), ["2026-06", "2026-07"]);

  const apps = buildAppHealth(
    [{ id: "product-flow", name: "产品全周期", enabled: true }],
    [{ appId: "product-flow", syncedAt: "2026-07-01T00:00:00.000Z" }],
    "2026-07-16"
  );
  assert.equal(apps[0].freshness, "stale");

  const currentApps = buildAppHealth(
    [{ id: "product-flow", name: "产品全周期", enabled: true }],
    [{ appId: "product-flow", syncedAt: "2026-07-16T08:56:00.000Z" }],
    new Date("2026-07-16T09:00:00.000Z")
  );
  assert.equal(currentApps[0].freshness, "healthy");
});
