import { normalizeSkuCodes } from "./salesData.js";

const GMV_SCORE_BANDS = [
  { min: 0, minInclusive: false, max: 300_000, maxInclusive: false, score: 1, label: "＜30万" },
  { min: 300_000, minInclusive: true, max: 1_000_000, maxInclusive: false, score: 2, label: "30-100万" },
  { min: 1_000_000, minInclusive: true, max: 3_000_000, maxInclusive: false, score: 3, label: "100-300万" },
  { min: 3_000_000, minInclusive: true, max: 6_000_000, maxInclusive: true, score: 4, label: "300-600万" },
  { min: 6_000_000, minInclusive: false, max: Infinity, maxInclusive: false, score: 5, label: "＞600万" }
];

function round2(value) {
  return Math.round(value * 100) / 100;
}

function matchesGmvBand(annualGmv, band) {
  const aboveMinimum = band.minInclusive ? annualGmv >= band.min : annualGmv > band.min;
  const belowMaximum = band.max === Infinity
    ? true
    : band.maxInclusive
      ? annualGmv <= band.max
      : annualGmv < band.max;
  return aboveMinimum && belowMaximum;
}

function dateString(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }
  const text = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function inclusiveMonthCount(fromMonth, toMonth) {
  const [fromYear, fromValue] = fromMonth.split("-").map(Number);
  const [toYear, toValue] = toMonth.split("-").map(Number);
  if (![fromYear, fromValue, toYear, toValue].every(Number.isFinite)) return 0;
  return Math.max(0, (toYear - fromYear) * 12 + toValue - fromValue + 1);
}

function achievement(actual, target) {
  return target > 0 ? round2(actual / target * 100) : null;
}

export function normalizeMonthlyGmvTarget(value) {
  const amount = Number(String(value ?? "").replace(/[,¥￥\s]/g, ""));
  return Number.isFinite(amount) && amount > 0 ? round2(amount) : null;
}

export function scoreAnnualGmv(value) {
  const annualGmv = round2(Number(value));
  if (!Number.isFinite(annualGmv) || annualGmv <= 0) return null;
  const band = GMV_SCORE_BANDS.find(item => matchesGmvBand(annualGmv, item));
  return band ? { annualGmv, score: band.score, label: band.label } : null;
}

export function suggestAnnualGmvScore(monthlyGmvTarget) {
  const monthly = normalizeMonthlyGmvTarget(monthlyGmvTarget);
  return monthly ? scoreAnnualGmv(monthly * 12) : null;
}

export function buildProductGmvProgress({ product = {}, dailyRows = [], launchDate = "", today = new Date() } = {}) {
  const monthlyTarget = normalizeMonthlyGmvTarget(product.monthlyGmvTarget);
  if (!monthlyTarget) return { state: "missing-target", salesState: "unknown", monthlyTarget: null };

  const codes = normalizeSkuCodes(product.skuCodes).map(item => item.code);
  if (!codes.length) return { state: "missing-sku", salesState: "unknown", monthlyTarget };

  const codeSet = new Set(codes);
  const throughDate = dateString(today) || dateString(new Date());
  const currentMonth = throughDate.slice(0, 7);
  const rows = (Array.isArray(dailyRows) ? dailyRows : []).filter(row => (
    codeSet.has(String(row?.code || ""))
    && dateString(row?.date)
    && row.date <= throughDate
  ));
  const salesFor = predicate => round2(rows.filter(predicate).reduce((total, row) => total + (Number(row.sales) || 0), 0));
  const currentActual = salesFor(row => row.date.slice(0, 7) === currentMonth);
  const current = {
    month: currentMonth,
    actual: currentActual,
    target: monthlyTarget,
    percent: achievement(currentActual, monthlyTarget)
  };

  const normalizedLaunchDate = dateString(launchDate);
  let cumulative;
  if (!normalizedLaunchDate) {
    cumulative = { state: "missing-schedule", actual: null, target: null, percent: null, months: 0 };
  } else {
    const launchMonth = normalizedLaunchDate.slice(0, 7);
    const months = inclusiveMonthCount(launchMonth, currentMonth);
    if (!months || launchMonth > currentMonth) {
      cumulative = { state: "not-launched", actual: 0, target: 0, percent: null, months: 0, launchMonth };
    } else {
      const actual = salesFor(row => row.date.slice(0, 7) >= launchMonth);
      const target = round2(monthlyTarget * months);
      cumulative = { state: "ready", actual, target, percent: achievement(actual, target), months, launchMonth };
    }
  }

  return {
    state: "ready",
    salesState: rows.length ? "ready" : "empty",
    monthlyTarget,
    current,
    cumulative
  };
}
