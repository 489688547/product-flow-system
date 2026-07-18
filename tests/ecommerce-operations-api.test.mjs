import test from "node:test";
import assert from "node:assert/strict";
import { onRequest as onOperationsRequest } from "../functions/api/ecommerce-operations.js";
import { onRequest as onActionsRequest } from "../functions/api/ecommerce-operations/actions.js";
import { onRequest as onEvidenceRequest } from "../functions/api/ecommerce-operations/evidence.js";

function createD1Mock() {
  const records = new Map();
  const meta = new Map();
  return {
    records,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() {
          if (/delete from ecommerce_operation_records/i.test(sql)) {
            const [type] = statement.values;
            [...records.keys()].filter(key => key.startsWith(`${type}:`)).forEach(key => records.delete(key));
          } else if (/insert into ecommerce_operation_records/i.test(sql)) {
            const [type, id, payload] = statement.values;
            records.set(`${type}:${id}`, { entity_type: type, id, payload });
          } else if (/insert into ecommerce_operation_meta/i.test(sql)) {
            meta.set(statement.values[0], statement.values[1]);
          }
          return { success: true };
        },
        async all() {
          if (/from ecommerce_operation_records/i.test(sql)) return { results: [...records.values()] };
          return { results: [] };
        },
        async first() {
          if (/from ecommerce_operation_meta/i.test(sql)) return meta.has(statement.values[0]) ? { value: meta.get(statement.values[0]) } : null;
          return null;
        }
      };
      return statement;
    },
    async batch(statements) { return Promise.all(statements.map(statement => statement.run())); }
  };
}

const manager = { userId: "m-1", name: "运营主管", department: "运营部", title: "运营主管" };
const operator = { userId: "o-1", name: "运营甲", department: "运营部", title: "运营" };

test("operations API enforces session and department access", async () => {
  const missing = await onOperationsRequest({ request: new Request("https://example.com/api/ecommerce-operations"), env: {}, data: {} });
  assert.equal(missing.status, 401);
  const forbidden = await onOperationsRequest({ request: new Request("https://example.com/api/ecommerce-operations"), env: { PRODUCT_FLOW_DB: createD1Mock() }, data: { session: { department: "外部" } } });
  assert.equal(forbidden.status, 403);
});

test("collaboration departments only receive their assigned queue", async () => {
  const db = createD1Mock();
  await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "upsert_collaboration", record: { id: "c-supply", title: "确认库存", targetDepartment: "供应链部" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "upsert_plan", record: { id: "private-plan", platform: "抖音", store: "旗舰店" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: operator } });
  const response = await onOperationsRequest({ request: new Request("https://example.com/api/ecommerce-operations"), env: { PRODUCT_FLOW_DB: db }, data: { session: { userId: "s-1", department: "供应链部" } } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.state.collaborations.map(item => item.id), ["c-supply"]);
  assert.equal(payload.state.plans.length, 0);
});

test("department manager can decide collaboration without rewriting its ownership", async () => {
  const db = createD1Mock();
  await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "upsert_collaboration", record: { id: "c-safe", title: "确认库存", targetDepartment: "供应链部", dueDate: "2026-07-25" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  const supplyManager = { userId: "s-m-1", name: "供应链主管", department: "供应链部", title: "供应链主管" };
  const response = await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "respond_collaboration", id: "c-safe", record: { id: "c-safe", status: "accepted", reason: "库存已确认", ownerId: "attacker", targetDepartment: "财务部", title: "篡改" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: supplyManager } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.state.collaborations[0].title, "确认库存");
  assert.equal(payload.state.collaborations[0].targetDepartment, "供应链部");
  assert.equal(payload.state.collaborations[0].ownerId, "m-1");
  assert.equal(payload.state.collaborations[0].status, "accepted");
});

test("operator creates a complete plan and manager approves it", async () => {
  const db = createD1Mock();
  await onActionsRequest({
    request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_cycle", record: { id: "cycle-p-1", ownerId: "o-1", ownerName: "运营甲", product: "主粮", month: "2026-07" } } }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: manager }
  });
  const create = await onActionsRequest({
    request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({
      action: { type: "upsert_plan", record: { id: "p-1", cycleId: "cycle-p-1", ownerId: "o-1", platform: "抖音", store: "旗舰店", evidence: ["近7日GMV下降"], goals: ["GMV增长20%"], issues: ["素材衰退"], countermeasures: ["补充素材"], monitors: ["日GMV"] } }
    }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(create.status, 200);
  const submit = await onActionsRequest({
    request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ expectedRevision: 2, action: { type: "submit_plan", id: "p-1" } }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(submit.status, 200);
  const approve = await onActionsRequest({
    request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ expectedRevision: 3, action: { type: "review_plan", id: "p-1", decision: "approved", reason: "目标与资源匹配" } }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: manager }
  });
  const payload = await approve.json();
  assert.equal(approve.status, 200);
  assert.equal(payload.state.plans[0].status, "approved");
});

test("operators cannot inject plan approval or accepted execution evidence", async () => {
  const db = createD1Mock();
  await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_cycle", record: { id: "cycle-1", ownerId: "o-1", ownerName: "运营甲", product: "主粮", month: "2026-07" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  const injected = await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "upsert_plan", record: { id: "p-injected", cycleId: "cycle-1", ownerId: "someone", platform: "抖音", store: "旗舰店", status: "approved" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: operator } });
  const payload = await injected.json();
  assert.equal(payload.state.plans[0].status, "draft");
  assert.equal(payload.state.plans[0].ownerId, "o-1");
  const execution = await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "append_execution", record: { planId: "p-injected", status: "accepted" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: operator } });
  assert.equal(execution.status, 403);
  const unknown = await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "approve_everything" } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: operator } });
  assert.equal(unknown.status, 400);
});

test("performance evidence contains accepted execution but no scores", async () => {
  const db = createD1Mock();
  const seed = [
    { type: "create_cycle", record: { id: "cycle-evidence", ownerId: "o-1", ownerName: "运营甲", product: "主粮", month: "2026-07" } },
    { type: "upsert_plan", record: { id: "p-1", cycleId: "cycle-evidence", ownerId: "o-1", ownerName: "运营甲", platform: "抖音", store: "旗舰店", evidence: ["近7日GMV下降"], goals: ["GMV增长20%"], issues: ["素材衰退"], countermeasures: ["补充素材"], monitors: ["日GMV"] } },
    { type: "submit_plan", id: "p-1" },
    { type: "review_plan", id: "p-1", decision: "approved", reason: "方案可执行" },
    { type: "append_execution", record: { id: "e-1", planId: "p-1", progress: "完成两轮素材实验", monitorData: "GMV增长20%", nextAction: "继续放量" } },
    { type: "review_execution", id: "e-1", decision: "accepted", reason: "完成两轮素材实验" }
  ];
  for (const action of seed) {
    await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  }
  const response = await onEvidenceRequest({ request: new Request("https://example.com/api/ecommerce-operations/evidence?employeeId=o-1&month=2026-07"), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.evidence.length, 1);
  assert.equal(payload.evidence[0].score, undefined);
});

test("executive office can read the global operations loop but cannot write it", async () => {
  const db = createD1Mock();
  await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_cycle", record: { id: "cycle-global", ownerId: "o-1", product: "主粮", month: "2026-07" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: manager } });
  const executive = { userId: "exec-1", name: "总经理", department: "总经办", title: "总经理" };
  const view = await onOperationsRequest({ request: new Request("https://example.com/api/ecommerce-operations"), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  assert.equal((await view.json()).state.cycles.length, 1);
  const write = await onActionsRequest({ request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ action: { type: "create_cycle", record: { ownerId: "o-1", product: "砂", month: "2026-07" } } }) }), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  assert.equal(write.status, 403);
});
