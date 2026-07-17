import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateHealth,
  buildAppHealth,
  buildExecutiveSummary,
  buildMonthlyTrend,
  createDefaultPlatformState,
  metricHealth,
  migratePlatformState,
  normalizePlatformState,
  objectiveHealth,
  projectHealth,
  reducePlatformState
} from "../src/domain/strategyExecution.js";

test("v2 strategy data migrates the DingTalk annual plan into v3 without losing user records", () => {
  const migrated = migratePlatformState({
    version: "strategy-platform-v2",
    strategies: [
      { id: "strategy-organization-2026", name: "旧组织目标", status: "at_risk", createdAt: "2026-01-02" },
      { id: "strategy-user-created", name: "用户自建战略", status: "active" }
    ],
    requiredResults: [{ id: "result-user-created", strategyId: "strategy-user-created", title: "用户结果" }],
    departmentCommitments: [],
    commitmentMilestones: []
  });

  assert.equal(migrated.version, "strategy-platform-v3");
  assert.equal(migrated.strategies.find(item => item.id === "strategy-organization-2026").name, "组织建设全面加强");
  assert.equal(migrated.strategies.find(item => item.id === "strategy-organization-2026").status, "at_risk");
  assert.equal(migrated.strategies.find(item => item.id === "strategy-organization-2026").createdAt, "2026-01-02");
  assert.equal(migrated.strategies.some(item => item.id === "strategy-user-created"), true);
  assert.equal(migrated.requiredResults.some(item => item.id === "result-org-review-cadence"), true);
  assert.equal(migrated.requiredResults.some(item => item.id === "result-hamster-brand-decisions"), true);
  assert.equal(migrated.requiredResults.some(item => item.id === "result-user-created"), true);
  assert.equal(migrated.departmentCommitments.some(item => item.id === "commitment-brand-ip-2026"), true);
  assert.equal(migrated.departmentCommitments.some(item => item.id === "commitment-ops-channel-2026"), true);
  assert.equal(migrated.commitmentMilestones.some(item => item.commitmentId === "commitment-ops-channel-2026"), true);
});

test("v3 strategy migration is idempotent and preserves later edits", () => {
  const current = {
    version: "strategy-platform-v3",
    strategies: [{ id: "strategy-organization-2026", name: "我修改后的战略名称" }],
    requiredResults: [],
    departmentCommitments: [],
    commitmentMilestones: []
  };
  const migrated = migratePlatformState(current);
  assert.equal(migrated, current);
  assert.equal(migrated.strategies[0].name, "我修改后的战略名称");
});

test("strategy archive blocks active dependencies and cascades required results", () => {
  const blocked = normalizePlatformState({
    version: "strategy-platform-v3",
    strategies: [{ id: "s1", name: "增长" }],
    requiredResults: [{ id: "r1", strategyId: "s1", title: "结果" }],
    departmentCommitments: [{ id: "c1", strategyId: "s1", status: "active" }]
  });
  assert.throws(() => reducePlatformState(blocked, { type: "archive_strategy", id: "s1", actor: "周总" }), /部门承诺/);

  const archived = reducePlatformState({ ...blocked, departmentCommitments: [] }, {
    type: "archive_strategy",
    id: "s1",
    actor: "周总",
    reason: "年度调整",
    timestamp: "2026-07-17T08:00:00.000Z"
  });
  assert.equal(archived.strategies[0].archived, true);
  assert.equal(archived.requiredResults[0].archived, true);
  assert.equal(archived.strategies[0].archivedBy, "周总");
  assert.equal(archived.auditLogs[0].action, "archive");
  assert.equal(archived.auditLogs[0].reason, "年度调整");
});

test("governed records only archive in safe workflow states", () => {
  const base = normalizePlatformState({
    version: "strategy-platform-v3",
    departmentCommitments: [{ id: "draft-commitment", status: "draft" }, { id: "active-commitment", status: "active" }],
    commitmentMilestones: [{ id: "commitment-milestone-1", commitmentId: "draft-commitment" }],
    incentiveProjects: [{ id: "draft-incentive", status: "draft" }, { id: "active-incentive", status: "active" }],
    monthlyReports: [{ id: "draft-report", status: "draft" }, { id: "submitted-report", status: "submitted" }]
  });
  const commitment = reducePlatformState(base, { type: "archive_department_commitment", id: "draft-commitment", actor: "周总" });
  assert.equal(commitment.departmentCommitments.find(item => item.id === "draft-commitment").archived, true);
  assert.equal(commitment.commitmentMilestones[0].archived, true);
  assert.throws(() => reducePlatformState(base, { type: "archive_department_commitment", id: "active-commitment" }), /草稿或退回/);
  const incentive = reducePlatformState(base, { type: "archive_incentive_project", id: "draft-incentive", actor: "周总" });
  assert.equal(incentive.incentiveProjects.find(item => item.id === "draft-incentive").archived, true);
  assert.throws(() => reducePlatformState(base, { type: "archive_incentive_project", id: "active-incentive" }), /草稿或已取消/);
  const report = reducePlatformState(base, { type: "archive_monthly_report", id: "draft-report", actor: "周总" });
  assert.equal(report.monthlyReports.find(item => item.id === "draft-report").archived, true);
  assert.throws(() => reducePlatformState(base, { type: "archive_monthly_report", id: "submitted-report" }), /草稿月报/);
});

test("project archive cascades children while project child and weekly updates archive independently", () => {
  const base = normalizePlatformState({
    version: "strategy-platform-v3",
    projects: [{ id: "p1", name: "重点项目" }],
    milestones: [{ id: "m1", projectId: "p1" }],
    risks: [{ id: "risk1", projectId: "p1" }],
    decisionRequests: [{ id: "d1", projectId: "p1", dingTodo: { id: "ding-1" } }],
    statusUpdates: [{ id: "u1", projectId: "p1", owner: "项目负责人" }]
  });
  const child = reducePlatformState(base, { type: "archive_project_child", collection: "risks", id: "risk1", actor: "周总" });
  assert.equal(child.risks[0].archived, true);
  assert.throws(() => reducePlatformState(base, { type: "archive_project_child", collection: "strategies", id: "p1" }), /不支持/);

  const archived = reducePlatformState(base, { type: "archive_project", id: "p1", actor: "周总" });
  assert.equal(archived.projects[0].archived, true);
  assert.equal(archived.milestones[0].archived, true);
  assert.equal(archived.risks[0].archived, true);
  assert.equal(archived.decisionRequests[0].archived, true);
  assert.equal(archived.decisionRequests[0].dingTodo.id, "ding-1");

  const weekly = reducePlatformState(base, { type: "archive_status_update", id: "u1", actor: "项目负责人" });
  assert.equal(weekly.statusUpdates[0].archived, true);
  const edited = reducePlatformState(base, { type: "upsert_status_update", record: { ...base.statusUpdates[0], change: "已完成投放复盘" }, actor: "项目负责人" });
  assert.equal(edited.statusUpdates[0].change, "已完成投放复盘");
  assert.equal(edited.auditLogs[0].action, "update");
});

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
