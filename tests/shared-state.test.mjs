import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

async function loadStateModule() {
  try {
    return await import("../functions/api/state.js");
  } catch {
    return null;
  }
}

function createD1Mock({ maxTextBytes = Infinity } = {}) {
  const store = new Map();
  const parts = new Map();
  const calls = [];
  const db = {
    calls,
    prepare(sql) {
      const statement = {
        sql,
        values: [],
        bind(...values) {
          statement.values = values;
          return statement;
        },
        async run() {
          calls.push({ type: "run", sql, values: statement.values });
          const oversized = statement.values.find(value => typeof value === "string" && Buffer.byteLength(value) > maxTextBytes);
          if (oversized) throw new Error("D1_ERROR: string or blob too big: SQLITE_TOOBIG");
          if (/insert into product_flow_state\s*\(/i.test(sql)) {
            const [id, version, payload, updatedAt, updatedBy] = statement.values;
            store.set(id, { id, version, payload, updated_at: updatedAt, updated_by: updatedBy });
          }
          if (/delete from product_flow_state_parts/i.test(sql)) {
            const [stateId] = statement.values;
            [...parts.keys()].filter(key => key.startsWith(`${stateId}:`)).forEach(key => parts.delete(key));
          }
          if (/insert into product_flow_state_parts/i.test(sql)) {
            const [stateId, partKey, partIndex, payload, updatedAt, updatedBy] = statement.values;
            parts.set(`${stateId}:${partKey}:${partIndex}`, {
              state_id: stateId,
              part_key: partKey,
              part_index: partIndex,
              payload,
              updated_at: updatedAt,
              updated_by: updatedBy
            });
          }
          if (/delete from product_flow_state where/i.test(sql)) store.delete(statement.values[0]);
          return { success: true };
        },
        async first() {
          calls.push({ type: "first", sql, values: statement.values });
          return store.get(statement.values[0] || "company") || null;
        },
        async all() {
          calls.push({ type: "all", sql, values: statement.values });
          if (/from production_data_snapshots/i.test(sql)) return { results: [] };
          const prefix = `${statement.values[0] || "company"}:`;
          return {
            results: [...parts.entries()]
              .filter(([key]) => key.startsWith(prefix))
              .map(([, value]) => value)
              .sort((a, b) => a.part_key.localeCompare(b.part_key) || a.part_index - b.part_index)
          };
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

test("state API requires a D1 database binding", async () => {
  const stateRequest = (await loadStateModule())?.onRequest;
  assert.ok(stateRequest, "functions/api/state.js should export onRequest");
  const response = await stateRequest({
    request: new Request("https://flow.example.com/api/state"),
    env: {}
  });
  const body = await response.json();

  assert.equal(response.status, 501);
  assert.match(body.message, /PRODUCT_FLOW_DB/);
});

test("state API persists company data including demand pool and issue submissions", async () => {
  const stateModule = await loadStateModule();
  const stateRequest = stateModule?.onRequest;
  assert.ok(stateRequest, "functions/api/state.js should export onRequest");
  const db = createD1Mock();
  const payload = {
    version: "test-version",
    currentId: "p1",
    demands: [{ id: "d1", name: "新机会", status: "待讨论" }],
    products: [{ id: "p1", name: "产品一" }],
    tasks: [{ id: "t1", productId: "p1", title: "会前准备" }],
    deliverables: [{ id: "doc1", productId: "p1", name: "纪要" }],
    reviews: [{ id: "r1", productId: "p1", title: "评审会" }],
    decisions: [{ id: "x1", title: "结论" }],
    feedbackIssues: [{ id: "bug1", desc: "按钮点不动", screenshot: "data:image/png;base64,aaa" }],
    productPlans: [{ id: "plan1", demandId: "d1", developmentStart: "2026-08-01", developmentEnd: "2026-09-01", launchStart: "2026-09-01", launchEnd: "2026-09-15" }],
    config: { stages: [] }
  };

  const seeded = await stateModule.writeCompanyState(db, payload, "初始状态");
  const post = await stateRequest({
    request: new Request("https://flow.example.com/api/state", {
      method: "POST",
      body: JSON.stringify({ state: payload, baseUpdatedAt: seeded.updatedAt })
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { userId: "u1", unionId: "union1", name: "周总", role: "executive" } }
  });
  const posted = await post.json();
  assert.equal(post.status, 200);
  assert.equal(posted.synced, true);

  const get = await stateRequest({
    request: new Request("https://flow.example.com/api/state"),
    env: { PRODUCT_FLOW_DB: db }
  });
  const body = await get.json();

  assert.equal(get.status, 200);
  assert.equal(body.state.demands[0].name, "新机会");
  assert.equal(body.state.feedbackIssues[0].desc, "按钮点不动");
  assert.equal(body.state.productPlans[0].id, "plan1");
  assert.equal(body.updatedBy, "周总");
});

test("state API shards payloads that exceed the D1 row limit and reconstructs them", async () => {
  const stateModule = await loadStateModule();
  const stateRequest = stateModule?.onRequest;
  const db = createD1Mock({ maxTextBytes: 2_000_000 });
  const image = `data:image/png;base64,${"a".repeat(2_100_000)}`;
  const payload = {
    version: "oversized-test",
    currentId: "p1",
    demands: [],
    products: [{ id: "p1", name: "超大图片产品" }],
    tasks: [],
    deliverables: [{ id: "file1", productId: "p1", name: "原图", url: image }],
    reviews: [],
    decisions: [],
    feedbackIssues: [],
    productPlans: [],
    config: { stages: [] }
  };

  const seeded = await stateModule.writeCompanyState(db, { ...payload, deliverables: [] }, "初始状态");
  const post = await stateRequest({
    request: new Request("https://flow.example.com/api/state", {
      method: "POST",
      body: JSON.stringify({ state: payload, baseUpdatedAt: seeded.updatedAt })
    }),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: { userId: "u1", unionId: "union1", name: "周总", role: "executive" } }
  });
  const posted = await post.json();

  assert.equal(post.status, 200, posted.message);
  const get = await stateRequest({
    request: new Request("https://flow.example.com/api/state"),
    env: { PRODUCT_FLOW_DB: db }
  });
  const body = await get.json();
  assert.equal(body.state.deliverables[0].url, image);
  const partWrites = db.calls.filter(call => call.type === "run" && /insert into product_flow_state_parts/i.test(call.sql));
  assert.ok(partWrites.length > 1);
  assert.ok(partWrites.every(call => Buffer.byteLength(call.values[3]) <= 1_000_000));
});

test("frontend loads and saves product flow state through the shared state API", () => {
  assert.match(html, /<script[^>]+type="module"[^>]+src="\/(?:src|assets)\//);
  const sourceEntry = /src="\/src\//.test(html);
  const javascript = sourceEntry
    ? ["../src/state/ProductFlowProvider.jsx", "../src/state/stateApi.js"].map(path => readFileSync(new URL(path, import.meta.url), "utf8")).join("\n")
    : readdirSync(new URL("../assets/", import.meta.url))
      .filter(name => name.endsWith(".js"))
      .map(name => readFileSync(new URL(name, new URL("../assets/", import.meta.url)), "utf8"))
      .join("\n");
  assert.match(javascript, /\/api\/state/);
  assert.match(javascript, /feedbackIssues/);
  assert.match(javascript, /productPlans/);
});
