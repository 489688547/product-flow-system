import assert from "node:assert/strict";
import test from "node:test";
import { createSalesRepairRequestHandler } from "../functions/api/platform/v1/data-services/sales-repair.js";

const anomalyFacts = [
  ["2026-07-14", 100, 10], ["2026-07-15", 120, 12], ["2026-07-16", 110, 11], ["2026-07-17", 130, 13],
  ["2026-07-18", 90, 9], ["2026-07-19", 105, 10], ["2026-07-20", 115, 12], ["2026-07-21", 20, 2]
].map(([date, sales, qty]) => ({ date, sales, qty }));

function request(date = "2026-07-21") {
  return new Request("https://flow.example.com/api/platform/v1/data-services/sales-repair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ date })
  });
}

function dependencies(overrides = {}) {
  const writes = [];
  const executionInputs = [];
  let executions = 0;
  return {
    writes,
    executionInputs,
    get executions() { return executions; },
    ensure: async () => {},
    latestFacts: async () => anomalyFacts,
    getRun: async () => null,
    putRun: async (_db, run) => { writes.push(run); },
    execute: async input => { executions += 1; executionInputs.push(input); },
    ...overrides
  };
}

test("sales repair API requires an operations or executive writable session", async () => {
  const handler = createSalesRepairRequestHandler(dependencies());
  const missingSession = await handler({ request: request(), env: { PRODUCT_FLOW_DB: {} }, data: {} });
  const missingPayload = await missingSession.json();
  assert.equal(missingSession.status, 401);
  assert.match(missingPayload.requestId, /^req_|^[0-9a-f-]{36}$/i);
  assert.equal(missingPayload.error.requestId, missingPayload.requestId);
  assert.equal(missingPayload.error.retryable, false);
  assert.equal((await handler({ request: request(), env: { PRODUCT_FLOW_DB: {} }, data: { session: { department: "财务部" } } })).status, 403);
  assert.equal((await handler({ request: request(), env: { PRODUCT_FLOW_DB: {} }, data: { session: { department: "运营部", role: "readonly" } } })).status, 403);
});

test("sales repair API rechecks the anomaly and schedules one idempotent background run", async () => {
  const deps = dependencies();
  const waits = [];
  const handler = createSalesRepairRequestHandler(deps);
  const response = await handler({
    request: request(),
    env: { PRODUCT_FLOW_DB: {} },
    data: {
      session: { name: "运营主管", userId: "u-1", department: "运营部" },
      dataEnvironment: { id: "display", version: 7 }
    },
    waitUntil: promise => waits.push(promise)
  });
  const payload = await response.json();
  assert.equal(response.status, 202);
  assert.equal(payload.run.status, "running");
  assert.equal(payload.run.attempts, 1);
  assert.equal(deps.writes.length, 1);
  assert.equal(waits.length, 1);
  await waits[0];
  assert.equal(deps.executions, 1);
  assert.deepEqual(deps.executionInputs[0].dataEnvironment, { id: "display", version: 7 });
});

test("sales repair API does not reschedule a running or exhausted date", async () => {
  for (const existing of [
    { id: "run", date: "2026-07-21", status: "running", attempts: 1 },
    { id: "run", date: "2026-07-21", status: "failed", attempts: 2 }
  ]) {
    const deps = dependencies({ getRun: async () => existing });
    const waits = [];
    const response = await createSalesRepairRequestHandler(deps)({
      request: request(),
      env: { PRODUCT_FLOW_DB: {} },
      data: { session: { role: "executive", department: "总经办" } },
      waitUntil: promise => waits.push(promise)
    });
    assert.equal(response.status, 200);
    assert.equal(waits.length, 0);
    assert.equal(deps.writes.length, 0);
  }
});
