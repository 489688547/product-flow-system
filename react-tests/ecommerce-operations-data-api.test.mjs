import assert from "node:assert/strict";
import test from "node:test";

import { loadOperationsSupplyData } from "../src/state/ecommerceOperationsDataApi.js";

function response(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

test("operations supply adapter consumes governed inventory and dashboard read APIs", async () => {
  const calls = [];
  const fetchImpl = async url => {
    calls.push(url);
    if (url.includes("/inventory")) return response({ data: [{ skuId: "sku-1", sellableQuantity: 8, daysOfSupply: 4 }], meta: { coverage: { stocktake: 0.8 } } });
    return response({ data: { metrics: { inventoryDays: 32, stockoutRate: 4.2, confidence: "complete" } }, meta: { coverage: { inventory: 1 } } });
  };
  const result = await loadOperationsSupplyData({ through: "2026-07-21", fetchImpl });
  assert.deepEqual(calls, [
    "/api/platform/v1/goods-flow/inventory?through=2026-07-21",
    "/api/platform/v1/goods-flow/dashboard"
  ]);
  assert.equal(result.inventory[0].daysOfSupply, 4);
  assert.equal(result.dashboard.metrics.stockoutRate, 4.2);
  assert.deepEqual(result.quality, { inventoryCoverage: 0.8, metricCoverage: { inventory: 1 }, confidence: "complete" });
});

test("operations supply adapter keeps a partial result when one endpoint is unavailable", async () => {
  const fetchImpl = async url => url.includes("/inventory")
    ? response({ error: { code: "GOODS_FLOW_STORAGE_UNAVAILABLE", message: "库存暂不可用" } }, 501)
    : response({ data: { metrics: { inventoryDays: 32 } }, meta: {} });
  const result = await loadOperationsSupplyData({ through: "2026-07-21", fetchImpl });
  assert.deepEqual(result.inventory, []);
  assert.equal(result.dashboard.metrics.inventoryDays, 32);
  assert.equal(result.partial, true);
});
