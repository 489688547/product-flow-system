import assert from "node:assert/strict";
import test from "node:test";
import {
  activeAssignment,
  buildHrOverview,
  computeSuggestedScore,
  createEmptyHrManagementState,
  normalizeHrManagementState,
  reduceHrManagementState,
  validatePerformanceItems
} from "../src/domain/hrManagement.js";

test("active employees require a stable DingTalk identity", () => {
  const draft = normalizeHrManagementState({
    employees: [{ id: "emp-1", name: "示例员工", employmentStatus: "draft" }]
  });
  assert.equal(draft.employees[0].employmentStatus, "draft");

  assert.throws(() => normalizeHrManagementState({
    employees: [{ id: "emp-1", name: "示例员工", employmentStatus: "active" }]
  }), /钉钉稳定身份/);

  const active = normalizeHrManagementState({
    employees: [{ id: "emp-1", userId: "u-1", name: "示例员工", employmentStatus: "active" }]
  });
  assert.equal(active.employees[0].userId, "u-1");
});

test("active assignment uses effective dates and the latest matching record", () => {
  const assignments = [
    { id: "a-1", employeeId: "emp-1", positionName: "运营助理", effectiveFrom: "2026-01-01", effectiveTo: "2026-06-30" },
    { id: "a-2", employeeId: "emp-1", positionName: "运营", effectiveFrom: "2026-07-01", effectiveTo: "" },
    { id: "a-3", employeeId: "emp-2", positionName: "设计", effectiveFrom: "2026-01-01", effectiveTo: "" }
  ];
  assert.equal(activeAssignment(assignments, "emp-1", "2026-06-15").positionName, "运营助理");
  assert.equal(activeAssignment(assignments, "emp-1", "2026-07-19").positionName, "运营");
  assert.equal(activeAssignment(assignments, "emp-1", "2025-12-31"), null);
});

test("performance items require exactly 100 weight and scoring rules", () => {
  assert.deepEqual(validatePerformanceItems([
    { id: "item-1", title: "销售目标", weight: 60, scoringRule: { version: 1, metricCode: "completion_rate", targetValue: 100, fullScore: 100 } },
    { id: "item-2", title: "复盘质量", weight: 40, scoringRule: { version: 1, metricCode: "review_score", targetValue: 5, fullScore: 100 } }
  ]), { valid: true, errors: [], totalWeight: 100 });

  const invalid = validatePerformanceItems([
    { id: "item-1", title: "销售目标", weight: 80 },
    { id: "item-2", title: "复盘质量", weight: 10, scoringRule: { version: 1, metricCode: "review_score", targetValue: 5, fullScore: 100 } }
  ]);
  assert.equal(invalid.valid, false);
  assert.equal(invalid.totalWeight, 90);
  assert.ok(invalid.errors.some(message => message.includes("100%")));
  assert.ok(invalid.errors.some(message => message.includes("评分规则")));
});

test("suggested score is deterministic and missing evidence stays null", () => {
  const item = {
    scoringRule: { version: 1, metricCode: "completion_rate", targetValue: 100, fullScore: 100 }
  };
  assert.deepEqual(computeSuggestedScore(item, { metrics: { completion_rate: 85 } }), {
    score: 85,
    explanation: "completion_rate 当前 85，目标 100，按规则 v1 计算为 85 分。",
    missing: []
  });
  assert.deepEqual(computeSuggestedScore(item, { metrics: {} }), {
    score: null,
    explanation: "缺少 completion_rate，无法计算系统建议分。",
    missing: ["completion_rate"]
  });
});

test("self suggested and manager scores remain separate in a frozen snapshot", () => {
  let state = createEmptyHrManagementState();
  state = reduceHrManagementState(state, {
    type: "upsert_performance_cycle",
    now: "2026-07-01T00:00:00.000Z",
    actor: "人事负责人",
    record: { id: "cycle-1", name: "7月绩效", periodStart: "2026-07-01", periodEnd: "2026-07-31", status: "review" }
  });
  state = reduceHrManagementState(state, {
    type: "upsert_performance_item",
    now: "2026-07-01T00:01:00.000Z",
    actor: "直属主管",
    record: {
      id: "item-1",
      cycleId: "cycle-1",
      employeeId: "emp-1",
      title: "重点产品推进",
      weight: 100,
      scoringRule: { version: 1, metricCode: "completion_rate", targetValue: 100, fullScore: 100 },
      suggestedScore: 85
    }
  });
  state = reduceHrManagementState(state, {
    type: "submit_self_review",
    now: "2026-08-01T00:00:00.000Z",
    actor: "员工",
    employeeId: "emp-1",
    cycleId: "cycle-1",
    items: [{ itemId: "item-1", selfScore: 82, selfComment: "完成主要目标" }]
  });
  state = reduceHrManagementState(state, {
    type: "submit_manager_review",
    now: "2026-08-02T00:00:00.000Z",
    actor: "直属主管",
    employeeId: "emp-1",
    cycleId: "cycle-1",
    items: [{ itemId: "item-1", managerScore: 88, managerComment: "结果达成且复盘完整" }]
  });
  state = reduceHrManagementState(state, {
    type: "freeze_performance_cycle",
    now: "2026-08-03T00:00:00.000Z",
    actor: "人事负责人",
    cycleId: "cycle-1"
  });

  const frozen = state.performanceCycles[0].frozenSnapshot.items[0];
  assert.equal(frozen.selfScore, 82);
  assert.equal(frozen.suggestedScore, 85);
  assert.equal(frozen.managerScore, 88);
  assert.equal(state.performanceCycles[0].status, "frozen");
});

test("a pending review blocks freeze and an employee gets one review request", () => {
  const base = normalizeHrManagementState({
    performanceCycles: [{ id: "cycle-1", name: "7月绩效", status: "manager_submitted" }],
    performanceItems: [{ id: "item-1", cycleId: "cycle-1", employeeId: "emp-1", weight: 100, selfScore: 80, suggestedScore: 85, managerScore: 82 }]
  });
  const requested = reduceHrManagementState(base, {
    type: "request_performance_review",
    cycleId: "cycle-1",
    employeeId: "emp-1",
    reason: "需要补充业务证据",
    actor: "员工",
    now: "2026-08-03T00:00:00.000Z"
  });
  assert.throws(() => reduceHrManagementState(requested, {
    type: "freeze_performance_cycle",
    cycleId: "cycle-1",
    actor: "人事负责人",
    now: "2026-08-04T00:00:00.000Z"
  }), /待处理复核/);
  assert.throws(() => reduceHrManagementState(requested, {
    type: "request_performance_review",
    cycleId: "cycle-1",
    employeeId: "emp-1",
    reason: "再次申请",
    actor: "员工",
    now: "2026-08-04T00:00:00.000Z"
  }), /仅能发起一次/);
});

test("freeze rejects an employee whose performance weights do not total 100", () => {
  const state = normalizeHrManagementState({
    performanceCycles: [{ id: "cycle-1", name: "7月绩效", status: "manager_submitted" }],
    performanceItems: [{
      id: "item-1",
      cycleId: "cycle-1",
      employeeId: "emp-1",
      title: "重点产品推进",
      weight: 90,
      selfScore: 80,
      suggestedScore: 85,
      managerScore: 82,
      scoringRule: { version: 1, metricCode: "completion_rate", targetValue: 100, fullScore: 100 }
    }]
  });
  assert.throws(() => reduceHrManagementState(state, {
    type: "freeze_performance_cycle",
    cycleId: "cycle-1",
    actor: "人事负责人",
    now: "2026-08-04T00:00:00.000Z"
  }), /权重合计必须为 100%/);
});

test("overview counts current-user performance and HR risks without payroll data", () => {
  const state = normalizeHrManagementState({
    lifecycleEvents: [{ id: "event-1", status: "in_progress", effectiveDate: "2026-07-20" }],
    performanceCycles: [{ id: "cycle-1", status: "self_review" }],
    performanceItems: [{ id: "item-1", cycleId: "cycle-1", employeeId: "emp-1", weight: 100 }]
  });
  const overview = buildHrOverview(state, { employeeId: "emp-1", roles: ["employee"] }, new Date("2026-07-19T00:00:00+08:00"));
  assert.equal(overview.counts.myPerformanceItems, 1);
  assert.equal(overview.counts.activeLifecycleEvents, 1);
  assert.equal("payroll" in overview.counts, false);
});
