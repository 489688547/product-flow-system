import assert from "node:assert/strict";
import test from "node:test";

import { onRequest } from "../functions/api/sales.js";

function createDb() {
  const batchSizes = [];
  const prepare = sql => ({
    sql,
    bindings: [],
    bind(...bindings) {
      this.bindings = bindings;
      return this;
    },
    async run() {
      return { success: true };
    },
    async first() {
      return null;
    },
    async all() {
      return { results: [] };
    }
  });
  return {
    batchSizes,
    prepare,
    async batch(statements) {
      batchSizes.push(statements.length);
      return statements.map(() => ({ success: true }));
    }
  };
}

test("sales import batches a full month without dozens of D1 round trips", async () => {
  const db = createDb();
  const rows = Array.from({ length: 4500 }, (_, index) => ({
    code: `69${String(index % 100).padStart(10, "0")}`,
    date: `2026-05-${String(index % 28 + 1).padStart(2, "0")}`,
    platform: "抖音",
    qty: 1,
    sales: 10,
    netSales: 9,
    grossProfit: 4,
    refund: 1,
    cost: 5
  }));
  const response = await onRequest({
    request: new Request("https://example.test/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rows, source: "monthly.csv" })
    }),
    env: { PRODUCT_FLOW_DB: db }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(db.batchSizes, [250, 250]);
  assert.deepEqual((await response.json()).months, ["2026-05"]);
});
