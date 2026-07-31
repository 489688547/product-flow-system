// 把自助取数导出的表格转成按业务日的标准事实行。
//
// 三个维度的文件长得完全不一样，业务日的来源也不一样（2026-07-30/31 逐个下载实测）：
//
// | 维度 | 粒度         | 每行是什么 | 业务日来自 |
// |------|--------------|-----------|-----------|
// | shop | 自然日累计    | 一天      | 「日期」列（20260725） |
// | product | 自然日累计 | 一个商品   | 「日期」列，同店铺 |
// | live | 开播日期累计  | 一个直播间 | 「直播开始时间」（2026/07/29 07:59:36） |
// | video| 统计日期累计  | 一个视频   | 「统计日期」，且必须是单日区间 |
//
// 直播的坑最深：它没有按天的列，统计日期给的是整段区间（20260725-20260729）。
// 如果不把开播时间取回来，就只能靠「我请求的是这几天」去推断业务日——那是推断不是
// 事实，5 天的数据会被当成某一天入库，而且入库后和真数长得一模一样。
//
// 短视频不能照搬这招：发布时间不等于成交日，5 月发的视频 7 月照样出单。所以短视频
// 只能一天一个任务，再由文件里的统计日期自证确实只有这一天。

// 中文列名 → 事实字段。按列名映射而不是按列序：勾选的指标不同，列的顺序就不同，
// 按序号取值会在换一组指标后悄悄错位，而错位不会报错。
const SHARED_COLUMNS = Object.freeze({
  店铺名称: "storeName",
  用户支付金额: "userPaymentAmount",
  成交订单数: "transactionOrderCount",
  成交人数: "transactionBuyerCount"
});

export const COLUMNS_BY_DIMENSION = Object.freeze({
  // 指标一律全选，所以文件里的列远多于这里登记的。没登记的列直接忽略——
  // 它们仍留在归档文件里，将来要用不必重采。
  shop: Object.freeze({
    ...SHARED_COLUMNS,
    日期: "businessDateRaw",
    成交金额: "transactionAmount",
    结算金额: "settlementAmount",
    "退款金额（支付时间）": "refundAmountByPaymentDate",
    "退款金额（退款时间）": "refundAmountByRefundDate",
    "退款订单数（支付时间）": "refundOrderCountByPaymentDate",
    "退款订单数（退款时间）": "refundOrderCountByRefundDate",
    商品曝光人数: "productExposureUsers",
    商品点击人数: "productClickUsers",
    // 花出去的钱。列名以 preview 为准（2026-07-31 核对）。
    "投放消耗（店铺被投）": "adCostAmount",
    "支出金额（店铺被投）": "expenseAmount",
    "平台佣金（财务已结算）": "platformCommission",
    "达人佣金（财务已结算）": "influencerCommission",
    投放贡献成交金额: "adContributedAmount",
    净成交金额: "netTransactionAmount"
  }),
  // 商品与店铺一样从「日期」列取业务日，但一行是一个商品，不是一天。
  product: Object.freeze({
    ...SHARED_COLUMNS,
    日期: "businessDateRaw",
    商品ID: "productId",
    商品名称: "productName",
    成交件数: "transactionQuantity",
    商品曝光人数: "exposureUsers",
    商品点击人数: "clickUsers",
    // 平台自己也不一致：配置接口把 refund_cnt 标成「退款订单数（退款时间）」，
    // 而 preview 给的列名是「退款订单数（支付时间）」。导出文件用的是后者，
    // 所以列名一律以 preview 为准，不拿配置接口的文案当列名。
    "退款订单数（支付时间）": "refundOrderCount",
    "成交退款金额（退款时间）": "refundAmount",
    "退款件数（退款时间）": "refundQuantity"
  }),
  live: Object.freeze({
    ...SHARED_COLUMNS,
    统计日期: "statPeriod",
    直播间ID: "liveRoomId",
    直播间名称: "liveRoomName",
    直播开始时间: "liveStartedAt"
  }),
  // 短视频的列名又是另一套：支付金额叫「短视频用户支付金额」，不是「用户支付金额」。
  // 三个维度三套列名，这也是必须按维度登记而不是共用一张表的原因。
  video: Object.freeze({
    统计日期: "statPeriod",
    店铺名称: "storeName",
    短视频ID: "videoId",
    视频类型: "videoType",
    成交订单数: "transactionOrderCount",
    短视频用户支付金额: "userPaymentAmount"
  })
});

// 建任务前用 preview 接口核对的列。
//
// 注意 preview 报的是**指标列**，不是导出文件的完整表头：实测直播的导出文件有
// 「直播间ID / 直播间名称 / 店铺名称」而 preview 里没有，反过来 preview 有「日期」
// 而文件里没有。店铺与商品两者恰好一致，所以这个差别是在直播上才暴露的。
//
// 因此这里只列 preview 确实会报的列。身份列不靠它把关——身份缺失由入库时的必填
// 校验拦下（live 缺 liveSessionId、video 缺 videoId 会直接抛错），业务日来源缺失
// 由 parseExtractRows 拦下。两道各管各的，别让一道假装管了两件事。
export const PREVIEW_REQUIRED_COLUMNS = Object.freeze({
  shop: Object.freeze(["日期", "成交金额", "成交订单数", "成交人数"]),
  product: Object.freeze(["日期", "商品ID", "用户支付金额", "成交订单数"]),
  live: Object.freeze(["直播开始时间", "用户支付金额", "成交订单数"]),
  video: Object.freeze(["短视频用户支付金额", "成交订单数"])
});

const NUMERIC_FIELDS = new Set([
  "transactionAmount",
  "adContributedAmount",
  "influencerCommission",
  "platformCommission",
  "expenseAmount",
  "adCostAmount",
  "refundQuantity",
  "refundOrderCount",
  "refundAmount",
  "clickUsers",
  "exposureUsers",
  "productClickUsers",
  "productExposureUsers",
  "refundOrderCountByRefundDate",
  "refundOrderCountByPaymentDate",
  "refundAmountByRefundDate",
  "refundAmountByPaymentDate",
  "settlementAmount",
  "transactionQuantity",
  "userPaymentAmount",
  "transactionOrderCount",
  "transactionBuyerCount",
  "netTransactionAmount",
  "adContributedAmount",
  "adContributedRatio"
]);

// 导出文件里连金额都是字符串（单元格类型均为 t="s"），必须显式转数。
function numberOrNull(value) {
  const text = String(value ?? "").replace(/,/g, "").trim();
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function compactToDate(value) {
  const text = String(value ?? "").trim();
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return "";
}

// 「统计日期」是 20260725-20260729 这样的区间。
export function parseStatPeriod(value) {
  const match = String(value ?? "").trim().match(/^(\d{8})-(\d{8})$/);
  if (!match) return null;
  return { from: compactToDate(match[1]), to: compactToDate(match[2]) };
}

// 「直播开始时间」是 2026/07/29 07:59:36。取它的自然日作为业务日：
// 直播的天然单位是场次，按开播日归集才对得上业务口径。
function dateOfTimestamp(value) {
  const match = String(value ?? "").trim().match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : "";
}

function businessDateOf(dimension, record) {
  if (dimension === "shop" || dimension === "product") return compactToDate(record.businessDateRaw);
  if (dimension === "live") return dateOfTimestamp(record.liveStartedAt);
  if (dimension === "video") {
    const period = parseStatPeriod(record.statPeriod);
    // 跨天的区间合计还原不到某一天。宁可整批不入库，也不能挑一天安上去。
    if (!period || period.from !== period.to) return "";
    return period.from;
  }
  return "";
}

export function parseExtractRows(header = [], rows = [], { dimension = "shop", businessDates = [] } = {}) {
  const columnMap = COLUMNS_BY_DIMENSION[dimension];
  if (!columnMap) {
    throw Object.assign(new Error(`维度 ${dimension} 没有登记列名映射。`), {
      code: "DOUYIN_EXTRACT_DIMENSION_COLUMNS_MISSING"
    });
  }
  const columns = header.map(name => columnMap[String(name || "").trim()] || null);

  // 业务日的来源列缺了就整批拒绝：没有它，每一行都无法归属到某一天，
  // 而缺了却照样入库，页面上会显示成「这天没生意」——那比缺数更糟。
  const dateSource = dimension === "live" ? "liveStartedAt"
    : dimension === "video" ? "statPeriod"
    : "businessDateRaw";
  if (!columns.includes(dateSource)) {
    throw Object.assign(
      new Error(`${dimension} 维度的导出文件缺少业务日来源列，无法定位业务日。`),
      { code: "DOUYIN_EXTRACT_DATE_COLUMN_MISSING" }
    );
  }

  const parsed = [];
  const unmapped = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const record = {};
    columns.forEach((field, index) => {
      if (!field) return;
      const raw = row[index];
      record[field] = NUMERIC_FIELDS.has(field) ? numberOrNull(raw) : String(raw ?? "").trim();
    });
    const date = businessDateOf(dimension, record);
    if (!date) {
      unmapped.push(row);
      continue;
    }
    delete record.businessDateRaw;
    parsed.push({ ...record, businessDate: date });
  }

  // 请求了哪些业务日就必须拿到哪些。少一天而不报错，页面上就会显示成「这天没生意」，
  // 那是比缺数更糟的谎——今天已经在快麦上见过一次半成品被当成真数。
  const got = new Set(parsed.map(row => row.businessDate));
  const missing = businessDates.filter(date => !got.has(date));
  return { rows: parsed, unmapped, missing };
}

// 直播与短视频一天有多行（一场直播 / 一个视频一行），入日事实前要按业务日合计。
export function sumByBusinessDate(rows = [], fields = []) {
  const totals = new Map();
  for (const row of rows) {
    const current = totals.get(row.businessDate) || { businessDate: row.businessDate, rowCount: 0 };
    current.rowCount += 1;
    for (const field of fields) {
      const value = row[field];
      if (typeof value === "number") current[field] = (current[field] || 0) + value;
    }
    totals.set(row.businessDate, current);
  }
  return [...totals.values()].sort((left, right) => left.businessDate.localeCompare(right.businessDate));
}

export function assertExtractComplete(result, businessDates = []) {
  if (!businessDates.length) return result;
  if (result.missing.length) {
    throw Object.assign(
      new Error(`导出文件缺少 ${result.missing.join("、")} 的数据，本批不入库。`),
      { code: "DOUYIN_EXTRACT_DAYS_MISSING" }
    );
  }
  return result;
}
