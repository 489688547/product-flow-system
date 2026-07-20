import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import {
  fetchGoodsFlowDashboard,
  fetchGoodsFlowInventory,
  freezeGoodsFlowCcc,
  saveGoodsFlowTerm,
  transitionGoodsFlowStocktake
} from "../src/state/goodsFlowApi.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("goods-flow client reads v1 envelopes", async () => {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    return response({ data: { metrics: { cccDays: 67.4 } }, meta: { version: 2 } });
  };
  const payload = await fetchGoodsFlowDashboard({ fetchImpl });
  assert.equal(payload.data.metrics.cccDays, 67.4);
  assert.equal(calls[0].url, "/api/platform/v1/goods-flow/dashboard");
  assert.equal(calls[0].options.headers.accept, "application/json");
});

test("goods-flow client retains stable API error evidence", async () => {
  const fetchImpl = async () => response({
    error: { code: "GOODS_FLOW_STORAGE_UNAVAILABLE", message: "数据库未配置", requestId: "request-1", retryable: true }
  }, 501);
  await assert.rejects(
    () => fetchGoodsFlowInventory({ fetchImpl }),
    error => error.code === "GOODS_FLOW_STORAGE_UNAVAILABLE"
      && error.requestId === "request-1"
      && error.retryable === true
      && /数据库未配置/.test(error.message)
  );
});

test("network failures explain that the last successful projection is retained", async () => {
  const fetchImpl = async () => { throw new TypeError("Failed to fetch"); };
  await assert.rejects(() => fetchGoodsFlowDashboard({ fetchImpl }), /上次成功数据/);
});

test("goods-flow writes send idempotency and optimistic versions", async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return response({ data: { ok: true }, meta: { version: 2 } });
  };
  await saveGoodsFlowTerm({ fetchImpl, term: { id: "term-1" }, idempotencyKey: "term-key" });
  await transitionGoodsFlowStocktake({ fetchImpl, id: "stocktake-1", action: "confirm_difference", expectedVersion: 1, idempotencyKey: "stocktake-key" });
  await freezeGoodsFlowCcc({ fetchImpl, month: "2026-07", expectedVersion: 2, idempotencyKey: "freeze-key" });
  assert.deepEqual(calls.map(call => [call.options.method, call.options.headers["idempotency-key"]]), [
    ["PUT", "term-key"], ["POST", "stocktake-key"], ["POST", "freeze-key"]
  ]);
  assert.equal(JSON.parse(calls[1].options.body).expectedVersion, 1);
});

test("GoodsFlowProvider does not persist financial facts in localStorage", () => {
  const source = fs.readFileSync(new URL("../src/state/GoodsFlowProvider.jsx", import.meta.url), "utf8");
  const main = fs.readFileSync(new URL("../src/main.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /localStorage|sessionStorage/);
  assert.match(source, /setStale\(true\)/);
  assert.match(source, /dashboard,\s*inventory,\s*terms,\s*stocktakes/);
  assert.match(main, /<GoodsFlowProvider enabled=\{hasSupplyChainAccess\}>/);
});
