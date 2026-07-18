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

test("operator creates a complete plan and manager approves it", async () => {
  const db = createD1Mock();
  const create = await onActionsRequest({
    request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({
      action: { type: "upsert_plan", record: { id: "p-1", ownerId: "o-1", platform: "抖音", store: "旗舰店", evidence: ["近7日GMV下降"], goals: ["GMV增长20%"], issues: ["素材衰退"], countermeasures: ["补充素材"], monitors: ["日GMV"] } }
    }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(create.status, 200);
  const submit = await onActionsRequest({
    request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ expectedRevision: 1, action: { type: "submit_plan", id: "p-1" } }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: operator }
  });
  assert.equal(submit.status, 200);
  const approve = await onActionsRequest({
    request: new Request("https://example.com/api/ecommerce-operations/actions", { method: "POST", body: JSON.stringify({ expectedRevision: 2, action: { type: "review_plan", id: "p-1", decision: "approved", reason: "目标与资源匹配" } }) }),
    env: { PRODUCT_FLOW_DB: db }, data: { session: manager }
  });
  const payload = await approve.json();
  assert.equal(approve.status, 200);
  assert.equal(payload.state.plans[0].status, "approved");
});

test("performance evidence contains accepted execution but no scores", async () => {
  const db = createD1Mock();
  const seed = [
    { type: "upsert_plan", record: { id: "p-1", ownerId: "o-1", platform: "抖音", store: "旗舰店", status: "approved", version: 2 } },
    { type: "append_execution", record: { id: "e-1", planId: "p-1", ownerId: "o-1", status: "accepted", acceptance: "完成两轮素材实验", updatedAt: "2026-07-30T00:00:00.000Z" } }
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
