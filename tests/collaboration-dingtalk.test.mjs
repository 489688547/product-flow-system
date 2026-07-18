import test from "node:test";
import assert from "node:assert/strict";
import { buildCollaborationTodoPayload } from "../src/domain/collaborationNotifications.js";
import { onRequest as dingTalkRoute } from "../functions/api/platform/v1/collaboration-items/[id]/dingtalk.js";

const item = {
  id: "c1",
  title: "确认包装到货时间",
  requestedAction: "供应链确认预计到仓日期。",
  businessImpact: "影响新品上市。",
  status: "in_progress",
  dueAt: "2026-07-25T10:00:00.000Z",
  version: 2,
  requesterUser: { userId: "u-product", unionId: "union-product", name: "产品同事" },
  requesterDepartment: { id: "dept-product", name: "产品部" },
  ownerUser: { userId: "u-supply", unionId: "union-supply", name: "供应链同事" },
  ownerDepartment: { id: "dept-supply", name: "供应链" },
  partnerDepartments: [],
  source: { appId: "product-flow", sourceLabel: "鹦鹉谷物棒 · 包装到货" },
  dingTodo: null,
  updatedAt: "2026-07-18T08:00:00.000Z"
};
const session = { userId: "u-supply", unionId: "union-supply", name: "供应链同事", department: "供应链", departmentId: "dept-supply", role: "employee" };

test("collaboration todo payload uses a stable source and updates the same DingTalk task", () => {
  const first = buildCollaborationTodoPayload(item, session, "https://flow.example.com/#/collaboration/c1");
  const updated = buildCollaborationTodoPayload({ ...item, status: "closed", dingTodo: { id: "todo-1", creatorUnionId: "union-supply" } }, session, "https://flow.example.com/#/collaboration/c1");
  assert.equal(first.sourceId, "collaboration:c1");
  assert.equal(first.creatorUnionId, "union-supply");
  assert.deepEqual(first.executorUnionIds, ["union-supply"]);
  assert.equal(first.done, false);
  assert.equal(updated.todoId, "todo-1");
  assert.equal(updated.done, true);
});

test("collaboration todo payload rejects owners without a real DingTalk identity", () => {
  assert.throws(() => buildCollaborationTodoPayload({ ...item, ownerUser: { name: "供应链同事" } }, session, "https://flow.example.com"), /真实钉钉身份/);
});

test("platform DingTalk endpoint stores safe sync metadata and returns provider failures without rolling back the item", async () => {
  let stored = { ...item };
  const activities = [];
  const dependencies = {
    async ensureTables() {},
    async findItem() { return stored; },
    async updateItem(_db, next, expectedVersion, activity) {
      if (stored.version !== expectedVersion) return false;
      stored = next;
      activities.push(activity);
      return true;
    },
    async getAccessToken() { return "token"; },
    async syncTodo(_token, payload) { return { id: payload.todoId || "todo-1", updated: Boolean(payload.todoId) }; }
  };
  const success = await dingTalkRoute({
    request: new Request("https://flow.example.com/api/platform/v1/collaboration-items/c1/dingtalk", { method: "POST", body: JSON.stringify({ version: 2, detailUrl: "https://flow.example.com/#/collaboration/c1" }) }),
    env: { PRODUCT_FLOW_DB: {} }, data: { session, collaborationDingTalkDependencies: dependencies }, params: { id: "c1" }
  });
  const payload = await success.json();
  assert.equal(success.status, 200);
  assert.equal(payload.item.dingTodo.id, "todo-1");
  assert.equal(payload.item.dingTodo.sourceId, "collaboration:c1");
  assert.equal(activities[0].action, "sync_dingtalk");
  assert.doesNotMatch(JSON.stringify(stored.dingTodo), /token/i);

  dependencies.syncTodo = async () => { throw new Error("provider unavailable"); };
  const failure = await dingTalkRoute({
    request: new Request("https://flow.example.com/api/platform/v1/collaboration-items/c1/dingtalk", { method: "POST", body: JSON.stringify({ version: stored.version, detailUrl: "https://flow.example.com/#/collaboration/c1" }) }),
    env: { PRODUCT_FLOW_DB: {} }, data: { session, collaborationDingTalkDependencies: dependencies }, params: { id: "c1" }
  });
  const failurePayload = await failure.json();
  assert.equal(failure.status, 502);
  assert.equal(failurePayload.error.code, "DINGTALK_TODO_SYNC_FAILED");
  assert.equal(stored.status, "in_progress");
  assert.equal(stored.dingTodo.lastError, "钉钉待办同步失败，请稍后重试。");
});
