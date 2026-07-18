import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as onPerformanceRequest } from "../functions/api/performance-management.js";
import { onRequest as onActionsRequest } from "../functions/api/performance-management/actions.js";

function createD1Mock() {
  const records = new Map();
  const meta = new Map();
  return {
    prepare(sql) {
      const statement = {
        values: [], bind(...values) { statement.values = values; return statement; },
        async run() {
          if (/delete from performance_management_records/i.test(sql)) {
            const [type] = statement.values; [...records.keys()].filter(key => key.startsWith(`${type}:`)).forEach(key => records.delete(key));
          } else if (/insert into performance_management_records/i.test(sql)) {
            const [type, id, payload] = statement.values; records.set(`${type}:${id}`, { entity_type: type, id, payload });
          } else if (/insert into performance_management_meta/i.test(sql)) meta.set(statement.values[0], statement.values[1]);
          return { success: true };
        },
        async all() { return /from performance_management_records/i.test(sql) ? { results: [...records.values()] } : { results: [] }; },
        async first() { return /from performance_management_meta/i.test(sql) && meta.has(statement.values[0]) ? { value: meta.get(statement.values[0]) } : null; }
      }; return statement;
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
}

const hr = { userId: "hr-1", name: "人事", department: "人事行政部", title: "人事主管" };
const manager = { userId: "m-1", name: "主管", department: "运营部", title: "运营主管", managedUserIds: ["e-1", "e-2"] };
const employee = { userId: "e-1", name: "员工", department: "运营部", title: "运营" };

test("performance API requires authentication and limits ordinary employee view", async () => {
  const missing = await onPerformanceRequest({ request: new Request("https://example.com/api/performance-management"), env: {}, data: {} });
  assert.equal(missing.status, 401);
  const db = createD1Mock();
  await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_assessment", record: { id: "mine", employeeId: "e-1", employeeName: "员工", month: "2026-07", items: [{ weight: 100, target: 10, actual: 9, formula: "completion" }] } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_assessment", record: { id: "other", employeeId: "e-2", employeeName: "其他", month: "2026-07", items: [{ weight: 100, target: 10, actual: 8, formula: "completion" }] } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  const response = await onPerformanceRequest({ request: new Request("https://example.com/api/performance-management"), env: { PRODUCT_FLOW_DB: db }, data: { session: employee } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.state.assessments.map(item => item.id), ["mine"]);
});

test("employee can only self-review own assessment and HR freezes it", async () => {
  const db = createD1Mock();
  await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_assessment", record: { id: "a-1", employeeId: "e-1", month: "2026-07", items: [{ weight: 100, target: 10, actual: 9, formula: "completion" }] } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  const self = await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "submit_self_review", id: "a-1", selfScore: 90, selfComment: "完成重点任务" } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: employee } });
  assert.equal(self.status, 200);
  const managerReview = await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "manager_score", id: "a-1", finalScore: 90, reason: "证据已核验" } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  assert.equal(managerReview.status, 200);
  const deniedFreeze = await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "freeze_assessment", id: "a-1" } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  assert.equal(deniedFreeze.status, 403);
  const freeze = await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "freeze_assessment", id: "a-1" } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: hr } });
  assert.equal(freeze.status, 200);
});

test("unknown actions and injected approval states are rejected or normalized", async () => {
  const db = createD1Mock();
  const unknown = await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "export_everything" } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: employee } });
  assert.equal(unknown.status, 400);
  const create = await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_assessment", record: { id: "a-injected", employeeId: "e-1", status: "frozen", items: [{ weight: 100, target: 1, actual: 1, formula: "completion" }] } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  assert.equal((await create.json()).state.assessments[0].status, "self_review");
});

test("a manager cannot read or score another manager's assessments", async () => {
  const db = createD1Mock();
  await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_assessment", record: { id: "a-1", employeeId: "e-1", month: "2026-07", items: [{ weight: 100, target: 10, actual: 9, formula: "completion" }] } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  const otherManager = { userId: "m-2", name: "其他主管", department: "运营部", title: "运营主管" };
  const get = await onPerformanceRequest({ request: new Request("https://example.com/api/performance-management"), env: { PRODUCT_FLOW_DB: db }, data: { session: otherManager } });
  assert.equal((await get.json()).state.assessments.length, 0);
  const score = await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "manager_score", id: "a-1", finalScore: 90, reason: "越权" } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: otherManager } });
  assert.equal(score.status, 403);
});

test("manager assessment creation is limited to authorized employees", async () => {
  const db = createD1Mock();
  const outsider = await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_assessment", record: { id: "outside", employeeId: "e-9", month: "2026-07", items: [{ weight: 100, target: 10, formula: "completion" }] } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  assert.equal(outsider.status, 403);
  await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "upsert_manager_assignment", record: { id: "scope-1", managerId: "m-2", employeeId: "e-9" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: hr } });
  const assignedManager = { userId: "m-2", name: "指定主管", department: "运营部", title: "运营主管" };
  const allowed = await onActionsRequest({ request: new Request("https://example.com/api/performance-management/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_assessment", record: { id: "assigned", employeeId: "e-9", month: "2026-07", items: [{ weight: 100, target: 10, actual: 999, formula: "completion" }] } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: assignedManager } });
  const payload = await allowed.json();
  assert.equal(allowed.status, 200);
  assert.equal(payload.state.assessments[0].suggestedScore, null);
  assert.equal(payload.state.assessments[0].items[0].actual, null);
});
