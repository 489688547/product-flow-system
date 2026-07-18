import test from "node:test";
import assert from "node:assert/strict";
import {
  calculateSuggestedScore,
  createDefaultPerformanceState,
  reducePerformanceState,
  validateAssessmentTemplate
} from "../src/domain/performanceManagement.js";

test("assessment weights must total 100", () => {
  assert.deepEqual(validateAssessmentTemplate({ items: [{ weight: 50 }, { weight: 40 }] }), ["考核项权重合计必须为 100%"]);
  assert.deepEqual(validateAssessmentTemplate({ items: [{ weight: 60 }, { weight: 40 }] }), []);
});

test("system suggested score requires complete formulas and data", () => {
  assert.equal(calculateSuggestedScore([{ weight: 60, formula: "completion", actual: 120, target: 100 }, { weight: 40, formula: "completion", actual: 80, target: 100 }]), 92);
  assert.equal(calculateSuggestedScore([{ weight: 100, target: 0, actual: 1 }]), null);
});

test("employee self score, manager final score and HR freeze form an audited workflow", () => {
  let state = createDefaultPerformanceState();
  state = reducePerformanceState(state, { type: "create_assessment", actor: { userId: "hr", name: "人事" }, record: { id: "a-1", employeeId: "e-1", month: "2026-07", items: [{ id: "i-1", weight: 100, target: 10, actual: 9, formula: "completion" }] } });
  state = reducePerformanceState(state, { type: "submit_self_review", actor: { userId: "e-1", name: "员工" }, id: "a-1", selfScore: 88, selfComment: "完成重点产品测试" });
  state = reducePerformanceState(state, { type: "manager_score", actor: { userId: "m-1", name: "主管" }, id: "a-1", finalScore: 75, reason: "证据不足" });
  state = reducePerformanceState(state, { type: "freeze_assessment", actor: { userId: "hr", name: "人事" }, id: "a-1" });
  assert.equal(state.assessments[0].status, "frozen");
  assert.equal(state.assessments[0].selfScore, 88);
  assert.equal(state.assessments[0].finalScore, 75);
  assert.equal(state.auditLogs.length, 4);
  assert.throws(() => reducePerformanceState(state, { type: "manager_score", id: "a-1", finalScore: 90 }), /已冻结/);
});

test("large scoring difference requires a reason and review is limited to once", () => {
  let state = createDefaultPerformanceState();
  state = reducePerformanceState(state, { type: "create_assessment", record: { id: "a-1", employeeId: "e-1", month: "2026-07", items: [{ weight: 100, target: 10, actual: 10, formula: "completion" }] } });
  state = reducePerformanceState(state, { type: "submit_self_review", id: "a-1", selfScore: 95, selfComment: "完成" });
  assert.throws(() => reducePerformanceState(state, { type: "manager_score", id: "a-1", finalScore: 70 }), /说明原因/);
  state = reducePerformanceState(state, { type: "request_review", id: "a-1", reason: "请复核证据" });
  assert.throws(() => reducePerformanceState(state, { type: "request_review", id: "a-1", reason: "再次复核" }), /仅可申请一次/);
});
