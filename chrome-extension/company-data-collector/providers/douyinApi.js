// 抖音罗盘的日期组件只响应 isTrusted 事件，扩展没有 debugger 权限，
// 无法通过操作 DOM 设置业务日（见 docs/features/douyin-api-collection/findings.md）。
// 因此改为直接请求页面自身使用的同源接口：鉴权走 Cookie，日期作为查询参数。

export const DOUYIN_API_ORIGIN = "https://compass.jinritemai.com";

export const DOUYIN_API_ENDPOINTS = Object.freeze({
  // 只登记页面实际请求过的路径。core_index_v3 曾被误写入清单：它并不存在，
  // 请求返回 st:0 但 data 为空，正是「成功但无数据」这类最难察觉的故障。
  store_daily: Object.freeze([
    "/compass_api/shop/common/homepage/summary_core_index_v3",
    "/compass_api/shop/common/homepage/core_trend_v3"
  ]),
  product_daily: Object.freeze([
    "/compass_api/shop/product_card/channel_product/channel_product_card_list",
    "/compass_api/shop/product_card/channel_product/channel_product_category"
  ]),
  live_daily: Object.freeze([
    "/compass_api/shop/live/live_overview/live_room_detail_v2"
  ]),
  video_daily: Object.freeze([
    "/compass_api/shop/video/overview/core_index_trend",
    "/compass_api/shop/video/overview/product_rank",
    "/compass_api/shop/video/overview/top_videos"
  ])
});

// 签名参数逐个删除实测均不影响取数（store_daily 三次对照均返回 7354 字节），
// 且商品页实测复用旧签名会被风控拒（code 11001），因此一律不携带。
// _lid 是埋点 ID，与取数无关。
export const SIGNATURE_PARAMS = Object.freeze(["msToken", "a_bogus", "verifyFp", "fp", "_lid"]);

// 页面自身对单日查询使用 date_type=1。日期同时接受 YYYY-MM-DD 与
// "YYYY/MM/DD HH:mm:ss" 两种格式，实测均可取数，这里统一用前者。
const DATE_TYPE_DAILY = "1";

export function buildDouyinApiUrl({ endpoint, businessDate, sourceParams = {} } = {}) {
  const url = new URL(String(endpoint || ""), DOUYIN_API_ORIGIN);
  for (const [key, value] of Object.entries(sourceParams)) {
    if (SIGNATURE_PARAMS.includes(key)) continue;
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set("begin_date", String(businessDate || ""));
  url.searchParams.set("end_date", String(businessDate || ""));
  url.searchParams.set("date_type", DATE_TYPE_DAILY);
  return url.toString();
}

function hasModuleData(payload) {
  const moduleData = payload?.data?.module_data;
  if (moduleData && typeof moduleData === "object") return Object.keys(moduleData).length > 0;
  // 列表类接口（如商品卡）不走 module_data，直接返回 data 下的集合。
  const data = payload?.data;
  return Boolean(data && typeof data === "object" && Object.keys(data).length > 0);
}

export function interpretDouyinApiResponse(payload) {
  if (!payload || typeof payload !== "object") {
    return { ok: false, code: "DOUYIN_API_MALFORMED", message: "抖店接口响应不是有效的 JSON 对象。" };
  }
  const status = payload.st ?? payload.code;
  if (status === 11001) {
    return { ok: false, code: "DOUYIN_API_RISK_CONTROL", message: "抖店接口触发风控，请稍后重试。" };
  }
  if (status === 8 || /未登录|登录失效/.test(String(payload.msg || ""))) {
    return { ok: false, code: "DOUYIN_LOGIN_REQUIRED", message: "抖店登录状态已失效。" };
  }
  if (status !== 0) {
    return {
      ok: false,
      code: "DOUYIN_API_REQUEST_FAILED",
      message: `抖店接口返回状态 ${status}：${String(payload.msg || "").slice(0, 60)}`
    };
  }
  // st 为 0 不代表有数据：date_type 传错时就是这个形态。
  if (!hasModuleData(payload)) {
    return {
      ok: false,
      code: "DOUYIN_API_EMPTY_DATA",
      message: "抖店接口返回成功但没有数据，通常是日期参数不被接受。"
    };
  }
  return { ok: true, code: "", message: "", data: payload.data };
}
