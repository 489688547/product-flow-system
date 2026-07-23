import assert from "node:assert/strict";
import test from "node:test";

import { onRequest, replaceSalesFactsForDates } from "../functions/api/sales.js";

function createDb() {
  const batchSizes = [];
  const batches = [];
  const runs = [];
  const prepare = sql => ({
    sql,
    bindings: [],
    bind(...bindings) {
      this.bindings = bindings;
      return this;
    },
    async run() {
      runs.push(this);
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
    batches,
    runs,
    prepare,
    async batch(statements) {
      batchSizes.push(statements.length);
      batches.push(statements);
      return statements.map(() => ({ success: true }));
    }
  };
}

test("ERP sales projection replaces only completed business dates", async () => {
  const db = createDb();
  const result = await replaceSalesFactsForDates(db, [{
    code: "6978705011208",
    date: "2026-07-22",
    platform: "抖店(放心购)",
    qty: 2,
    sales: 39.8,
    netSales: 35.8,
    grossProfit: 19.8,
    refund: 4,
    cost: 16
  }], { importedAt: "2026-07-23T05:10:00.000Z" });

  assert.deepEqual(result.dates, ["2026-07-22"]);
  assert.equal(result.rows, 1);
  assert.equal(db.runs.some(statement =>
    /DELETE FROM product_sales_daily WHERE date = \?/.test(statement.sql)
    && statement.bindings[0] === "2026-07-22"
  ), true);
  assert.equal(db.batches.flat().some(statement => /INSERT INTO product_sales_daily/.test(statement.sql)), true);
});

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

test("display sales imports use the shared two-times fact transformer", async () => {
  const db = createDb();
  const response = await onRequest({
    request: new Request("https://example.test/api/sales", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rows: [{
          code: "6900000000000",
          date: "2026-07-22",
          platform: "天猫",
          qty: 3,
          sales: 90,
          netSales: 81,
          grossProfit: 51,
          refund: 9,
          cost: 30
        }]
      })
    }),
    env: { PRODUCT_FLOW_DB: {} },
    data: {
      businessDb: db,
      dataEnvironment: { id: "display", version: 7 }
    }
  });
  const insert = db.batches.flat().find(statement => /INSERT INTO product_sales_daily/.test(statement.sql));

  assert.equal(response.status, 200);
  assert.deepEqual(insert.bindings.slice(3, 9), [6, 180, 162, 102, 18, 60]);
});

test("sales routes use the selected business database without touching production", async () => {
  const displayDb = createDb();
  const productionDb = {
    prepare() {
      throw new Error("production database must not be touched");
    }
  };

  const response = await onRequest({
    request: new Request("https://example.test/api/sales"),
    env: { PRODUCT_FLOW_DB: productionDb },
    data: { businessDb: displayDb }
  });

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    synced: true,
    imports: [],
    titles: {}
  });
});
