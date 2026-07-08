import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

async function loadStateRequest() {
  try {
    return (await import("../functions/api/state.js")).onRequest;
  } catch {
    return null;
  }
}

function createD1Mock() {
  const store = new Map();
  const calls = [];
  return {
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
          if (/insert into product_flow_state/i.test(sql)) {
            const [id, version, payload, updatedAt, updatedBy] = statement.values;
            store.set(id, { id, version, payload, updated_at: updatedAt, updated_by: updatedBy });
          }
          return { success: true };
        },
        async first() {
          calls.push({ type: "first", sql, values: statement.values });
          return store.get(statement.values[0] || "company") || null;
        }
      };
      return statement;
    }
  };
}

test("state API requires a D1 database binding", async () => {
  const stateRequest = await loadStateRequest();
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
  const stateRequest = await loadStateRequest();
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
    config: { stages: [] }
  };

  const post = await stateRequest({
    request: new Request("https://flow.example.com/api/state", {
      method: "POST",
      body: JSON.stringify({ state: payload, updatedBy: "周总" })
    }),
    env: { PRODUCT_FLOW_DB: db }
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
  assert.equal(body.updatedBy, "周总");
});

test("frontend loads and saves product flow state through the shared state API", () => {
  assert.match(html, /async function syncSharedStateOnStartup\(/);
  assert.match(html, /async function persistSharedState\(/);
  assert.match(html, /fetch\("\/api\/state"/);
  assert.match(html, /feedbackIssues/);
  assert.match(html, /saveState\(\{ remote: false \}\)/);
});
