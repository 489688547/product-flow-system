import assert from "node:assert/strict";
import test from "node:test";
import { createGoodsFlowD1Mock } from "./helpers/goods-flow-d1-mock.mjs";
import { saveMonthlyMetrics } from "../functions/api/platform/v1/goods-flow/_shared/storage.js";
import { onRequest as dashboard } from "../functions/api/platform/v1/goods-flow/dashboard.js";
import { onRequest as imports } from "../functions/api/platform/v1/goods-flow/imports.js";
import { onRequest as inventory } from "../functions/api/platform/v1/goods-flow/inventory.js";
import { onRequest as receivableTerms } from "../functions/api/platform/v1/goods-flow/receivable-terms.js";
import { onRequest as stocktakes } from "../functions/api/platform/v1/goods-flow/stocktakes.js";
import { onRequest as stocktakeTransitions } from "../functions/api/platform/v1/goods-flow/stocktakes/[id]/transitions.js";
import { onRequest as recalculateCcc } from "../functions/api/platform/v1/goods-flow/ccc/[month]/recalculate.js";
import { onRequest as freezeCcc } from "../functions/api/platform/v1/goods-flow/ccc/[month]/freeze.js";

const sessions = {
  finance: { userId: "finance-1", name: "财务同事", department: "财务部" },
  supply: { userId: "supply-1", name: "供应链同事", department: "供应链部" },
  warehouse: { userId: "warehouse-1", name: "仓库同事", department: "仓库" },
  product: { userId: "product-1", name: "产品同事", department: "产品部" },
  data: { userId: "data-1", name: "数据同事", department: "数据中心" }
};

async function call(handler, { method = "GET", session, db, body, params = {}, headers = {} } = {}) {
  const request = new Request("https://flow.example.com/api/platform/v1/goods-flow/test", {
    method,
    headers: body ? { "content-type": "application/json", ...headers } : headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const response = await handler({ request, env: db ? { PRODUCT_FLOW_DB: db } : {}, data: session ? { session } : {}, params });
  return { response, body: await response.json() };
}

test("goods-flow routes require session and configured D1", async () => {
  assert.equal((await call(dashboard)).response.status, 401);
  const missing = await call(dashboard, { session: sessions.finance });
  assert.equal(missing.response.status, 501);
  assert.equal(missing.body.error.code, "GOODS_FLOW_STORAGE_UNAVAILABLE");
});

test("finance maintains effective platform terms while product stays read-only", async () => {
  const db = createGoodsFlowD1Mock();
  const term = { id: "tmall-30", platform: "天猫", days: 30, effectiveFrom: "2026-01-01", reason: "平台约定", version: 1 };
  const termHeaders = { "idempotency-key": "term-tmall-30" };
  assert.equal((await call(receivableTerms, { method: "PUT", session: sessions.product, db, body: term, headers: termHeaders })).response.status, 403);
  const saved = await call(receivableTerms, { method: "PUT", session: sessions.finance, db, body: term, headers: termHeaders });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.body.data.days, 30);
  const listed = await call(receivableTerms, { session: sessions.product, db });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data[0].platform, "天猫");
});

test("legacy import commits valid rows and returns mapping failures as partial success", async () => {
  const db = createGoodsFlowD1Mock();
  const result = await call(imports, {
    method: "POST",
    session: sessions.data,
    db,
    headers: { "idempotency-key": "import-2026-07-20" },
    body: {
      asOf: "2026-07-20",
      products: [{ id: "product-1", name: "木丝绒", skuCodes: ["690001"] }],
      salesRows: [{ id: "sale-1", code: "690001", qty: 2, cost: 20, date: "2026-07-19" }],
      supplyState: {
        inventorySnapshots: [
          { id: "known", skuCode: "690001", warehouse: "兰山云仓", erpQuantity: 10, sourceType: "kuaimai-import", stocktakeDate: "2026-07-20" },
          { id: "unknown", skuCode: "UNKNOWN", warehouse: "兰山云仓", erpQuantity: 3, sourceType: "kuaimai-import", stocktakeDate: "2026-07-20" }
        ]
      }
    }
  });
  assert.equal(result.response.status, 207);
  assert.equal(result.body.data.success.inventoryDaily, 1);
  assert.equal(result.body.data.failed, 1);
  assert.equal(db.tables.goods_flow_inventory_daily.size, 1);
  assert.equal(db.tables.goods_flow_exceptions.size, 1);

  const listed = await call(inventory, { session: sessions.supply, db });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data[0].skuCode, "690001");
  const productView = await call(inventory, { session: sessions.product, db });
  assert.equal(Object.hasOwn(productView.body.data[0], "unitCost"), false);
});

test("stocktake transitions enforce warehouse, supply and finance responsibilities", async () => {
  const db = createGoodsFlowD1Mock();
  const created = await call(stocktakes, {
    method: "POST",
    session: sessions.warehouse,
    db,
    headers: { "idempotency-key": "stocktake-1-create" },
    body: {
      id: "stocktake-1", warehouseId: "兰山云仓", countedAt: "2026-07-20", version: 1,
      lines: [{ skuId: "product-1::690001", warehouseId: "兰山云仓", erpQuantity: 10, countedQuantity: 9, unitCost: 5 }]
    }
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.status, "counted");
  assert.equal(Object.hasOwn(created.body.data.lines[0], "unitCost"), false);

  const denied = await call(stocktakeTransitions, {
    method: "POST", session: sessions.warehouse, db, params: { id: "stocktake-1" },
    headers: { "idempotency-key": "stocktake-1-difference-denied" },
    body: { action: "confirm_difference", expectedVersion: 1 }
  });
  assert.equal(denied.response.status, 403);

  const difference = await call(stocktakeTransitions, {
    method: "POST", session: sessions.supply, db, params: { id: "stocktake-1" },
    headers: { "idempotency-key": "stocktake-1-difference" },
    body: { action: "confirm_difference", expectedVersion: 1 }
  });
  assert.equal(difference.body.data.status, "difference_confirmed");

  const amount = await call(stocktakeTransitions, {
    method: "POST", session: sessions.finance, db, params: { id: "stocktake-1" },
    headers: { "idempotency-key": "stocktake-1-amount" },
    body: { action: "confirm_amount", expectedVersion: 2 }
  });
  assert.equal(amount.body.data.status, "confirmed");
});

test("CCC recalculation appends versions and only finance can freeze", async () => {
  const db = createGoodsFlowD1Mock();
  const recalculated = await call(recalculateCcc, {
    method: "POST", session: sessions.finance, db, params: { month: "2026-07" },
    headers: { "idempotency-key": "ccc-2026-07-v1" },
    body: {
      periodEnd: "2026-07-31", daysInPeriod: 31,
      inventoryDaily: [{ date: "2026-07-31", calibratedInventoryValue: 310, isCore: true, sellableQuantity: 0, stocktakeStatus: "calibrated" }],
      sales: [{ platform: "天猫", netSales: 1000, cost: 310 }],
      receivableTerms: [{ platform: "天猫", days: 30, effectiveFrom: "2026-01-01" }],
      purchases: [{ id: "purchase-1", amount: 100, receivedAt: "2026-07-01" }],
      payments: [{ purchaseId: "purchase-1", amount: 100, paidAt: "2026-07-21" }]
    }
  });
  assert.equal(recalculated.response.status, 201);
  assert.equal(recalculated.body.data.version, 1);
  assert.equal(recalculated.body.data.cccDays, 41);
  const retried = await call(recalculateCcc, {
    method: "POST", session: sessions.finance, db, params: { month: "2026-07" },
    headers: { "idempotency-key": "ccc-2026-07-v1" },
    body: {
      periodEnd: "2026-07-31", daysInPeriod: 31,
      inventoryDaily: [{ date: "2026-07-31", calibratedInventoryValue: 310, isCore: true, sellableQuantity: 0, stocktakeStatus: "calibrated" }],
      sales: [{ platform: "天猫", netSales: 1000, cost: 310 }],
      receivableTerms: [{ platform: "天猫", days: 30, effectiveFrom: "2026-01-01" }],
      purchases: [{ id: "purchase-1", amount: 100, receivedAt: "2026-07-01" }],
      payments: [{ purchaseId: "purchase-1", amount: 100, paidAt: "2026-07-21" }]
    }
  });
  assert.deepEqual(retried.body.data, recalculated.body.data);

  assert.equal((await call(freezeCcc, {
    method: "POST", session: sessions.supply, db, params: { month: "2026-07" },
    headers: { "idempotency-key": "ccc-2026-07-freeze-denied" }, body: { expectedVersion: 1 }
  })).response.status, 403);
  const frozen = await call(freezeCcc, {
    method: "POST", session: sessions.finance, db, params: { month: "2026-07" },
    headers: { "idempotency-key": "ccc-2026-07-freeze" }, body: { expectedVersion: 1 }
  });
  assert.equal(frozen.response.status, 200);
  assert.equal(frozen.body.data.status, "frozen");
  assert.equal(frozen.body.data.version, 2);
});

test("malformed JSON and readonly writes return stable error envelopes", async () => {
  const db = createGoodsFlowD1Mock();
  const malformedRequest = new Request("https://flow.example.com/api/platform/v1/goods-flow/terms", {
    method: "PUT", headers: { "content-type": "application/json" }, body: "{broken"
  });
  const malformedResponse = await receivableTerms({ request: malformedRequest, env: { PRODUCT_FLOW_DB: db }, data: { session: sessions.finance } });
  const malformed = await malformedResponse.json();
  assert.equal(malformedResponse.status, 400);
  assert.equal(malformed.error.code, "VALIDATION_INVALID_JSON");

  const readonly = await call(receivableTerms, {
    method: "PUT", session: { ...sessions.finance, role: "readonly" }, db,
    headers: { "idempotency-key": "readonly-term" },
    body: { id: "term", platform: "抖音", days: 7, effectiveFrom: "2026-01-01", reason: "约定" }
  });
  assert.equal(readonly.response.status, 403);
  assert.equal(typeof readonly.body.error.requestId, "string");
});

test("CCC with incomplete source coverage cannot be frozen", async () => {
  const db = createGoodsFlowD1Mock();
  await saveMonthlyMetrics(db, {
    id: "ccc-incomplete", month: "2026-06", version: 1, formulaVersion: "goods-flow-v1",
    cccDays: null, inventoryDays: 20, receivableDays: null, payableDays: 10,
    stockoutRate: null, inventoryCashTied: 100, coverage: { inventory: 1, receivableTerms: 0 },
    confidence: "partial", status: "draft"
  }, "财务同事", "2026-07-20T00:00:00.000Z");
  const result = await call(freezeCcc, {
    method: "POST", session: sessions.finance, db, params: { month: "2026-06" },
    headers: { "idempotency-key": "ccc-2026-06-freeze" }, body: { expectedVersion: 1 }
  });
  assert.equal(result.response.status, 409);
  assert.equal(result.body.error.code, "GOODS_FLOW_METRIC_INCOMPLETE");
});
