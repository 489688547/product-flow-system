import assert from "node:assert/strict";
import test from "node:test";
import { resolve } from "node:path";
import { readKuaimaiExport } from "../scripts/kuaimai-erp-collector/core.mjs";
import { uploadErpCollection } from "../scripts/kuaimai-erp-collector/api.mjs";

const fixture = resolve("tests/fixtures/kuaimai-orders.csv");

test("collector recognizes a Kuaimai order export and uses creation time", async () => {
  const result = await readKuaimaiExport(fixture, { resourceType: "orders", collectedAt: "2026-07-22T08:00:00.000Z" });
  assert.equal(result.batch.resourceType, "orders");
  assert.equal(result.batch.rowCount, 2);
  assert.equal(result.batch.rangeStart, "2026-07-01T10:20:30+08:00");
  assert.equal(result.batch.rangeEnd, "2026-07-01T23:59:59+08:00");
  assert.deepEqual(result.headers.slice(0, 3), ["系统订单号", "平台订单号", "订单创建时间"]);
  assert.equal(result.records[0].sourceKey, "KM1001");
  assert.equal(result.records[0].payload.店铺名称, "抖音官方旗舰店");
  assert.equal(result.issues.length, 0);
});

test("collector rejects an order file without creation time instead of guessing", async () => {
  const file = new File(["系统订单号,订单状态\nKM1001,已完成\n"], "missing-time.csv");
  await assert.rejects(() => readKuaimaiExport(file, { resourceType: "orders" }), error => error.code === "KUAIMAI_EXPORT_REQUIRED_COLUMNS_MISSING");
});

test("uploader chunks records and marks only the final request completed", async () => {
  const parsed = await readKuaimaiExport(fixture, { resourceType: "orders" });
  parsed.records = Array.from({ length: 501 }, (_, index) => ({ ...parsed.records[index % 2], sourceKey: `KM${index}` }));
  parsed.batch.rowCount = 501;
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({ data: { batchId: parsed.batch.id, counts: { inserted: options.body.length } } }), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  };
  const result = await uploadErpCollection(parsed, { baseUrl: "http://127.0.0.1:8132", fetchImpl });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].body.records.length, 500);
  assert.equal(calls[0].body.batch.status, "pending");
  assert.equal(calls[1].body.batch.status, "completed");
  assert.match(calls[0].options.headers["idempotency-key"], /:chunk:1$/);
  assert.equal(result.chunks, 2);
});
