// 快麦订单原先靠操作网页导出，故障集中在登录失效、时间范围未生效、导出确认缺失。
// 实测其查询接口是普通同源表单 POST：无签名、无风控，鉴权只依赖 Cookie
// （见 docs/features/kuaimai-api-collection/findings.md）。因此改为直接取数。

export const KUAIMAI_API_ORIGIN = "https://erp.superboss.cc";

export const KUAIMAI_API_ENDPOINTS = Object.freeze({
  search: "/trade/search",
  count: "/trade/search/count"
});

// PRODUCT.md 规定统一口径使用订单创建时间，对应 created。
export const KUAIMAI_UNIFIED_TIME_TYPE = "created";

// 白名单不是防御性冗余，而是这个接口唯一的口径保护：实测它对无效 timeType
// 静默回落到 pay_time，既不报错也不提示。2026-07-25 两者相差 399 单（6955 vs
// 6556，约 6%）。若不在发请求前拦住，口径错了在响应里毫无征兆。
const ALLOWED_TIME_TYPES = Object.freeze([KUAIMAI_UNIFIED_TIME_TYPE]);

// 页面自身携带的分页参数会覆盖我们的取值，必须由调用方统一控制。
const CONTROLLED_PARAMS = Object.freeze(["timeType", "startTime", "endTime", "pageNo", "pageSize"]);

const BUSINESS_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

// 业务日按 Asia/Shanghai 自然日闭区间取毫秒时间戳。偏移写死在字符串里，
// 结果不随运行主机的时区变化。
export function kuaimaiBusinessDayRange(businessDate) {
  const date = String(businessDate || "");
  if (!BUSINESS_DAY_PATTERN.test(date)) {
    throw fail("KUAIMAI_API_BUSINESS_DATE_INVALID", `业务日格式应为 YYYY-MM-DD，收到「${date}」。`);
  }
  const startTime = Date.parse(`${date}T00:00:00+08:00`);
  const endTime = Date.parse(`${date}T23:59:59.999+08:00`);
  if (!Number.isFinite(startTime) || !Number.isFinite(endTime)) {
    throw fail("KUAIMAI_API_BUSINESS_DATE_INVALID", `业务日「${date}」不是有效日期。`);
  }
  return { startTime, endTime };
}

export function assertKuaimaiTimeType(timeType) {
  const value = String(timeType || "");
  if (!ALLOWED_TIME_TYPES.includes(value)) {
    throw fail(
      "KUAIMAI_API_TIME_TYPE_INVALID",
      `timeType 只允许 ${ALLOWED_TIME_TYPES.join("、")}，收到「${value}」。`
        + "接口对无效值会静默回落到付款时间，口径将不符合系统要求。"
    );
  }
  return value;
}

// 请求体是 application/x-www-form-urlencoded，不是 JSON。
export function buildKuaimaiSearchBody({
  businessDate,
  timeType = KUAIMAI_UNIFIED_TIME_TYPE,
  pageNo = 1,
  pageSize = 100,
  sourceParams = {}
} = {}) {
  assertKuaimaiTimeType(timeType);
  const { startTime, endTime } = kuaimaiBusinessDayRange(businessDate);
  const body = new URLSearchParams();
  for (const [key, value] of Object.entries(sourceParams)) {
    if (CONTROLLED_PARAMS.includes(key)) continue;
    if (value === undefined || value === null) continue;
    body.set(key, String(value));
  }
  body.set("timeType", timeType);
  body.set("startTime", String(startTime));
  body.set("endTime", String(endTime));
  body.set("pageNo", String(Math.max(1, Number(pageNo) || 1)));
  body.set("pageSize", String(Math.max(1, Number(pageSize) || 1)));
  return body.toString();
}

export function kuaimaiApiUrl(endpoint) {
  return new URL(String(endpoint || ""), KUAIMAI_API_ORIGIN).toString();
}

export function interpretKuaimaiApiResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, code: "KUAIMAI_API_MALFORMED", message: "快麦接口响应不是有效的 JSON 对象。" };
  }
  const message = String(payload.message ?? payload.msg ?? "");
  if (/未登录|登录失效|请先登录/.test(message)) {
    return { ok: false, code: "KUAIMAI_LOGIN_REQUIRED", message: "快麦登录状态已失效。" };
  }
  if (payload.result !== 1) {
    return {
      ok: false,
      code: "KUAIMAI_API_REQUEST_FAILED",
      message: `快麦接口返回 result ${payload.result}：${message.slice(0, 60)}`
    };
  }
  if (!payload.data || typeof payload.data !== "object") {
    return { ok: false, code: "KUAIMAI_API_MALFORMED", message: "快麦接口返回成功但缺少 data。" };
  }
  return { ok: true, code: "", message: "", data: payload.data };
}

// 总数在 data.total，不在 data.page 内；page 只有 offsetRow/pageNo/pageSize/startRow。
export function readKuaimaiTotal(payload) {
  const interpreted = interpretKuaimaiApiResponse(payload);
  if (!interpreted.ok) return interpreted;
  const total = Number(interpreted.data.total);
  if (!Number.isInteger(total) || total < 0) {
    return { ok: false, code: "KUAIMAI_API_MALFORMED", message: "快麦接口未返回可用的订单总数。" };
  }
  return { ok: true, code: "", message: "", total };
}

// 分页只有「拉满总数」这一个成功条件。少一单也算失败，绝不入库部分数据：
// 07-25 至 07-27 的缺口正是「采到一部分就当成功」造成的。
export function planNextKuaimaiPage({ total, collected, pageNo, pageSize, receivedCount } = {}) {
  const target = Number(total);
  const done = Number(collected);
  if (!Number.isInteger(target) || target < 0) {
    return { action: "fail", code: "KUAIMAI_API_MALFORMED", message: "订单总数不可用，无法分页。" };
  }
  if (done > target) {
    return {
      action: "fail",
      code: "KUAIMAI_API_TOTAL_MISMATCH",
      message: `已拉取 ${done} 单，超过接口报告的总数 ${target} 单。`
    };
  }
  if (done === target) return { action: "done" };
  // 未拉满却返回空页：继续翻页只会空转，必须当场失败而不是静默截断。
  if (Number(receivedCount) === 0) {
    return {
      action: "fail",
      code: "KUAIMAI_API_TOTAL_MISMATCH",
      message: `接口报告 ${target} 单，实际只拉到 ${done} 单后返回空页。`
    };
  }
  return { action: "next", pageNo: Math.max(1, Number(pageNo) || 1) + 1, pageSize };
}
