import test from "node:test";
import assert from "node:assert/strict";
import {
  buildPerformanceEvidence,
  createDefaultEcommerceOperationsState,
  reduceEcommerceOperationsState,
  summarizeEcommerceOperations,
  validateStorePlan
} from "../src/domain/ecommerceOperations.js";

const completePlan = {
  id: "plan-douyin",
  cycleId: "cycle-1",
  platform: "抖音",
  store: "抖音旗舰店",
  ownerId: "u-ops",
  ownerName: "运营甲",
  evidence: [{ id: "ev-1", metricCode: "sales.net_sales", value: 120000, observedAt: "2026-07-17", quality: "healthy" }],
  goals: [{ id: "goal-1", metricCode: "sales.net_sales", baseline: 120000, target: 200000, dueDate: "2026-07-31" }],
  issues: [{ id: "issue-1", statement: "新客成交承接偏弱", rationale: "新客转化率显著低于老客", evidenceIds: ["ev-1"] }],
  countermeasures: [{ id: "action-1", issueId: "issue-1", title: "优化新客首屏", ownerId: "u-ops", dueDate: "2026-07-22", stopLoss: "转化率连续 7 天无改善则停止", status: "active" }],
  monitors: [{ id: "monitor-1", countermeasureId: "action-1", metricCode: "conversion.new_customer", kind: "result", target: 3.8 }]
};

test("store plan validation requires the complete evidence-to-monitor chain", () => {
  assert.deepEqual(validateStorePlan({ id: "empty" }), ["现状证据", "目标", "核心问题", "对策", "检测指标", "平台店铺负责人"]);
  assert.deepEqual(validateStorePlan(completePlan), []);
});

test("operations reducer versions approved plans and audits supervisor decisions", () => {
  let state = createDefaultEcommerceOperationsState();
  state = reduceEcommerceOperationsState(state, {
    type: "create_cycle",
    actor: { userId: "u-lead", name: "运营主管", department: "运营部", title: "运营负责人" },
    timestamp: "2026-07-18T08:00:00.000Z",
    record: { id: "cycle-1", month: "2026-07", productId: "p1", productName: "莓果冻干主粮", supervisorId: "u-lead", supervisorName: "运营主管" }
  });
  state = reduceEcommerceOperationsState(state, {
    type: "upsert_plan",
    actor: { userId: "u-ops", name: "运营甲", department: "运营部" },
    timestamp: "2026-07-18T08:05:00.000Z",
    record: completePlan
  });
  state = reduceEcommerceOperationsState(state, {
    type: "submit_plan",
    actor: { userId: "u-ops", name: "运营甲", department: "运营部" },
    timestamp: "2026-07-18T08:10:00.000Z",
    id: "plan-douyin"
  });
  state = reduceEcommerceOperationsState(state, {
    type: "review_plan",
    actor: { userId: "u-lead", name: "运营主管", department: "运营部", title: "运营负责人" },
    timestamp: "2026-07-18T08:20:00.000Z",
    id: "plan-douyin",
    decision: "approved",
    reason: "方案因果链完整"
  });
  assert.equal(state.plans[0].status, "approved");
  assert.equal(state.plans[0].version, 2);
  assert.equal(state.auditLogs[0].reason, "方案因果链完整");
  assert.ok(state.revision >= 4);
});

test("AI review is advisory and never changes plan approval state", () => {
  const initial = { ...createDefaultEcommerceOperationsState(), plans: [{ ...completePlan, status: "submitted", version: 1 }] };
  const next = reduceEcommerceOperationsState(initial, {
    type: "record_ai_review",
    actor: { userId: "u-ops", name: "运营甲", department: "运营部" },
    timestamp: "2026-07-18T09:00:00.000Z",
    record: { id: "ai-1", planId: "plan-douyin", planVersion: 1, recommendations: ["补充新客分层证据"] }
  });
  assert.equal(next.plans[0].status, "submitted");
  assert.equal(next.aiReviews[0].recommendations[0], "补充新客分层证据");
});

test("performance evidence exposes accepted work without performance scores", () => {
  const state = {
    ...createDefaultEcommerceOperationsState(),
    plans: [{ ...completePlan, status: "approved", version: 2 }],
    executions: [
      { id: "exec-1", planId: "plan-douyin", countermeasureId: "action-1", ownerId: "u-ops", title: "优化新客首屏", status: "accepted", acceptance: "转化率达到 3.8%", updatedAt: "2026-07-25T08:00:00.000Z" },
      { id: "exec-2", planId: "plan-douyin", ownerId: "u-ops", title: "未验收动作", status: "done" }
    ]
  };
  const evidence = buildPerformanceEvidence(state, { employeeId: "u-ops", month: "2026-07" });
  assert.equal(evidence.length, 1);
  assert.equal(evidence[0].sourceAppId, "ecommerce-operations");
  assert.equal(evidence[0].accepted, true);
  assert.equal("score" in evidence[0], false);
});

test("execution review requires a manager reason and accepted work becomes evidence", () => {
  let state = createDefaultEcommerceOperationsState();
  state = reduceEcommerceOperationsState(state, { type: "create_cycle", record: { id: "c-1", month: "2026-07", product: "主粮", ownerId: "o-1" } });
  state = reduceEcommerceOperationsState(state, { type: "upsert_plan", record: { id: "p-1", cycleId: "c-1", ownerId: "o-1", platform: "抖音", store: "旗舰店", status: "approved" } });
  state = reduceEcommerceOperationsState(state, { type: "append_execution", record: { id: "e-1", planId: "p-1", ownerId: "o-1", progress: "完成素材测试", monitorData: "ROI 2.1", nextAction: "继续放量" } });
  assert.throws(() => reduceEcommerceOperationsState(state, { type: "review_execution", id: "e-1", decision: "accepted" }), /说明/);
  state = reduceEcommerceOperationsState(state, { type: "review_execution", id: "e-1", decision: "accepted", reason: "数据与交付已核验" });
  assert.equal(state.executions[0].status, "accepted");
  assert.equal(buildPerformanceEvidence(state, { employeeId: "o-1", month: "2026-07" }).length, 1);
});

test("operations summary separates decision work from execution work", () => {
  const summary = summarizeEcommerceOperations({
    ...createDefaultEcommerceOperationsState(),
    cycles: [{ id: "c1", month: "2026-07", status: "active" }],
    plans: [{ id: "p1", status: "submitted" }, { id: "p2", status: "approved" }],
    collaborations: [{ id: "co1", status: "pending" }, { id: "co2", status: "overdue" }]
  });
  assert.deepEqual(summary, { activeCycles: 1, pendingReviews: 1, activePlans: 1, blockedCollaborations: 2 });
});

test("manager decisions enforce source states and monthly product uniqueness", () => {
  let state = reduceEcommerceOperationsState(createDefaultEcommerceOperationsState(), { type: "create_cycle", record: { id: "cycle-a", month: "2026-07", product: "主粮", ownerId: "o-1" } });
  assert.throws(() => reduceEcommerceOperationsState(state, { type: "create_cycle", record: { id: "cycle-b", month: "2026-07", product: "主粮", ownerId: "o-2" } }), /已存在/);
  state = reduceEcommerceOperationsState(state, { type: "upsert_plan", record: { ...completePlan, id: "draft-plan", cycleId: "cycle-a", status: "draft" } });
  assert.throws(() => reduceEcommerceOperationsState(state, { type: "review_plan", id: "draft-plan", decision: "approved", reason: "越级批准" }), /待审批/);
  state = reduceEcommerceOperationsState({ ...state, plans: [{ ...state.plans[0], status: "submitted" }] }, { type: "review_plan", id: "draft-plan", decision: "approved", reason: "正常批准" });
  assert.throws(() => reduceEcommerceOperationsState(state, { type: "review_plan", id: "draft-plan", decision: "returned", reason: "重复审批" }), /待审批/);
});
