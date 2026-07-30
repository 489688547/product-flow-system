import assert from "node:assert/strict";
import test from "node:test";
import {
  KUAIMAI_UNIFIED_TIME_TYPE,
  assertKuaimaiTimeType,
  buildKuaimaiSearchBody,
  interpretKuaimaiApiResponse,
  kuaimaiBusinessDayRange,
  planNextKuaimaiPage,
  readKuaimaiTotal
} from "../chrome-extension/company-data-collector/providers/kuaimaiApi.js";

test("timeType 只接受订单创建时间，页面默认的付款时间被拒绝", () => {
  // 生产实测 2026-07-25：created 6955 单，pay_time 6556 单，相差 399 单。
  assert.equal(assertKuaimaiTimeType("created"), "created");
  for (const wrong of ["pay_time", "create_time", "order_time", "trade_time", ""]) {
    assert.throws(
      () => assertKuaimaiTimeType(wrong),
      error => error.code === "KUAIMAI_API_TIME_TYPE_INVALID",
      `${wrong} 应被拒绝`
    );
  }
});

test("无效 timeType 必须在发请求前拦住", () => {
  // 接口对无效值静默回落到付款时间，不报错也不提示，事后无从察觉。
  assert.throws(
    () => buildKuaimaiSearchBody({ businessDate: "2026-07-25", timeType: "pay_time" }),
    error => error.code === "KUAIMAI_API_TIME_TYPE_INVALID"
  );
});

test("业务日按 Asia/Shanghai 自然日闭区间取毫秒时间戳", () => {
  const { startTime, endTime } = kuaimaiBusinessDayRange("2026-07-25");
  assert.equal(startTime, Date.parse("2026-07-25T00:00:00+08:00"));
  assert.equal(endTime, Date.parse("2026-07-25T23:59:59.999+08:00"));
  assert.equal(endTime - startTime, 86_400_000 - 1);
});

test("业务日区间不随运行主机时区变化", () => {
  const original = process.env.TZ;
  try {
    process.env.TZ = "America/New_York";
    const shifted = kuaimaiBusinessDayRange("2026-07-25");
    process.env.TZ = "Asia/Shanghai";
    const local = kuaimaiBusinessDayRange("2026-07-25");
    assert.deepEqual(shifted, local);
  } finally {
    if (original === undefined) delete process.env.TZ; else process.env.TZ = original;
  }
});

test("业务日格式错误直接失败，不构造请求", () => {
  for (const wrong of ["2026/07/25", "20260725", "2026-7-25", ""]) {
    assert.throws(
      () => kuaimaiBusinessDayRange(wrong),
      error => error.code === "KUAIMAI_API_BUSINESS_DATE_INVALID",
      `${wrong} 应被拒绝`
    );
  }
});

test("请求体为表单编码，分页与时间参数不被页面原参数覆盖", () => {
  const body = buildKuaimaiSearchBody({
    businessDate: "2026-07-25",
    pageNo: 3,
    pageSize: 100,
    sourceParams: { timeType: "pay_time", startTime: "1", endTime: "2", pageNo: "9", pageSize: "20", shopId: "77" }
  });
  const params = new URLSearchParams(body);
  assert.equal(params.get("timeType"), KUAIMAI_UNIFIED_TIME_TYPE);
  assert.equal(params.get("pageNo"), "3");
  assert.equal(params.get("pageSize"), "100");
  assert.equal(params.get("startTime"), String(Date.parse("2026-07-25T00:00:00+08:00")));
  // 非受控筛选项应当从页面请求继承。
  assert.equal(params.get("shopId"), "77");
});

test("总数取自 data.total，不取 data.page", () => {
  // page 只含 offsetRow/pageNo/pageSize/startRow，没有 totalRow 或 totalPage。
  const payload = { result: 1, data: { page: { pageNo: 1, pageSize: 100, startRow: 0, offsetRow: 100 }, total: 6955 } };
  assert.deepEqual(readKuaimaiTotal(payload), { ok: true, code: "", message: "", total: 6955 });
});

test("登录失效与接口失败区分开", () => {
  assert.equal(interpretKuaimaiApiResponse({ result: 0, message: "请先登录" }).code, "KUAIMAI_LOGIN_REQUIRED");
  assert.equal(interpretKuaimaiApiResponse({ result: 0, message: "参数错误" }).code, "KUAIMAI_API_REQUEST_FAILED");
  assert.equal(interpretKuaimaiApiResponse(null).code, "KUAIMAI_API_MALFORMED");
  assert.equal(interpretKuaimaiApiResponse({ result: 1 }).code, "KUAIMAI_API_MALFORMED");
});

test("拉满总数才算完成", () => {
  assert.deepEqual(planNextKuaimaiPage({ total: 6955, collected: 6955, pageNo: 70, pageSize: 100 }), { action: "done" });
  assert.deepEqual(
    planNextKuaimaiPage({ total: 6955, collected: 100, pageNo: 1, pageSize: 100, receivedCount: 100 }),
    { action: "next", pageNo: 2, pageSize: 100 }
  );
});

test("没拉满就返回空页判失败，不得当作采完", () => {
  // 07-25 至 07-27 的缺口正是「采到一部分就当成功」造成的。
  const result = planNextKuaimaiPage({ total: 6955, collected: 6300, pageNo: 64, pageSize: 100, receivedCount: 0 });
  assert.equal(result.action, "fail");
  assert.equal(result.code, "KUAIMAI_API_TOTAL_MISMATCH");
});

test("拉取数超过总数同样判失败", () => {
  const result = planNextKuaimaiPage({ total: 6955, collected: 7000, pageNo: 71, pageSize: 100, receivedCount: 45 });
  assert.equal(result.action, "fail");
  assert.equal(result.code, "KUAIMAI_API_TOTAL_MISMATCH");
});
