import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/platform.js";

function createD1Mock() {
  const records = new Map();
  const meta = new Map();
  return {
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (/delete from platform_records/i.test(sql)) {
            const [entityType] = statement.values;
            [...records.keys()].filter(key => key.startsWith(`${entityType}:`)).forEach(key => records.delete(key));
          } else if (/insert into platform_records/i.test(sql)) {
            const [entityType, id, payload, updatedAt, updatedBy] = statement.values;
            records.set(`${entityType}:${id}`, { entity_type: entityType, id, payload, updated_at: updatedAt, updated_by: updatedBy });
          } else if (/insert into platform_meta/i.test(sql)) {
            const [key, value] = statement.values;
            meta.set(key, value);
          }
          return { success: true };
        },
        async all() {
          if (/select entity_type/i.test(sql)) return { results: [...records.values()] };
          return { results: [] };
        },
        async first() {
          if (/from platform_meta/i.test(sql)) return meta.has(statement.values[0]) ? { value: meta.get(statement.values[0]) } : null;
          return null;
        }
      };
      return statement;
    }
  };
}

test("platform API requires a D1 database binding", async () => {
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/platform"),
    env: {},
    data: { session: { name: "周总", role: "executive" } }
  });
  assert.equal(response.status, 501);
  assert.match((await response.json()).message, /PRODUCT_FLOW_DB/);
});

test("platform API rejects readonly writes", async () => {
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/platform", { method: "POST", body: JSON.stringify({ state: {} }) }),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { name: "访客", role: "readonly" } }
  });
  assert.equal(response.status, 403);
});

test("platform API stores strategy entities as separate D1 records", async () => {
  const db = createD1Mock();
  const state = {
    version: "strategy-platform-v1",
    updatedAt: "2026-07-16T00:00:00.000Z",
    strategies: [{ id: "s1", name: "增长战略" }],
    objectives: [{ id: "o1", strategyId: "s1", title: "季度目标" }],
    metrics: [],
    projects: [{ id: "p1", objectiveId: "o1", name: "重点项目" }],
    milestones: [],
    risks: [],
    decisionRequests: [],
    personalTodos: [{ id: "todo-1", sourceType: "milestone", sourceId: "m1", title: "完成首发" }],
    statusUpdates: [],
    monthlySnapshots: [],
    appLinks: [],
    appEvents: [],
    appRegistry: [{ id: "product-flow", name: "产品全周期" }],
    auditLogs: []
  };
  const post = await onRequest({
    request: new Request("https://flow.example.com/api/platform", { method: "POST", body: JSON.stringify({ state }) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { name: "周总", role: "executive" } }
  });
  assert.equal(post.status, 200);

  const get = await onRequest({
    request: new Request("https://flow.example.com/api/platform"),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { name: "周总", role: "executive" } }
  });
  const payload = await get.json();
  assert.equal(get.status, 200);
  assert.equal(payload.state.strategies[0].name, "增长战略");
  assert.equal(payload.state.projects[0].name, "重点项目");
  assert.equal(payload.state.personalTodos[0].title, "完成首发");
  assert.equal(payload.state.appRegistry[0].id, "product-flow");
});
