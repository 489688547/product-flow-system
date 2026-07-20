import assert from "node:assert/strict";
import test from "node:test";
import {
  archiveDataStandard,
  createDataStandard,
  DataStandardsApiError,
  loadDataStandard,
  loadDataStandards,
  loadMetricResults,
  pollMetricResults,
  previewDataStandard,
  publishDataStandardVersion,
  requestMetricCalculation,
  runAuthorizedDataStandardsWrite
} from "../src/state/dataStandardsApi.js";

function ok(payload = { synced: true }) {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "content-type": "application/json" } });
}

test("data standards client builds stable filtered URLs", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return ok({ synced: true, definitions: [] });
  };
  await loadDataStandards({ category: "sales", ownerDepartment: "财务部", status: "active", ignored: "no" }, fetchImpl);
  await loadDataStandard("standard/a b", fetchImpl);
  await loadMetricResults({ metricCodes: ["sales.net_sales", "sales.quantity"], from: "2026-07-01", to: "2026-07-19", dimensions: { platform: "抖音" }, runId: "run-1" }, fetchImpl);

  assert.equal(calls[0].url, "/api/platform/v1/data-standards?category=sales&ownerDepartment=%E8%B4%A2%E5%8A%A1%E9%83%A8&status=active");
  assert.equal(calls[1].url, "/api/platform/v1/data-standards/standard%2Fa%20b");
  assert.equal(calls[2].url, "/api/platform/v1/data-standards/results?metricCodes=sales.net_sales%2Csales.quantity&from=2026-07-01&to=2026-07-19&runId=run-1&dimensions=%7B%22platform%22%3A%22%E6%8A%96%E9%9F%B3%22%7D");
});

test("write clients send only contract fields", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: options?.body ? JSON.parse(options.body) : null });
    return ok({ synced: true });
  };
  const draft = {
    metricCode: "sales.net_sales", name: "净销售额", category: "sales", ownerDepartment: "财务部",
    unit: "CNY", period: "day", effectiveFrom: "2026-07-01", displayFormula: "求和",
    formulaAst: { type: "constant", value: 1, unit: "CNY" }, sourceFields: ["sales.net_sales"],
    expectedVersion: 1, actor: "forged", arbitrary: "drop"
  };
  await createDataStandard(draft, fetchImpl);
  await publishDataStandardVersion("standard-1", draft, fetchImpl);
  await archiveDataStandard("standard-1", { expectedVersion: 1, actor: "forged" }, fetchImpl);
  await previewDataStandard({ ...draft, from: "2026-07-01", to: "2026-07-19", runId: "drop" }, fetchImpl);
  await requestMetricCalculation({ metricCodes: ["sales.net_sales"], from: "2026-07-01", to: "2026-07-19", targetVersions: {}, mode: "ensure_current", confirmed: false, idempotencyKey: "client", actor: "drop" }, fetchImpl);

  assert.deepEqual(Object.keys(calls[0].body).sort(), ["category", "displayFormula", "effectiveFrom", "expectedVersion", "formulaAst", "metricCode", "name", "ownerDepartment", "period", "sourceFields", "unit"].sort());
  assert.equal(calls[0].url, "/api/platform/v1/data-standards");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[1].options.method, "PUT");
  assert.deepEqual(calls[2].body, { expectedVersion: 1 });
  assert.deepEqual(Object.keys(calls[3].body).sort(), [...Object.keys(calls[0].body), "from", "to"].sort());
  assert.equal("actor" in calls[4].body, false);
});

test("client preserves stable server error metadata", async () => {
  await assert.rejects(
    () => createDataStandard({}, async () => new Response(JSON.stringify({
      synced: false,
      message: "版本冲突",
      retryable: false,
      error: { code: "DATA_STANDARD_VERSION_CONFLICT", details: { currentVersion: 2 } }
    }), { status: 409 })),
    error => error instanceof DataStandardsApiError
      && error.status === 409
      && error.code === "DATA_STANDARD_VERSION_CONFLICT"
      && error.details.currentVersion === 2
      && error.retryable === false
  );
});

test("unauthorized writes stop before invoking the network operation", async () => {
  let calls = 0;
  await assert.rejects(
    () => runAuthorizedDataStandardsWrite(false, async () => { calls += 1; }),
    error => error.code === "PERMISSION_WRITE_DENIED" && error.status === 403
  );
  assert.equal(calls, 0);
});

test("result polling stops on success or failure and supports abort", async () => {
  let attempts = 0;
  const success = await pollMetricResults({ runId: "run-1" }, {
    fetchImpl: async () => ok(++attempts < 3
      ? { synced: true, run: { id: "run-1", status: "pending" }, results: [] }
      : { synced: true, run: { id: "run-1", status: "succeeded" }, results: [{ metricCode: "sales.net_sales", value: 8 }] }),
    waitImpl: async milliseconds => assert.equal(milliseconds, 800)
  });
  assert.equal(attempts, 3);
  assert.equal(success.results[0].value, 8);

  attempts = 0;
  const failed = await pollMetricResults({ runId: "run-2" }, {
    fetchImpl: async () => ok({ synced: true, run: { id: "run-2", status: ++attempts > 1 ? "failed" : "pending", errorCode: "DATA_STANDARD_CALCULATION_FAILED" }, results: [] }),
    waitImpl: async () => {}
  });
  assert.equal(failed.run.status, "failed");
  assert.equal(attempts, 2);

  const controller = new AbortController();
  await assert.rejects(() => pollMetricResults({ runId: "run-3" }, {
    fetchImpl: async () => ok({ synced: true, run: { status: "pending" }, results: [] }),
    signal: controller.signal,
    waitImpl: async () => controller.abort()
  }), error => error.name === "AbortError");
});
