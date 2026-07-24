// 抖店罗盘经营事实的展示视图构建器：纯函数，无 React、无网络、无浏览器全局。
// 输入为 commerce-facts 查询返回的 facts（每行含 deriveCommerceMetrics 的 derived 字段）。

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readPath(row, key) {
  if (!row) return null;
  if (!key.includes(".")) return toNumber(row[key]);
  return key.split(".").reduce((current, part) => (current == null ? null : current[part]), row) ?? null;
}

// 同比昨天：给出方向、绝对差、相对升降比例，以及"是否为正向"（部分指标越低越好）。
export function dayOverDay(value, previous, { lowerIsBetter = false } = {}) {
  const current = toNumber(value);
  const base = toNumber(previous);
  if (current == null || base == null) {
    return { available: false, current, previous: base, delta: null, changeRatio: null, direction: "flat", favorable: null };
  }
  const delta = current - base;
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  const changeRatio = base === 0 ? null : delta / Math.abs(base);
  const favorable = direction === "flat" ? null : lowerIsBetter ? direction === "down" : direction === "up";
  return { available: true, current, previous: base, delta, changeRatio, direction, favorable };
}

export const STORE_DAILY_METRICS = Object.freeze([
  Object.freeze({ key: "transactionAmount", label: "成交金额(GMV)", format: "money", lowerIsBetter: false }),
  Object.freeze({ key: "transactionOrderCount", label: "成交订单数", format: "number", lowerIsBetter: false }),
  Object.freeze({ key: "transactionBuyerCount", label: "成交人数", format: "number", lowerIsBetter: false }),
  Object.freeze({ key: "derived.averageOrderValue", label: "客单价", format: "money", lowerIsBetter: false }),
  Object.freeze({ key: "derived.exposureClickRate", label: "曝光点击率", format: "percent", lowerIsBetter: false }),
  Object.freeze({ key: "derived.refundRate", label: "退款率", format: "percent", lowerIsBetter: true })
]);

function sortedDates(facts) {
  return [...new Set((facts || []).map(row => row.businessDate).filter(Boolean))].sort();
}

// 取最新业务日与其紧邻的前一日（用于同比昨天）。
function latestPair(facts) {
  const dates = sortedDates(facts);
  return { latest: dates.at(-1) || null, previous: dates.length > 1 ? dates.at(-2) : null };
}

export function buildStoreDailySummary(facts = []) {
  const { latest, previous } = latestPair(facts);
  if (!latest) return { businessDate: null, previousDate: null, metrics: [] };
  const latestRow = facts.find(row => row.businessDate === latest) || null;
  const previousRow = previous ? facts.find(row => row.businessDate === previous) || null : null;
  return {
    businessDate: latest,
    previousDate: previous,
    metrics: STORE_DAILY_METRICS.map(metric => ({
      ...metric,
      value: readPath(latestRow, metric.key),
      comparison: dayOverDay(readPath(latestRow, metric.key), readPath(previousRow, metric.key), { lowerIsBetter: metric.lowerIsBetter })
    }))
  };
}

// 最新业务日按成交金额降序的重点商品 Top N，每行带同比昨天 GMV 升降。
export function buildProductDailyTop10(facts = [], limit = 10) {
  const { latest, previous } = latestPair(facts);
  if (!latest) return { businessDate: null, previousDate: null, rows: [] };
  const previousByProduct = new Map(
    facts.filter(row => row.businessDate === previous)
      .map(row => [String(row.productId || ""), toNumber(row.transactionAmount)])
  );
  const rows = facts
    .filter(row => row.businessDate === latest)
    .map(row => {
      const gmv = toNumber(row.transactionAmount);
      return {
        productId: String(row.productId || ""),
        productName: row.productName || row.merchantCode || String(row.productId || ""),
        gmv,
        quantity: toNumber(row.transactionQuantity),
        refundRate: readPath(row, "derived.refundRate"),
        comparison: dayOverDay(gmv, previousByProduct.get(String(row.productId || "")) ?? null, { lowerIsBetter: false })
      };
    })
    .sort((left, right) => (right.gmv ?? -Infinity) - (left.gmv ?? -Infinity))
    .slice(0, Math.max(1, limit));
  return { businessDate: latest, previousDate: previous, rows };
}

function sumField(rows, key) {
  const values = rows.map(row => toNumber(readPath(row, key))).filter(value => value != null);
  return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
}

// 最新业务日的直播与短视频摘要（场次/条数、成交金额、成交订单）。
export function buildContentDailySummary(liveFacts = [], videoFacts = []) {
  const liveDate = latestPair(liveFacts).latest;
  const videoDate = latestPair(videoFacts).latest;
  const liveRows = liveFacts.filter(row => row.businessDate === liveDate);
  const videoRows = videoFacts.filter(row => row.businessDate === videoDate);
  return {
    live: {
      businessDate: liveDate,
      sessionCount: liveRows.length,
      transactionAmount: sumField(liveRows, "transactionAmount"),
      transactionOrderCount: sumField(liveRows, "transactionOrderCount")
    },
    video: {
      businessDate: videoDate,
      videoCount: videoRows.length,
      transactionAmount: sumField(videoRows, "transactionAmount"),
      playCount: sumField(videoRows, "playCount")
    }
  };
}
