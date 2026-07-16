import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureMonthlyReports,
  incentiveBudgetCheck,
  settleIncentiveProject,
  strategyAttainment,
  transitionDepartmentCommitment,
  transitionMonthlyReport
} from "../src/domain/executionGovernance.js";
import { createDefaultPlatformState, normalizePlatformState, reducePlatformState } from "../src/domain/strategyExecution.js";

test("strategy attainment requires two to six results and every result verified", () => {
  const state = normalizePlatformState({
    strategies: [{ id: "s1" }],
    requiredResults: [
      { id: "r1", strategyId: "s1", status: "verified" },
      { id: "r2", strategyId: "s1", status: "completed" }
    ]
  });
  assert.deepEqual(strategyAttainment(state, "s1"), {
    attained: false,
    completed: 1,
    total: 2,
    results: state.requiredResults
  });
  state.requiredResults[1].status = "verified";
  assert.equal(strategyAttainment(state, "s1").attained, true);
  assert.equal(strategyAttainment(normalizePlatformState({ strategies: [{ id: "s2" }], requiredResults: [{ id: "only", strategyId: "s2", status: "verified" }] }), "s2").attained, false);
});

test("department commitment follows office and executive approval", () => {
  const draft = { id: "c1", status: "draft", acceptanceStandard: "完成验收" };
  const submitted = transitionDepartmentCommitment(draft, { type: "submit", actor: "部门负责人" });
  assert.equal(submitted.status, "office_review");
  const officeApproved = transitionDepartmentCommitment(submitted, { type: "office_approve", actor: "总经办" });
  assert.equal(officeApproved.status, "executive_review");
  const confirmed = transitionDepartmentCommitment(officeApproved, { type: "executive_confirm", actor: "老板" });
  assert.equal(confirmed.status, "active");
  assert.throws(() => transitionDepartmentCommitment(draft, { type: "office_approve" }), /当前状态/);
});

test("incentive budget escalates over-budget and cross-department projects", () => {
  const state = normalizePlatformState({
    departmentRewardBudgets: [{ id: "b1", department: "运营部", year: 2026, amount: 10000 }],
    incentiveProjects: [{ id: "p0", department: "运营部", year: 2026, rewardCap: 3000, status: "active" }]
  });
  assert.equal(incentiveBudgetCheck(state, { department: "运营部", year: 2026, rewardCap: 5000, partnerDepartments: [] }).requiresApproval, false);
  assert.equal(incentiveBudgetCheck(state, { department: "运营部", year: 2026, rewardCap: 8000, partnerDepartments: [] }).requiresApproval, true);
  assert.equal(incentiveBudgetCheck(state, { department: "运营部", year: 2026, rewardCap: 1000, partnerDepartments: ["品牌部"] }).requiresApproval, true);
});

test("department head records a reason and cannot exceed the reward cap", () => {
  const project = { id: "p1", status: "closing", rewardCap: 5000 };
  const settled = settleIncentiveProject(project, { amount: 4200, reason: "ROI 明显提升", decidedBy: "运营负责人", decidedAt: "2026-08-03T09:00:00.000Z" });
  assert.equal(settled.status, "closed");
  assert.equal(settled.payoutStatus, "pending");
  assert.equal(settled.finalReward, 4200);
  assert.throws(() => settleIncentiveProject(project, { amount: 6000, reason: "超额" }), /奖金上限/);
  assert.throws(() => settleIncentiveProject(project, { amount: 1000, reason: "" }), /决定理由/);
});

test("frozen monthly reports reject overwrite and accept append-only corrections", () => {
  const approved = { id: "mr1", status: "approved", corrections: [] };
  const frozen = transitionMonthlyReport(approved, { type: "freeze", actor: "总经办", meetingConclusion: "继续推进" });
  assert.equal(frozen.status, "frozen");
  assert.throws(() => transitionMonthlyReport(frozen, { type: "edit" }), /冻结/);
  const corrected = transitionMonthlyReport(frozen, { type: "append_correction", text: "更正数据口径", actor: "部门负责人", timestamp: "2026-08-06T10:00:00.000Z" });
  assert.equal(corrected.corrections[0].text, "更正数据口径");
  assert.equal(corrected.status, "frozen");
});

test("monthly report generation creates one manual draft per active department", () => {
  const state = normalizePlatformState({ monthlyReports: [{ id: "report-2026-06-运营部", month: "2026-06", department: "运营部" }] });
  const reports = ensureMonthlyReports(state, "2026-06", ["运营部", "品牌部", ""]);
  assert.equal(reports.length, 2);
  assert.equal(reports.find(item => item.department === "品牌部").status, "draft");
  assert.equal(reports.find(item => item.department === "品牌部").keyResults, "");
});

test("default state contains the three confirmed company strategies", () => {
  const names = createDefaultPlatformState().strategies.map(item => item.name);
  assert.deepEqual(names, ["组织建设", "鸟类销量突破", "仓鼠品牌升级"]);
});

test("department commitment approval is reduced and audited", () => {
  const state = normalizePlatformState({ departmentCommitments: [{ id: "c1", status: "office_review" }] });
  const next = reducePlatformState(state, {
    type: "transition_department_commitment",
    id: "c1",
    transition: "office_approve",
    actor: "总经办",
    timestamp: "2026-07-16T09:00:00.000Z"
  });
  assert.equal(next.departmentCommitments[0].status, "executive_review");
  assert.equal(next.auditLogs[0].entityType, "department_commitment");
  assert.equal(next.auditLogs[0].action, "office_approve");
});

test("monthly report transitions and incentive settlement are audited", () => {
  const state = normalizePlatformState({
    monthlyReports: [{ id: "mr1", status: "submitted" }],
    incentiveProjects: [{ id: "ip1", status: "closing", rewardCap: 5000 }]
  });
  const approved = reducePlatformState(state, { type: "transition_monthly_report", id: "mr1", transition: "approve", actor: "总经办" });
  assert.equal(approved.monthlyReports[0].status, "approved");
  const settled = reducePlatformState(approved, { type: "settle_incentive_project", id: "ip1", award: { amount: 3000, reason: "投流效率提升", decidedBy: "运营负责人" }, actor: "运营负责人" });
  assert.equal(settled.incentiveProjects[0].finalReward, 3000);
  assert.equal(settled.auditLogs[0].action, "settle");
});
