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

// date_type 决定后端接受什么日期，选错会被静默拒绝或只给最近两天。实测（2026-07-29）：
//
// | date_type | 含义       | 取 2026-07-26（三天前） |
// |-----------|-----------|------------------------|
// | 20        | 页面「近1天」| st:100008「日期校验失败」 |
// | 21        | 自定义范围  | 正常返回 10 行           |
//
// 页面切到「近1天」时用 20，那是滚动预设，后端只允许最近两天，补历史日必被拒。
// 自定义范围用 21，这也是罗盘自己的链接里带的值。因此补数一律用 21。
//
// 日期格式不敏感：`2026/07/26 00:00:00`、`2026-07-26`、`2026/07/26` 三种写法
// 在 date_type=21 下返回完全相同的结果（首行支付金额均为 1519911）。
const DATE_TYPE_DAILY = "21";

// 罗盘自己会告诉你每种 date_type 能查多久，不必猜也不该盲目重试：
//   GET /compass_api/config_center/data_range_v2?data_type=<页面标识>&path=<页面路径>
// 返回 data_range_map，按 date_type 给出 min_date/max_date。直播概览页实测：
//   22→3 天、21→7 天、23→30 天、24→90 天、7→今年至今。
// 各页面窗口不同，接入执行器时应先查询再选 date_type，并据此判断目标业务日可否采集。
export const DOUYIN_DATA_RANGE_ENDPOINT = "/compass_api/config_center/data_range_v2";

// 单日数据必须逐日不同，否则说明日期没生效。实测 date_type=21 下
// 07-26 首行支付金额 1519911、07-27 为 1441483，确认日期真正参与查询。
// 另外罗盘商品卡只保留到 07-26，更早的日期返回 0 行——这是平台的数据保留期，
// 不是故障，不应按失败重试。
export const DOUYIN_PRODUCT_CARD_PARAMS = Object.freeze({
  activity_id: "",
  is_activity: "false",
  category_code: "",
  product_status: "0",
  is_asc: "false",
  channel: "all",
  product_tab: "0",
  only_abnormal: "false",
  page_no: "1",
  page_size: "50"
});

// 每个资源除日期外还有自己的必填参数，缺了会被判「参数校验失败」而不是静默降级。
// 全部取自页面实际发出的请求（2026-07-29 抓包）。
export const DOUYIN_RESOURCE_PARAMS = Object.freeze({
  product_daily: DOUYIN_PRODUCT_CARD_PARAMS,
  // index_selected 决定返回哪些指标，其中 ad_costed_amt 是投放消耗、
  // stat_cost 是广告花费——广告费用就在这个接口里，不需要另找数据源。
  live_daily: Object.freeze({
    page_size: "50",
    page_no: "1",
    index_selected: "new_pay_amt,pay_amt,watch_cnt,pay_cnt,net_pay_cnt,ad_costed_amt,stat_cost,use_coupon_pay_amt,coupon_pay_amt_ratio",
    a_type: "-1",
    activity_id: ""
  })
});

// 直播明细的数据埋在 data.module_data.shop_live_list_room_detail
// .compass_general_table_value.data 里，不是顶层数组。
export const DOUYIN_LIVE_TABLE_PATH = Object.freeze([
  "module_data", "shop_live_list_room_detail", "compass_general_table_value"
]);

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

function douyinApiError(code, message) {
  return Object.assign(new Error(message), { code });
}

function textCellValue(row, indexName, fieldName) {
  const cell = row?.cell_info?.[indexName];
  const wrapped = cell?.[`${indexName}_${fieldName}_value`]
    || cell?.[`${fieldName}_value`];
  const value = wrapped?.value;
  if (!value || typeof value !== "object") return null;
  const resolved = value.unit === "string" ? value.value_str : value.value ?? value.value_str;
  if (resolved === null || resolved === undefined || resolved === "") return null;
  return String(resolved).replace(/[\u0000-\u001f\u007f]/g, " ").trim() || null;
}

function metricCellValue(row, aliases, { priceInFen = false } = {}) {
  for (const indexName of aliases) {
    const indexValues = row?.cell_info?.[indexName]?.[`${indexName}_index_values`]?.index_values;
    const raw = indexValues?.value?.value;
    if (raw === null || raw === undefined || raw === "") continue;
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0) {
      throw douyinApiError("DOUYIN_PRODUCT_METRIC_INVALID", `抖店商品指标无效：${indexName}`);
    }
    return priceInFen ? number / 100 : number;
  }
  return null;
}

function projectProductRow(row) {
  const productId = textCellValue(row, "product", "id");
  if (!productId || /\s/.test(productId) || productId.length > 200) {
    throw douyinApiError("DOUYIN_PRODUCT_ID_MISSING", "抖店商品记录缺少稳定商品 ID。");
  }
  return {
    productId,
    skuId: null,
    productName: textCellValue(row, "product", "name"),
    skuName: null,
    merchantCode: null,
    exposureUsers: metricCellValue(row, ["product_show_ucnt", "show_ucnt"]),
    clickUsers: metricCellValue(row, ["product_show_click_ucnt", "product_click_ucnt", "click_ucnt"]),
    transactionBuyers: metricCellValue(row, ["pay_ucnt"]),
    transactionOrderCount: metricCellValue(row, ["pay_cnt"]),
    transactionQuantity: null,
    transactionAmount: null,
    userPaymentAmount: metricCellValue(row, ["pay_amt"], { priceInFen: true }),
    refundOrderCount: null,
    refundQuantity: null,
    refundAmount: null
  };
}

export function projectDouyinProductApiPage(payload) {
  const interpreted = interpretDouyinApiResponse(payload);
  if (!interpreted.ok) throw douyinApiError(interpreted.code, interpreted.message);
  if (!Array.isArray(payload.data) || payload.data.length === 0) {
    throw douyinApiError("DOUYIN_API_EMPTY_DATA", "抖店商品接口没有返回商品记录。");
  }
  const total = Number(payload.page_result?.total ?? payload.data.length);
  if (!Number.isSafeInteger(total) || total < payload.data.length || total > 10_000) {
    throw douyinApiError("DOUYIN_PRODUCT_PAGE_INVALID", "抖店商品接口分页信息无效。");
  }
  return {
    facts: payload.data.map(projectProductRow),
    total
  };
}

export async function collectDouyinProductDaily({
  businessDate,
  pageSize = Number(DOUYIN_PRODUCT_CARD_PARAMS.page_size),
  fetchImpl = fetch
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(businessDate || ""))) {
    throw douyinApiError("DOUYIN_DATE_INVALID", "抖店商品业务日期无效。");
  }
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw douyinApiError("DOUYIN_PRODUCT_PAGE_INVALID", "抖店商品分页大小无效。");
  }
  if (typeof fetchImpl !== "function") {
    throw douyinApiError("DOUYIN_API_UNAVAILABLE", "抖店商品接口请求能力不可用。");
  }

  const facts = [];
  const productIds = new Set();
  let expectedTotal = null;
  for (let pageNo = 1; pageNo <= 200; pageNo += 1) {
    const url = buildDouyinApiUrl({
      endpoint: DOUYIN_API_ENDPOINTS.product_daily[0],
      businessDate,
      sourceParams: {
        ...DOUYIN_PRODUCT_CARD_PARAMS,
        page_no: String(pageNo),
        page_size: String(pageSize)
      }
    });
    const response = await fetchImpl(url, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      headers: { Accept: "application/json" }
    });
    if (!response?.ok) {
      throw douyinApiError(
        response?.status === 401 || response?.status === 403
          ? "DOUYIN_LOGIN_REQUIRED"
          : "DOUYIN_API_REQUEST_FAILED",
        "抖店商品接口请求失败。"
      );
    }
    let payload;
    try {
      payload = await response.json();
    } catch {
      throw douyinApiError("DOUYIN_API_MALFORMED", "抖店商品接口没有返回有效 JSON。");
    }
    const page = projectDouyinProductApiPage(payload);
    if (expectedTotal === null) expectedTotal = page.total;
    if (page.total !== expectedTotal) {
      throw douyinApiError("DOUYIN_PRODUCT_PAGE_CHANGED", "抖店商品分页总数在采集过程中发生变化。");
    }
    for (const fact of page.facts) {
      if (productIds.has(fact.productId)) {
        throw douyinApiError("DOUYIN_PRODUCT_DUPLICATE", "抖店商品分页返回了重复商品。");
      }
      productIds.add(fact.productId);
      facts.push(fact);
    }
    if (facts.length === expectedTotal) return { facts, total: expectedTotal };
    if (facts.length > expectedTotal || page.facts.length < pageSize) {
      throw douyinApiError("DOUYIN_PRODUCT_PAGE_INCOMPLETE", "抖店商品分页未完整返回全部商品。");
    }
  }
  throw douyinApiError("DOUYIN_PRODUCT_PAGE_INCOMPLETE", "抖店商品分页超过安全上限。");
}
