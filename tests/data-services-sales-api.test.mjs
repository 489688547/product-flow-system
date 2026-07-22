import test from "node:test";
import assert from "node:assert/strict";
import { onRequest } from "../functions/api/platform/v1/data-services/sales.js";
import { loadSalesDataAvailability, querySalesDataService, rangeForSalesMonth, salesDataServiceUrl } from "../src/state/dataServicesApi.js";

const executive = { name: "周总", role: "executive", department: "总经办" };

function createD1Mock() {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      const statement = {
        values: [],
        bind(...values) { statement.values = values; return statement; },
        async run() { return { success: true }; },
        async all() {
          calls.push({ sql, values: statement.values });
          if (/substr\(date, 1, 7\)/i.test(sql)) return { results: [
            { month: "2026-07", row_count: 2 },
            { month: "2026-06", row_count: 1 }
          ] };
          return { results: [] };
        },
        async first() {
          calls.push({ sql, values: statement.values });
          if (/select payload from product_sales_meta/i.test(sql)) return { payload: JSON.stringify({ imports: [{ importedAt: "2026-07-22T01:00:00.000Z" }] }) };
          if (/sum\(qty\)/i.test(sql)) return { row_count: 2, quantity: 3, net_sales: 185, platform_count: 2, earliest_date: "2026-07-16", latest_date: "2026-07-17" };
          if (/min\(date\)/i.test(sql)) return { earliest_date: "2026-06-01", latest_date: "2026-07-17", total_rows: 3 };
          return null;
        }
      };
      return statement;
    }
  };
}

test("sales data service exposes actual D1 coverage without a range query", async () => {
  const db = createD1Mock();
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/data-services/sales"),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.availability, {
    earliestDate: "2026-06-01",
    latestDate: "2026-07-17",
    totalRows: 3,
    availableMonths: [
      { month: "2026-07", rowCount: 2 },
      { month: "2026-06", rowCount: 1 }
    ]
  });
  assert.equal(payload.contract.timeBasis, "create_time");
  assert.equal(payload.contract.excludeOther, true);
  assert.equal(db.calls.some(call => /sum\(qty\)/i.test(call.sql)), false);
});

test("sales data service returns one operational summary for an explicit range", async () => {
  const db = createD1Mock();
  const response = await onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/data-services/sales?from=2026-07-01&to=2026-07-17"),
    env: { PRODUCT_FLOW_DB: db },
    data: { session: executive }
  });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.query, { from: "2026-07-01", to: "2026-07-17" });
  assert.deepEqual(payload.summary, { rowCount: 2, quantity: 3, netSales: 185, platformCount: 2, earliestDate: "2026-07-16", latestDate: "2026-07-17" });
  const aggregate = db.calls.find(call => /sum\(qty\)/i.test(call.sql));
  assert.deepEqual(aggregate.values, ["2026-07-01", "2026-07-17"]);
  assert.match(aggregate.sql, /其它/);
});

test("sales data service rejects partial ranges and unauthorized sessions", async () => {
  const partial = await onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/data-services/sales?from=2026-07-01"),
    env: { PRODUCT_FLOW_DB: createD1Mock() }, data: { session: executive }
  });
  assert.equal(partial.status, 400);
  assert.equal((await partial.json()).error.code, "DATA_SERVICE_DATE_RANGE_INVALID");

  const forbidden = await onRequest({
    request: new Request("https://flow.example.com/api/platform/v1/data-services/sales"),
    env: { PRODUCT_FLOW_DB: createD1Mock() }, data: { session: { name: "品牌同事", department: "品牌部" } }
  });
  assert.equal(forbidden.status, 403);
});

test("sales data service client only adds dates for an explicit query", async () => {
  assert.equal(salesDataServiceUrl(), "/api/platform/v1/data-services/sales");
  assert.equal(salesDataServiceUrl({ from: "2026-06-01", to: "2026-07-17" }), "/api/platform/v1/data-services/sales?from=2026-06-01&to=2026-07-17");
  const seen = [];
  const fetchImpl = async url => {
    seen.push(url);
    return new Response(JSON.stringify({ synced: true, availability: {}, summary: {} }), { status: 200 });
  };
  await loadSalesDataAvailability(fetchImpl);
  await querySalesDataService({ from: "2026-06-01", to: "2026-07-17" }, fetchImpl);
  assert.deepEqual(seen, [
    "/api/platform/v1/data-services/sales",
    "/api/platform/v1/data-services/sales?from=2026-06-01&to=2026-07-17"
  ]);
});

test("month shortcut fills a draft range without querying", () => {
  assert.deepEqual(rangeForSalesMonth("2026-06", "2026-07-17"), { from: "2026-06-01", to: "2026-06-30" });
  assert.deepEqual(rangeForSalesMonth("2026-07", "2026-07-17"), { from: "2026-07-01", to: "2026-07-17" });
});
