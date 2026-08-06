// 罗盘首页的取数接口。自助取数的即时补充：不排队、不占每日 5 条配额、可指定任意日期。
//
// 为什么不是「读页面上的数字」：
// 首页每张指标卡里有三个数——本店值、较上期、同行顶尖。按标签就近找数字必然抓错，
// store_daily 曾因此显示 314 万成交订单数、257 万成交人数（同日 GMV 仅 6.5 万）。
// 而在接口里，本店值是 value、同行顶尖是 benchmark、上期是 last_value，各有其名，
// 不可能混淆。同一份数据，读法不同，可信度天差地别。
//
// 两个模块（2026-07-31 抓包）：
//   GET /compass_api/shop/common/homepage/core_index              经营概况
//   GET /compass_api/shop/common/homepage/summary_core_index_v3   收支概况（广告费在这）
//   参数：date_type=20（近1天口径）、begin_date/end_date 为 `YYYY/MM/DD 00:00:00`
//
// 取值路径：data.module_data.<模块>.compass_general_multi_index_card_value.data[].<字段>.index_value.value

export const HOMEPAGE_BASE = "/compass_api/shop/common/homepage";
export const HOMEPAGE_MODULES = Object.freeze(["core_index", "summary_core_index_v3"]);

// date_type=20 是「近1天」口径，配合 begin_date/end_date 指定具体哪一天。
//
// **只能用 20。** 实测 2026-07-31 拿 07-28 试其它口径：
//   date_type=21（近7天） → 成交订单数 21382
//   date_type=23（近30天）→ 成交订单数 97899
// 而那天真实的单日成交订单数约 3000。传单个日期只是锚定窗口末端，返回的是**窗口累计**。
// 用它们去「扩大可查范围」，落库的就是 7 天或 30 天的合计冒充某一天——
// 一个看着完全正常、实际差好几倍的数字，和当初 314 万成交订单数是同一类错误。
export const HOMEPAGE_DATE_TYPE = 20;

// 近1天口径只回溯到前两天左右（实测 07-31 能取 07-30 与 07-29，07-28 就没有了）。
// 更早的日期只能走自助取数——那条路慢且有配额，但它按天给数。
export const HOMEPAGE_LOOKBACK_DAYS = 2;

export function withinHomepageWindow(businessDate, today) {
  const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${businessDate}T00:00:00Z`)) / 86400000);
  return days >= 0 && days <= HOMEPAGE_LOOKBACK_DAYS;
}

export function homepageQuery(module, businessDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(businessDate || ""))) {
    throw Object.assign(new Error(`业务日格式应为 YYYY-MM-DD，收到「${businessDate}」。`), {
      code: "DOUYIN_HOMEPAGE_DATE_INVALID"
    });
  }
  const stamp = `${String(businessDate).replace(/-/g, "/")} 00:00:00`;
  const params = new URLSearchParams({
    date_type: String(HOMEPAGE_DATE_TYPE),
    begin_date: stamp,
    end_date: stamp
  });
  return `${HOMEPAGE_BASE}/${module}?${params.toString()}`;
}

// 单位是接口显式给的，必须按它换算。
//   3 = 分（除以 100）  4 = 比率（原样）  5 = 计数（原样）
// 没见过的单位一律拒绝，不按原样放行：把分当成元会差 100 倍，而 100 倍的错值
// 在页面上看着仍然像个正常数字。
const UNIT_CENTS = 3;
const UNIT_RATIO = 4;
const UNIT_COUNT = 5;

export function convertUnit(value, unit) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  if (unit === UNIT_CENTS) return number / 100;
  if (unit === UNIT_RATIO || unit === UNIT_COUNT) return number;
  throw Object.assign(new Error(`罗盘首页返回了未登记的单位 ${unit}，本次不入库。`), {
    code: "DOUYIN_HOMEPAGE_UNIT_UNKNOWN"
  });
}

// 接口字段 → 事实字段。按字段名映射，与页面上的文案无关，改版不影响。
export const HOMEPAGE_FACT_FIELDS = Object.freeze({
  income_amt: "transactionAmount",
  pay_amt: "userPaymentAmount",
  pay_cnt: "transactionOrderCount",
  pay_ucnt: "transactionBuyerCount",
  product_show_ucnt: "productExposureUsers",
  product_click_ucnt: "productClickUsers",
  refund_amt_pay_time: "refundAmountByPaymentDate",
  // 花出去的钱。ad_costed_amt 就是页面上的「投放消耗（店铺被投）」，即广告费。
  ad_costed_amt: "adCostAmount",
  cost_amt: "expenseAmount",
  shop_serv_amt: "platformCommission",
  real_commission: "influencerCommission"
});

// 至少要拿到这几项才算这次取数有效。全都没有多半是没登录或接口改版，
// 那种情况下落一条全是 null 的记录，页面上会显示成「这天没生意」——比缺数更糟。
export const HOMEPAGE_REQUIRED_FIELDS = Object.freeze(["transactionAmount", "transactionOrderCount"]);

export function parseHomepageModule(payload) {
  const modules = payload?.data?.module_data;
  if (!modules || typeof modules !== "object") return {};
  const values = {};
  for (const block of Object.values(modules)) {
    const rows = block?.compass_general_multi_index_card_value?.data;
    for (const row of Array.isArray(rows) ? rows : []) {
      for (const [key, cell] of Object.entries(row || {})) {
        // 只取 value。benchmark 是同行顶尖、last_value 是上期，
        // 它们同在一个对象里，取错了不会报错，只会得到一个别人的数字。
        const own = cell?.index_value?.value;
        if (!own || own.value === undefined) continue;
        values[key] = convertUnit(own.value, own.unit);
      }
    }
  }
  return values;
}

export function buildHomepageFacts(rawByField, { businessDate, storeId }) {
  const fact = { providerId: "douyin-ecommerce", storeId, businessDate, sourceVersion: "douyin-homepage-v1" };
  for (const [key, field] of Object.entries(HOMEPAGE_FACT_FIELDS)) {
    if (rawByField[key] !== undefined && rawByField[key] !== null) fact[field] = rawByField[key];
  }
  const missing = HOMEPAGE_REQUIRED_FIELDS.filter(field => fact[field] === undefined);
  if (missing.length) {
    throw Object.assign(
      new Error(
        `罗盘首页未返回 ${businessDate} 的 ${missing.join("、")}，本次不入库。`
        + `近1天口径只回溯约 ${HOMEPAGE_LOOKBACK_DAYS} 天，更早的日期请走自助取数；`
        + "若日期在范围内，则多半是未登录或接口改版。"
      ),
      { code: "DOUYIN_HOMEPAGE_FIELDS_MISSING" }
    );
  }
  return fact;
}
