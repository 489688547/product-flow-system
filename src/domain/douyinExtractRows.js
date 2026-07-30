// 把自助取数导出的表格转成按业务日的标准事实行。
//
// 导出文件的列名是中文，与页面上勾选的指标一一对应（2026-07-30 实际导出验证）：
//   统计日期 | 日期 | 店铺名称 | 成交金额 | ...
// 「统计日期」是整段区间（如 20260725-20260729），「日期」才是业务日，一行一天。
// 之所以必须选「自然日累计」，就是为了拿到「日期」这一列；统计日期累计只给区间合计。

// 中文列名 → 事实字段。按列名映射而不是按列序：勾选的指标不同，列的顺序就不同，
// 按序号取值会在换一组指标后悄悄错位，而错位不会报错。
export const EXTRACT_COLUMNS = Object.freeze({
  日期: "businessDate",
  店铺名称: "storeName",
  成交金额: "transactionAmount",
  用户支付金额: "userPaymentAmount",
  成交订单数: "transactionOrderCount",
  成交人数: "transactionBuyerCount",
  净成交金额: "netTransactionAmount",
  投放贡献成交金额: "adContributedAmount",
  投放贡献成交占比: "adContributedRatio"
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

// 「日期」列是紧凑格式 20260725，转成标准业务日。
function businessDateOf(value) {
  const text = String(value ?? "").trim();
  if (/^\d{8}$/.test(text)) return `${text.slice(0, 4)}-${text.slice(4, 6)}-${text.slice(6, 8)}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  return "";
}

export function parseExtractRows(header = [], rows = [], { businessDates = [] } = {}) {
  const columns = header.map(name => EXTRACT_COLUMNS[String(name || "").trim()] || null);
  if (!columns.includes("businessDate")) {
    throw Object.assign(new Error("导出文件缺少「日期」列，无法定位业务日。"), {
      code: "DOUYIN_EXTRACT_DATE_COLUMN_MISSING"
    });
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
    const date = businessDateOf(record.businessDate);
    if (!date) {
      unmapped.push(row);
      continue;
    }
    parsed.push({ ...record, businessDate: date });
  }

  // 请求了哪些业务日就必须拿到哪些。少一天而不报错，页面上就会显示成「这天没生意」，
  // 那是比缺数更糟的谎——今天已经在快麦上见过一次半成品被当成真数。
  const got = new Set(parsed.map(row => row.businessDate));
  const missing = businessDates.filter(date => !got.has(date));
  return { rows: parsed, unmapped, missing };
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
