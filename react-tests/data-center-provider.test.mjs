import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { dataCenterApiUrl, dataCenterRangeFromSearch, dataCenterSalesApiUrl, loadDataCenterSales, loadDataCenterState } from "../src/state/dataCenterApi.js";

test("data center API URLs are stable and date scoped", () => {
  assert.equal(dataCenterApiUrl(), "/api/data-center");
  assert.equal(dataCenterSalesApiUrl({ from: "2026-07-01", to: "2026-07-17" }), "/api/data-center/sales?from=2026-07-01&to=2026-07-17");
});

test("data center preview accepts a valid date range from the page query", () => {
  const fallback = { from: "2026-07-01", to: "2026-07-17" };
  assert.deepEqual(dataCenterRangeFromSearch("?from=2026-06-01&to=2026-06-30", fallback), {
    from: "2026-06-01",
    to: "2026-06-30"
  });
  assert.deepEqual(dataCenterRangeFromSearch("?from=bad&to=2026-06-30", fallback), fallback);
  assert.deepEqual(dataCenterRangeFromSearch("?from=2026-07-02&to=2026-07-01", fallback), fallback);
});

test("fresh remote metadata is a valid empty state even before its first save", async () => {
  const payload = await loadDataCenterState(async () => new Response(JSON.stringify({
    synced: false,
    updatedAt: "",
    state: { sources: [], metricDefinitions: [] }
  }), { status: 200 }));

  assert.deepEqual(payload.state.sources, []);
});

test("sales loader uses shared data center endpoint when available", async () => {
  const calls = [];
  const payload = await loadDataCenterSales({
    from: "2026-07-01",
    to: "2026-07-17",
    codes: ["690000000001"],
    fetchImpl: async url => {
      calls.push(url);
      return new Response(JSON.stringify({ rows: [{ code: "690000000001", date: "2026-07-16", platform: "抖音" }], meta: { timeBasis: "create_time" } }), { status: 200 });
    },
    fallback: async () => { throw new Error("fallback should not run"); }
  });
  assert.deepEqual(calls, ["/api/data-center/sales?from=2026-07-01&to=2026-07-17"]);
  assert.equal(payload.rows.length, 1);
  assert.equal(payload.local, false);
});

test("data center read clients retry one transient storage outage", async () => {
  let salesAttempts = 0;
  const sales = await loadDataCenterSales({
    from: "2026-07-01",
    to: "2026-07-21",
    fetchImpl: async () => {
      salesAttempts += 1;
      if (salesAttempts === 1) return new Response(JSON.stringify({
        message: "线上数据库连接暂时中断，请稍后重试。",
        error: { code: "DATA_STORAGE_TEMPORARILY_UNAVAILABLE", retryable: true }
      }), { status: 503 });
      return new Response(JSON.stringify({ rows: [], meta: { latestDataDate: "2026-07-21" } }), { status: 200 });
    }
  });
  assert.equal(salesAttempts, 2);
  assert.equal(sales.meta.latestDataDate, "2026-07-21");

  let metadataAttempts = 0;
  const metadata = await loadDataCenterState(async () => {
    metadataAttempts += 1;
    if (metadataAttempts === 1) return new Response(JSON.stringify({
      message: "线上数据库连接暂时中断，请稍后重试。",
      error: { code: "DATA_STORAGE_TEMPORARILY_UNAVAILABLE", retryable: true }
    }), { status: 503 });
    return new Response(JSON.stringify({ synced: true, state: { sources: [] } }), { status: 200 });
  });
  assert.equal(metadataAttempts, 2);
  assert.deepEqual(metadata.state.sources, []);
});

test("sales loader falls back to browser repository only when shared storage is unavailable", async () => {
  const fallbackCodes = [];
  const payload = await loadDataCenterSales({
    from: "2026-07-01",
    to: "2026-07-17",
    codes: ["690000000001", "690000000002"],
    fetchImpl: async () => new Response(JSON.stringify({ message: "D1 unavailable" }), { status: 501 }),
    fallback: async codes => {
      fallbackCodes.push(...codes);
      return [
        { code: "690000000001", date: "2026-07-10", platform: "抖音", sales: 1000, qty: 100 },
        { code: "690000000001", date: "2026-07-11", platform: "抖音", sales: 1000, qty: 100 },
        { code: "690000000001", date: "2026-07-12", platform: "抖音", sales: 1000, qty: 100 },
        { code: "690000000001", date: "2026-07-13", platform: "抖音", sales: 1000, qty: 100 },
        { code: "690000000001", date: "2026-07-14", platform: "抖音", sales: 1000, qty: 100 },
        { code: "690000000001", date: "2026-07-15", platform: "抖音", sales: 1000, qty: 100 },
        { code: "690000000001", date: "2026-07-16", platform: "抖音", sales: 1000, qty: 100 },
        { code: "690000000001", date: "2026-07-17", platform: "抖音", sales: 10, qty: 1 },
        { code: "690000000002", date: "2026-07-17", platform: "其它" },
        { code: "690000000002", date: "2026-06-30", platform: "天猫" }
      ];
    }
  });
  assert.deepEqual(fallbackCodes, ["690000000001", "690000000002"]);
  assert.equal(payload.rows.length, 8);
  assert.deepEqual([...new Set(payload.rows.map(row => row.platform))], ["抖音"]);
  assert.equal(payload.local, true);
  assert.equal(payload.meta.timeBasis, "create_time");
  assert.equal(payload.meta.excludeOther, true);
  assert.equal(payload.meta.latestDataDate, "2026-07-17");
  assert.deepEqual(payload.meta.latestDailyFacts, [
    { date: "2026-07-10", sales: 1000, qty: 100 },
    { date: "2026-07-11", sales: 1000, qty: 100 },
    { date: "2026-07-12", sales: 1000, qty: 100 },
    { date: "2026-07-13", sales: 1000, qty: 100 },
    { date: "2026-07-14", sales: 1000, qty: 100 },
    { date: "2026-07-15", sales: 1000, qty: 100 },
    { date: "2026-07-16", sales: 1000, qty: 100 },
    { date: "2026-07-17", sales: 10, qty: 1 }
  ]);
});

test("provider derives SKU codes, debounces metadata and never persists sales rows in localStorage", () => {
  const source = fs.readFileSync(new URL("../src/state/DataCenterProvider.jsx", import.meta.url), "utf8");
  assert.match(source, /useProductFlow/);
  assert.match(source, /skuCodes/);
  assert.match(source, /fetchSalesForCodes/);
  assert.match(source, /setTimeout\([\s\S]*600/);
  assert.doesNotMatch(source, /localStorage\.setItem\([^\n]*(salesRows|salesData|rows)/);
});
