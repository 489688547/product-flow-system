// 把自助取数导出的表格转成按业务日的标准事实行。
//
// 三个维度的文件长得完全不一样，业务日的来源也不一样（2026-07-30/31 逐个下载实测）：
//
// | 维度 | 粒度         | 每行是什么 | 业务日来自 |
// |------|--------------|-----------|-----------|
// | shop | 自然日累计    | 一天      | 「日期」列（20260725） |
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
  shop: Object.freeze({
    ...SHARED_COLUMNS,
    日期: "businessDateRaw",
    成交金额: "transactionAmount",
    净成交金额: "netTransactionAmount",
    投放贡献成交金额: "adContributedAmount",
    投放贡献成交占比: "adContributedRatio"
  }),
  live: Object.freeze({
    ...SHARED_COLUMNS,
    统计日期: "statPeriod",
    直播间ID: "liveRoomId",
    直播间名称: "liveRoomName",
    直播开始时间: "liveStartedAt"
  }),
  video: Object.freeze({
    ...SHARED_COLUMNS,
    统计日期: "statPeriod",
    视频标题: "videoTitle"
  })
});

const NUMERIC_FIELDS = new Set([
  "transactionAmount",
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
