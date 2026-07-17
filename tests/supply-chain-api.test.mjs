import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/supply-chain.js";
import { normalizeSupplyChainState } from "../src/domain/supplyChain.js";

function createD1Mock() {
  const records = new Map();
  const meta = new Map();
  const db = {
    records,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          if (/delete from supply_chain_records/i.test(sql)) {
            const [entityType] = statement.values;
            [...records.keys()].filter(key => key.startsWith(`${entityType}:`)).forEach(key => records.delete(key));
          } else if (/insert into supply_chain_records/i.test(sql)) {
            const [entityType, id, payload, updatedAt, updatedBy] = statement.values;
            records.set(`${entityType}:${id}`, { entity_type: entityType, id, payload, updated_at: updatedAt, updated_by: updatedBy });
          } else if (/insert into supply_chain_meta/i.test(sql)) {
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
          if (/from supply_chain_meta/i.test(sql)) return meta.has(statement.values[0]) ? { value: meta.get(statement.values[0]) } : null;
          return null;
        }
      };
      return statement;
    },
    async batch(statements) {
      return Promise.all(statements.map(statement => statement.run()));
    }
  };
  return db;
}

const executive = { name: "周总", role: "executive", department: "总经办" };

test("supply-chain API requires D1 and rejects unrelated departments", async () => {
  const missing = await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain"),
    env: {},
    data: { session: executive }
  });
  assert.equal(missing.status, 501);

  const forbidden = await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain"),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { name: "品牌同事", department: "品牌部" } }
  });
  assert.equal(forbidden.status, 403);
});

test("supply-chain API round-trips collections as separate D1 records", async () => {
  const db = createD1Mock();
  const state = normalizeSupplyChainState({
    suppliers: [{ id: "s1", name: "杭州鲜宠食品" }],
    purchaseApprovals: [{ id: "purchase-1", processInstanceId: "purchase-1", supplierId: "s1", productIds: ["p1"] }],
    paymentApprovals: [{ id: "pay-1", processInstanceId: "pay-1", purchaseProcessInstanceId: "purchase-1", amount: 300, status: "COMPLETED" }]
  });
  const post = await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain", { method: "POST", body: JSON.stringify({ state }) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  assert.equal(post.status, 200);
  assert.ok(db.records.has("suppliers:s1"));
  assert.ok(db.records.has("paymentApprovals:pay-1"));

  const get = await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain"),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  const payload = await get.json();
  assert.equal(get.status, 200);
  assert.equal(payload.state.suppliers[0].name, "杭州鲜宠食品");
  assert.equal(payload.state.paymentApprovals[0].amount, 300);
});

test("quality department can read quality data without payment details", async () => {
  const db = createD1Mock();
  const state = normalizeSupplyChainState({
    suppliers: [{ id: "s1", name: "供应商", paymentTerms: "月结30天", bankAccount: "6222" }],
    paymentApprovals: [{ id: "pay-1", processInstanceId: "pay-1", amount: 300, status: "COMPLETED" }],
    qualityIssues: [{ id: "q1", productId: "p1", content: "包装破损", status: "open" }]
  });
  await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain", { method: "POST", body: JSON.stringify({ state }) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain"),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { name: "质量同事", department: "质量管理部" } }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.state.paymentApprovals.length, 0);
  assert.equal(payload.state.suppliers[0].paymentTerms, undefined);
  assert.equal(payload.state.qualityIssues[0].content, "包装破损");
});

test("department writes are limited to their owned collections", async () => {
  const db = createD1Mock();
  const initial = normalizeSupplyChainState({ suppliers: [{ id: "s1", name: "原供应商" }] });
  await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain", { method: "POST", body: JSON.stringify({ state: initial }) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });

  const qualityState = normalizeSupplyChainState({
    suppliers: [{ id: "s1", name: "不应被质量部修改" }],
    qualityIssues: [{ id: "q1", productId: "p1", content: "异味", status: "open" }]
  });
  const write = await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain", { method: "POST", body: JSON.stringify({ state: qualityState }) }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { name: "质量同事", department: "质量管理部" } }
  });
  assert.equal(write.status, 200);

  const get = await onRequest({ request: new Request("https://flow.example.com/api/supply-chain"), env: { PRODUCT_FLOW_DB: db }, data: { session: executive } });
  const state = (await get.json()).state;
  assert.equal(state.suppliers[0].name, "原供应商");
  assert.equal(state.qualityIssues[0].content, "异味");
});

test("readonly sessions cannot write supply-chain state", async () => {
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/supply-chain", { method: "POST", body: JSON.stringify({ state: normalizeSupplyChainState() }) }),
    env: { PRODUCT_FLOW_DB: createD1Mock() },
    data: { session: { name: "访客", role: "readonly", department: "总经办" } }
  });
  assert.equal(response.status, 403);
});
