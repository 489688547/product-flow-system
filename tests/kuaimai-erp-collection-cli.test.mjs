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

test("collector keeps separate Kuaimai order item rows by specification merchant code", async () => {
  const file = new File([
    "系统订单号,规格商家编码,主商家编码,下单时间,店铺名称,销售数量\n",
    "KM1001,SKU-A,SPU-1,2026-07-01 10:20:30,抖音官方旗舰店,1\n",
    "KM1001,SKU-B,SPU-1,2026-07-01 10:20:30,抖音官方旗舰店,2\n"
  ], "kuaimai-order-items.csv");
  const result = await readKuaimaiExport(file, { resourceType: "order_items" });
  assert.equal(result.batch.rowCount, 2);
  assert.deepEqual(result.records.map(record => record.sourceKey), ["KM1001::SKU-A", "KM1001::SKU-B"]);
  assert.equal(result.issues.length, 0);
});

test("collector preserves repeated lines for the same order and specification", async () => {
  const file = new File([
    "系统订单号,规格商家编码,下单时间,店铺名称,销售数量,实发金额\n",
    "KM1001,SKU-A,2026-07-01 10:20:30,抖音官方旗舰店,1,19.9\n",
    "KM1001,SKU-A,2026-07-01 10:20:30,抖音官方旗舰店,2,39.8\n"
  ], "kuaimai-repeated-order-items.csv");
  const result = await readKuaimaiExport(file, { resourceType: "order_items" });
  assert.equal(result.batch.rowCount, 2);
  assert.deepEqual(result.records.map(record => record.sourceKey), ["KM1001::SKU-A", "KM1001::SKU-A::line:2"]);
  assert.equal(result.issues.length, 0);
});

test("collector strips buyer, recipient, address and waybill fields before upload", async () => {
  const file = new File([
    "系统订单号,规格商家编码,下单时间,店铺名称,销售数量,收件人,手机,手机号,固话,省,市,区,街道,详细地址,收件地址,邮箱,快递单号,买家旺旺,买家ID,系统备注\n",
    "KM1001,SKU-A,2026-07-01 10:20:30,抖音官方旗舰店,1,张三,13800000000,13800000000,010-12345678,江苏省,苏州市,工业园区,测试街道,测试路1号,江苏省苏州市测试路1号,buyer@example.com,SF123,buyer-1,buyer-id,联系买家\n"
  ], "kuaimai-private-order-items.csv");
  const result = await readKuaimaiExport(file, { resourceType: "order_items" });
  const stored = result.records[0].payload;
  assert.equal(stored.系统订单号, "KM1001");
  assert.equal(stored.销售数量, "1");
  for (const key of [
    "收件人", "手机", "手机号", "固话", "省", "市", "区", "街道", "详细地址", "收件地址",
    "邮箱", "快递单号", "买家旺旺", "买家ID", "系统备注"
  ]) {
    assert.equal(key in stored, false);
  }
  assert.equal(result.issues.some(issue => issue.code === "SENSITIVE_FIELDS_REDACTED"), true);
});

test("collector recognizes rich Kuaimai sales-item exports by order creation time", async () => {
  const file = new File([
    "系统订单号,规格商家编码,主商家编码,下单时间,店铺名称,所属平台,销售数量,退货数量,销售金额,商品买家已付金额,销售成本,退货成本,退款金额\n",
    "KM1001,6978705011208,SPU-1,2026-07-22 10:20:30,抖音官方旗舰店,抖店(放心购),2,1,39.8,35.8,16,8,4\n"
  ], "销售主题分析-按订单商品明细.csv");
  const result = await readKuaimaiExport(file, { resourceType: "sales_items" });

  assert.equal(result.batch.resourceType, "sales_items");
  assert.equal(result.batch.rowCount, 1);
  assert.equal(result.batch.rangeStart, "2026-07-22T10:20:30+08:00");
  assert.equal(result.records[0].sourceKey, "KM1001::6978705011208");
});

test("sales uploader sends one locally aggregated fact request instead of raw detail chunks", async () => {
  const file = new File([
    "系统订单号,规格商家编码,下单时间,所属平台,销售数量,销售金额,退款金额,销售成本\n",
    "KM1001,6978705011208,2026-07-23 10:20:30,抖店(放心购),2,39.8,0,16\n",
    "KM1002,6978705011208,2026-07-23 11:20:30,抖店(放心购),1,19.9,0,8\n"
  ], "销售主题分析-按订单商品明细.csv");
  const parsed = await readKuaimaiExport(file, { resourceType: "sales_items" });
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      data: { batchId: parsed.batch.id, status: "completed", projection: { sourceRecords: 2, salesRows: 1, salesDates: ["2026-07-23"] } }
    }), { status: 201, headers: { "content-type": "application/json" } });
  };

  const result = await uploadErpCollection(parsed, { baseUrl: "http://127.0.0.1:8132", fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/api\/platform\/v1\/erp-collection\/sales-facts$/);
  assert.equal(calls[0].body.batch.rowCount, 2);
  assert.equal(calls[0].body.facts.length, 1);
  assert.equal(calls[0].body.facts[0].qty, 3);
  // 单包全量上传保持老格式：不带分块信息，幂等键落在第 1 包。
  assert.equal(calls[0].body.chunk, undefined);
  assert.equal(calls[0].body.replaceDates, undefined);
  assert.match(calls[0].options.headers["idempotency-key"], /:projected-sales:1$/);
  assert.equal(result.records, 2);
  assert.equal(result.chunks, 1);
});

test("collector ignores the explicit Kuaimai sales summary footer", async () => {
  const file = new File([
    "序号,系统订单号,规格商家编码,下单时间,销售数量,销售金额\n",
    "1,KM1001,6978705011208,2026-07-23 10:20:30,2,39.8\n",
    "汇总,,,,2,39.8\n"
  ], "销售主题分析-按订单商品明细.csv");
  const result = await readKuaimaiExport(file, { resourceType: "sales_items" });

  assert.equal(result.batch.rowCount, 1);
  assert.equal(result.batch.status, "completed");
  assert.equal(result.issues.some(issue => issue.code === "SOURCE_KEY_MISSING"), false);
});

test("collector still rejects a real non-summary row without a stable source key", async () => {
  const file = new File([
    "序号,系统订单号,规格商家编码,下单时间,销售数量,销售金额\n",
    "1,KM1001,6978705011208,2026-07-23 10:20:30,2,39.8\n",
    "2,,,2026-07-23 11:00:00,1,19.9\n"
  ], "销售主题分析-按订单商品明细.csv");
  const result = await readKuaimaiExport(file, { resourceType: "sales_items" });

  assert.equal(result.batch.status, "partial");
  assert.equal(result.issues.some(issue => issue.code === "SOURCE_KEY_MISSING"), true);
});

test("collector keeps every SKU row from a Kuaimai product snapshot", async () => {
  const file = new File([
    "系统商品ID,系统规格ID,主商家编码,规格商家编码,商品名称,规格,69码,成本价\n",
    "P-1,S-1,SPU-1,SKU-1,测试商品,红色,6978705011208,6.50\n",
    "P-1,S-2,SPU-1,SKU-2,测试商品,蓝色,6978705011215,7.00\n"
  ], "快麦ERP商品导出.csv");
  const result = await readKuaimaiExport(file, { resourceType: "products" });

  assert.equal(result.batch.rowCount, 2);
  assert.deepEqual(result.records.map(record => record.sourceKey), ["P-1::S-1", "P-1::S-2"]);
});

test("collector recognizes Kuaimai kit and combination component rows", async () => {
  const kit = new File([
    "套件主商家编码,套件名称,子商品商家编码,子商品名称,组合比例,子商品供应商进价\n",
    "KIT-1,测试套件,SKU-1,单品一,2,6.50\n"
  ], "快麦ERP套件导出.csv");
  const combination = new File([
    "组合装主商家编码,组合装名称,单品规格商家编码,单品名称,数量,单品成本价\n",
    "COMBO-1,测试组合装,SKU-2,单品二,3,7.00\n"
  ], "快麦ERP组合装导出.csv");

  const kitResult = await readKuaimaiExport(kit, { resourceType: "product_kits" });
  const combinationResult = await readKuaimaiExport(combination, { resourceType: "product_combinations" });
  assert.equal(kitResult.records[0].sourceKey, "KIT-1::SKU-1");
  assert.equal(combinationResult.records[0].sourceKey, "COMBO-1::SKU-2");
});

test("collector parses a complete Kuaimai inventory snapshot without inventing missing quantities", async () => {
  const file = new File([
    "仓库名称,系统规格ID,规格商家编码,69码,可用库存,库存更新时间,成本价\n",
    "杭州仓,S-1,SKU-1,6978705011208,25,2026-07-26 05:10:00,6.50\n",
    "广州仓,S-2,SKU-2,6978705011215,0,2026-07-26 05:11:00,7.00\n"
  ], "库存状态导出.csv");
  const result = await readKuaimaiExport(file, {
    resourceType: "inventory_snapshot",
    collectedAt: "2026-07-26T05:12:00+08:00"
  });

  assert.equal(result.batch.status, "completed");
  assert.equal(result.batch.rowCount, 2);
  assert.deepEqual(result.records.map(record => record.sourceKey), [
    "杭州仓::S-1",
    "广州仓::S-2"
  ]);
  assert.equal(result.records[0].payload.可用库存, "25");
  assert.equal(result.records[1].payload.可用库存, "0");
});

test("collector parses the real warehouse-inventory export headers", async () => {
  const file = new File([
    "库存状态\n",
    "序号,图片,仓库,规格属性,规格别名,7天销量,可售天数,规格商家编码,规格备注,供应商,成本价,实际总库存,实际锁定数,实际可用数,次品数,库存状态,警戒状态\n",
    "1,,新湖北仓,绿色粽子,绿色粽子,0,,1111,,国产,2.5,14,0,14,0,有货,正常\n"
  ], "快麦导出_库存状态(按sku).csv");

  const result = await readKuaimaiExport(file, {
    resourceType: "inventory_snapshot",
    collectedAt: "2026-07-26T21:34:00+08:00"
  });

  assert.equal(result.batch.status, "completed");
  assert.equal(result.batch.rowCount, 1);
  assert.equal(result.records[0].sourceKey, "新湖北仓::1111");
  assert.equal(result.records[0].payload.实际总库存, "14");
  assert.equal(result.records[0].payload.实际可用数, "14");
});

test("collector rejects an inventory export without an official quantity column", async () => {
  const file = new File([
    "仓库名称,系统规格ID,规格商家编码\n",
    "杭州仓,S-1,SKU-1\n"
  ], "库存状态导出.csv");

  await assert.rejects(
    () => readKuaimaiExport(file, { resourceType: "inventory_snapshot" }),
    error => (
      error.code === "KUAIMAI_EXPORT_REQUIRED_COLUMNS_MISSING"
      && String(error.message).includes("库存数量")
    )
  );
});

test("collector requires both warehouse and stable SKU identity for every inventory row", async () => {
  const missingWarehouseColumn = new File([
    "系统规格ID,规格商家编码,可用库存\n",
    "S-1,SKU-1,25\n"
  ], "库存状态导出.csv");
  await assert.rejects(
    () => readKuaimaiExport(missingWarehouseColumn, { resourceType: "inventory_snapshot" }),
    error => (
      error.code === "KUAIMAI_EXPORT_REQUIRED_COLUMNS_MISSING"
      && String(error.message).includes("仓库与 SKU")
    )
  );

  const missingWarehouseValue = new File([
    "仓库名称,系统规格ID,规格商家编码,可用库存\n",
    ",S-1,SKU-1,25\n"
  ], "库存状态导出.csv");
  await assert.rejects(
    () => readKuaimaiExport(missingWarehouseValue, {
      resourceType: "inventory_snapshot"
    }),
    error => (
      error.code === "KUAIMAI_EXPORT_NO_VALID_RECORDS"
      && error.details?.issues?.some(issue => issue.code === "SOURCE_KEY_INCOMPLETE")
    )
  );
});

test("inventory upload refuses a partial snapshot before advancing collection success", async () => {
  const file = new File([
    "仓库名称,系统规格ID,规格商家编码,可用库存\n",
    "杭州仓,S-1,SKU-1,25\n"
  ], "库存状态导出.csv");
  const parsed = await readKuaimaiExport(file, { resourceType: "inventory_snapshot" });
  parsed.batch.status = "partial";
  let calls = 0;

  await assert.rejects(
    () => uploadErpCollection(parsed, {
      baseUrl: "http://127.0.0.1:8132",
      fetchImpl: async () => {
        calls += 1;
        return new Response("{}", { status: 201 });
      }
    }),
    error => error.code === "ERP_COLLECTION_BATCH_PARTIAL"
  );
  assert.equal(calls, 0);
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
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.body.records.length), [250, 250, 1]);
  assert.equal(calls[0].body.batch.status, "pending");
  assert.equal(calls[1].body.batch.status, "pending");
  assert.equal(calls[2].body.batch.status, "completed");
  assert.match(calls[0].options.headers["idempotency-key"], /:chunk:1$/);
  assert.match(calls[2].options.headers["idempotency-key"], /:chunk:3$/);
  assert.equal(calls[1].options.timeoutMs, 120_000);
  assert.equal(result.chunks, 3);
});

test("uploader rejects a server-accepted partial batch instead of reporting collection success", async () => {
  const file = new File([
    "系统订单号,规格商家编码,下单时间,销售数量,销售金额\n",
    "KM1001,6978705011208,2026-07-23 10:20:30,2,39.8\n"
  ], "销售主题分析-按订单商品明细.csv");
  const parsed = await readKuaimaiExport(file, { resourceType: "sales_items" });
  parsed.batch.status = "partial";
  const fetchImpl = async () => new Response(JSON.stringify({
    data: { batchId: parsed.batch.id, status: "partial", projection: null }
  }), {
    status: 201,
    headers: { "content-type": "application/json" }
  });

  await assert.rejects(
    () => uploadErpCollection(parsed, { baseUrl: "http://127.0.0.1:8132", fetchImpl }),
    error => error.code === "ERP_COLLECTION_BATCH_PARTIAL"
  );
});

function buildSalesCollection(factCount) {
  const rows = Array.from({ length: factCount }, (_, index) =>
    `KM${index},69${String(1000000000 + index)},2026-07-23 10:20:30,抖店(放心购),1,19.9,0,8\n`
  ).join("");
  const file = new File([
    `系统订单号,规格商家编码,下单时间,所属平台,销售数量,销售金额,退款金额,销售成本\n${rows}`
  ], "销售主题分析-按订单商品明细.csv");
  return readKuaimaiExport(file, { resourceType: "sales_items" });
}

test("sales uploader chunks large projections and only the first pack rewrites dates", async () => {
  const parsed = await buildSalesCollection(2500);
  parsed.archive = { contentHash: "f".repeat(64), relativePath: "原始归档/sales_items/2026-07/a.xlsx" };
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return new Response(JSON.stringify({
      data: { batchId: parsed.batch.id, status: "completed", projection: { salesRows: 1 } }
    }), { status: 201, headers: { "content-type": "application/json" } });
  };

  const result = await uploadErpCollection(parsed, { baseUrl: "http://127.0.0.1:8132", fetchImpl });

  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call.body.facts.length), [1000, 1000, 500]);
  assert.deepEqual(calls.map(call => call.options.headers["idempotency-key"].split(":").at(-1)), ["1", "2", "3"]);
  // 首包携带完整日期列表先删后写，归档只随首包上传。
  assert.deepEqual(calls[0].body.chunk, { index: 1, total: 3 });
  assert.deepEqual(calls[0].body.replaceDates, ["2026-07-23"]);
  assert.ok(calls[0].body.archive);
  // 后续包只插入：不带重写日期、不带归档，异常只随最后一包上传。
  assert.deepEqual(calls[1].body.chunk, { index: 2, total: 3 });
  assert.equal(calls[1].body.replaceDates, undefined);
  assert.equal(calls[1].body.archive, undefined);
  assert.deepEqual(calls[2].body.chunk, { index: 3, total: 3 });
  assert.equal(result.chunks, 3);
});

test("uploader retries a pack on 5xx and network errors with the same idempotency key", async () => {
  const parsed = await readKuaimaiExport(fixture, { resourceType: "orders" });
  const keys = [];
  let attempt = 0;
  const fetchImpl = async (url, options) => {
    attempt += 1;
    keys.push(options.headers["idempotency-key"]);
    if (attempt === 1) {
      return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "服务端错误。" } }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
    if (attempt === 2) throw new Error("socket hangup");
    return new Response(JSON.stringify({ data: { batchId: parsed.batch.id, status: "completed" } }), {
      status: 201,
      headers: { "content-type": "application/json" }
    });
  };

  const result = await uploadErpCollection(parsed, {
    baseUrl: "http://127.0.0.1:8132",
    fetchImpl,
    retryDelays: [1, 1, 1],
    sleep: async () => {}
  });

  assert.equal(attempt, 3);
  assert.deepEqual(keys, [keys[0], keys[0], keys[0]]);
  assert.equal(result.chunks, 1);
});

test("uploader does not retry 4xx validation failures", async () => {
  const parsed = await readKuaimaiExport(fixture, { resourceType: "orders" });
  let attempt = 0;
  const fetchImpl = async () => {
    attempt += 1;
    return new Response(JSON.stringify({ error: { code: "ERP_COLLECTION_RECORDS_REQUIRED", message: "校验失败。" } }), {
      status: 422,
      headers: { "content-type": "application/json" }
    });
  };

  await assert.rejects(
    () => uploadErpCollection(parsed, {
      baseUrl: "http://127.0.0.1:8132",
      fetchImpl,
      retryDelays: [1, 1, 1],
      sleep: async () => {}
    }),
    error => error.status === 422 && error.code === "ERP_COLLECTION_RECORDS_REQUIRED"
  );
  assert.equal(attempt, 1);
});

test("uploader gives up after three retries and surfaces the last failure", async () => {
  const parsed = await readKuaimaiExport(fixture, { resourceType: "orders" });
  let attempt = 0;
  const fetchImpl = async () => {
    attempt += 1;
    return new Response(JSON.stringify({ error: { code: "INTERNAL", message: "服务端错误。" } }), {
      status: 500,
      headers: { "content-type": "application/json" }
    });
  };

  await assert.rejects(
    () => uploadErpCollection(parsed, {
      baseUrl: "http://127.0.0.1:8132",
      fetchImpl,
      retryDelays: [1, 1, 1],
      sleep: async () => {}
    }),
    error => error.status === 500
  );
  // 首次请求 + 3 次重试，共 4 次尝试。
  assert.equal(attempt, 4);
});

test("sales uploader refuses an empty projection instead of reporting success without upload", async () => {
  const file = new File([
    "系统订单号,规格商家编码,下单时间,所属平台,销售数量,销售金额,退款金额,销售成本\n",
    "KM1001,SKU-NOT-69,2026-07-23 10:20:30,抖店(放心购),2,39.8,0,16\n"
  ], "销售主题分析-按订单商品明细.csv");
  const parsed = await readKuaimaiExport(file, { resourceType: "sales_items" });
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return new Response("{}", { status: 201, headers: { "content-type": "application/json" } });
  };

  await assert.rejects(
    () => uploadErpCollection(parsed, { baseUrl: "http://127.0.0.1:8132", fetchImpl }),
    error => error.code === "ERP_COLLECTION_SALES_FACTS_EMPTY" && error.status === 422
  );
  assert.equal(calls, 0);
});
