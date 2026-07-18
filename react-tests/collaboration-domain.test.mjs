import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCollaborationTransition,
  buildExecutiveActions,
  canReadCollaborationItem,
  collaborationTransitionsFor,
  filterCollaborationItems,
  normalizeCollaborationDraft
} from "../src/domain/collaboration.js";
import { featureFlagEnabled } from "../src/domain/featureFlags.js";
import { canViewNavigation, DEFAULT_PERMISSIONS } from "../src/domain/permissions.js";

const NOW = new Date("2026-07-18T08:00:00.000Z");
const productDepartment = { id: "dept-product", name: "产品部" };
const supplyDepartment = { id: "dept-supply", name: "供应链" };
const brandDepartment = { id: "dept-brand", name: "品牌部" };
const productUser = { userId: "user-product", unionId: "union-product", name: "产品同事" };
const supplyUser = { userId: "user-supply", unionId: "union-supply", name: "供应链同事" };

const productActor = {
  ...productUser,
  departmentIds: [productDepartment.id],
  departmentNames: [productDepartment.name],
  executive: false,
  readonly: false
};
const supplyActor = {
  ...supplyUser,
  departmentIds: [supplyDepartment.id],
  departmentNames: [supplyDepartment.name],
  executive: false,
  readonly: false
};
const brandActor = {
  userId: "user-brand",
  unionId: "union-brand",
  name: "品牌同事",
  departmentIds: [brandDepartment.id],
  departmentNames: [brandDepartment.name],
  executive: false,
  readonly: false
};
const executiveActor = {
  userId: "user-executive",
  unionId: "union-executive",
  name: "总经办同事",
  departmentIds: ["dept-executive"],
  departmentNames: ["总经办"],
  executive: true,
  readonly: false
};

function draft(overrides = {}) {
  return normalizeCollaborationDraft({
    id: "collab-1",
    idempotencyKey: "product-flow:product:p1:task:task-1:handoff",
    kind: "handoff",
    title: "确认包装到货时间",
    description: "新品上市前需要确认首批包装到仓。",
    requestedAction: "供应链确认排期和预计到仓日期。",
    impactLevel: "high",
    businessImpact: "延期会影响新品上市。",
    requesterUser: productUser,
    requesterDepartment: productDepartment,
    ownerDepartment: supplyDepartment,
    ownerUser: null,
    partnerDepartments: [brandDepartment, supplyDepartment, brandDepartment],
    dueAt: "2026-07-25T18:00:00+08:00",
    source: {
      appId: "product-flow",
      entityType: "product",
      entityId: "p1",
      sourceRecordId: "task-1",
      sourceRoute: "#/progress/p1",
      sourceLabel: "鹦鹉谷物棒 · 包装到货"
    },
    strategyLinks: { strategyId: "strategy-1", requiredResultId: "result-1", projectId: "" },
    evidence: [{ label: "预计上市", value: "2026-08", basis: "产品规划", asOf: "2026-07-18" }],
    status: "pending_acceptance",
    version: 1,
    createdAt: "2026-07-18T07:00:00.000Z",
    updatedAt: "2026-07-18T07:00:00.000Z",
    ...overrides
  });
}

test("normalization keeps one owner department and removes duplicate partner departments", () => {
  const item = draft();
  assert.deepEqual(item.partnerDepartments, [brandDepartment]);
  assert.equal(item.ownerDepartment.id, supplyDepartment.id);
  assert.equal(item.status, "pending_acceptance");
  assert.equal(item.version, 1);
  assert.equal(item.source.appId, "product-flow");
});

test("a receiving department accepts one owner and appends an activity", () => {
  const item = draft();
  const result = applyCollaborationTransition(item, {
    transition: "accept",
    fields: { ownerUser: supplyUser },
    idempotencyKey: "accept-1"
  }, supplyActor, NOW);

  assert.equal(result.item.status, "in_progress");
  assert.equal(result.item.ownerUser.userId, supplyUser.userId);
  assert.equal(result.item.version, 2);
  assert.equal(result.activity.fromStatus, "pending_acceptance");
  assert.equal(result.activity.toStatus, "in_progress");
  assert.deepEqual(result.activity.changedFields.sort(), ["ownerUser", "status"]);
});

test("a decision owner records a decision and closes the item", () => {
  const item = draft({
    kind: "decision",
    ownerDepartment: { id: "dept-executive", name: "总经办" },
    decisionOwner: { userId: executiveActor.userId, unionId: executiveActor.unionId, name: executiveActor.name },
    ownerUser: { userId: executiveActor.userId, unionId: executiveActor.unionId, name: executiveActor.name }
  });
  const result = applyCollaborationTransition(item, {
    transition: "decide",
    idempotencyKey: "decide-1",
    fields: { decisionOutcome: "recommended", decisionSummary: "批准启用备选供应商。" }
  }, executiveActor, NOW);

  assert.equal(result.item.status, "closed");
  assert.equal(result.item.decisionOutcome, "recommended");
  assert.equal(result.item.decisionSummary, "批准启用备选供应商。");
  assert.ok(result.item.closedAt);
});

test("invalid actors and incomplete transition fields are rejected", () => {
  const item = draft();
  assert.deepEqual(collaborationTransitionsFor(item, brandActor), []);
  assert.throws(
    () => applyCollaborationTransition(item, { transition: "accept", fields: {}, idempotencyKey: "accept-2" }, supplyActor, NOW),
    /主负责人/
  );
  assert.throws(
    () => applyCollaborationTransition({ ...item, status: "in_progress", ownerUser: supplyUser }, { transition: "block", fields: {}, idempotencyKey: "block-1" }, supplyActor, NOW),
    /原因/
  );
});

test("only participants and executives can read an item", () => {
  const item = draft({ partnerDepartments: [brandDepartment] });
  assert.equal(canReadCollaborationItem(item, productActor), true);
  assert.equal(canReadCollaborationItem(item, supplyActor), true);
  assert.equal(canReadCollaborationItem(item, brandActor), true);
  assert.equal(canReadCollaborationItem(item, executiveActor), true);
  assert.equal(canReadCollaborationItem(item, { ...brandActor, departmentIds: ["dept-finance"], departmentNames: ["财务部"] }), false);
});

test("department views separate incoming execution waiting verification and participation", () => {
  const incoming = draft({ id: "incoming", partnerDepartments: [] });
  const executing = draft({ id: "executing", status: "in_progress", ownerUser: supplyUser, partnerDepartments: [] });
  const waiting = draft({ id: "waiting", status: "blocked", ownerUser: supplyUser, partnerDepartments: [] });
  const verification = draft({ id: "verification", status: "pending_verification", ownerUser: supplyUser, partnerDepartments: [] });
  const participating = draft({ id: "participating", status: "in_progress", ownerUser: supplyUser, partnerDepartments: [brandDepartment] });
  const items = [incoming, executing, waiting, verification, participating];

  assert.deepEqual(filterCollaborationItems(items, { view: "pending_acceptance" }, supplyActor, NOW).map(item => item.id), ["incoming"]);
  assert.deepEqual(filterCollaborationItems(items, { view: "in_progress" }, supplyActor, NOW).map(item => item.id).sort(), ["executing", "participating", "waiting"]);
  assert.deepEqual(filterCollaborationItems(items, { view: "waiting_others" }, productActor, NOW).map(item => item.id).sort(), ["executing", "incoming", "participating", "verification", "waiting"]);
  assert.deepEqual(filterCollaborationItems(items, { view: "pending_verification" }, productActor, NOW).map(item => item.id), ["verification"]);
  assert.deepEqual(filterCollaborationItems(items, { view: "participating" }, brandActor, NOW).map(item => item.id), ["participating"]);
});

test("executive actions exclude ordinary work and rank decisions and serious blockers", () => {
  const normalItem = draft({ id: "normal", impactLevel: "low", status: "in_progress", ownerUser: supplyUser });
  const blockedHighImpact = draft({
    id: "blocked",
    status: "blocked",
    ownerUser: supplyUser,
    blockedAt: "2026-07-17T06:00:00.000Z",
    updatedAt: "2026-07-17T06:00:00.000Z"
  });
  const decision = draft({
    id: "decision",
    kind: "decision",
    ownerDepartment: { id: "dept-executive", name: "总经办" },
    decisionOwner: { userId: executiveActor.userId, unionId: executiveActor.unionId, name: executiveActor.name },
    dueAt: "2026-07-18T10:00:00.000Z"
  });

  assert.deepEqual(buildExecutiveActions([normalItem], NOW), []);
  const actions = buildExecutiveActions([blockedHighImpact, decision], NOW);
  assert.deepEqual(actions.map(action => action.itemId), ["decision", "blocked"]);
  assert.equal(actions[0].reason, "decision_required");
  assert.equal(actions[1].reason, "high_impact_blocked");
});

test("collaboration is visible to employees while the feature flag stays production-safe", () => {
  assert.equal(canViewNavigation(DEFAULT_PERMISSIONS, { department: "财务部", title: "会计" }, "collaboration"), true);
  assert.equal(featureFlagEnabled("executiveCollaborationHub", { DEV: true }), true);
  assert.equal(featureFlagEnabled("executiveCollaborationHub", { DEV: false, VITE_EXECUTIVE_COLLABORATION_HUB: "true" }), true);
  assert.equal(featureFlagEnabled("executiveCollaborationHub", { DEV: false }), false);
});
