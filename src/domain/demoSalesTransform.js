export const DISPLAY_SALES_FACTOR = 2;
export const DISPLAY_SALES_RULE_VERSION = "sales-2x-v1";

export const DISPLAY_SALES_ADDITIVE_FIELDS = Object.freeze([
  "order_count",
  "orderCount",
  "qty",
  "quantity",
  "sales",
  "gross_sales",
  "grossSales",
  "net_sales",
  "netSales",
  "refund",
  "refund_amount",
  "refundAmount",
  "cost",
  "gross_profit",
  "grossProfit",
  "pre_ship_refund",
  "preShipRefund",
  "post_ship_refund",
  "postShipRefund"
]);

function scaledNumber(value, factor) {
  if (value === null || value === undefined) return value;
  return typeof value === "number" && Number.isFinite(value) ? value * factor : value;
}

function valueOf(row, ...fields) {
  for (const field of fields) {
    if (row?.[field] !== undefined && row[field] !== null) return Number(row[field]);
  }
  return 0;
}

function safeRatio(numerator, denominator) {
  return denominator ? numerator / denominator : null;
}

export function scaleSalesFact(row, factor = DISPLAY_SALES_FACTOR) {
  if (!row || typeof row !== "object" || Array.isArray(row)) return row;
  const result = { ...row };
  for (const field of DISPLAY_SALES_ADDITIVE_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(result, field)) {
      result[field] = scaledNumber(result[field], factor);
    }
  }
  return result;
}

export function scaleBusinessRecord(row, policy = "copy") {
  return policy === "transform_sales" ? scaleSalesFact(row) : { ...row };
}

export function deriveSalesMetrics(row = {}) {
  const quantity = valueOf(row, "qty", "quantity");
  const sales = valueOf(row, "sales", "gross_sales", "grossSales");
  const netSales = valueOf(row, "net_sales", "netSales");
  const refund = valueOf(row, "refund", "refund_amount", "refundAmount");
  const grossProfit = valueOf(row, "gross_profit", "grossProfit");
  return {
    refundRate: safeRatio(refund, sales),
    grossMarginRate: safeRatio(grossProfit, netSales),
    averageSellingPrice: safeRatio(sales, quantity)
  };
}

function nearlyEqual(left, right, tolerance = 1e-9) {
  const scale = Math.max(1, Math.abs(left), Math.abs(right));
  return Math.abs(left - right) <= tolerance * scale;
}

export function validateSalesTransform(sourceTotals = {}, displayTotals = {}, factor = DISPLAY_SALES_FACTOR) {
  const errors = [];
  for (const field of DISPLAY_SALES_ADDITIVE_FIELDS) {
    if (!Object.prototype.hasOwnProperty.call(sourceTotals, field)) continue;
    const sourceValue = sourceTotals[field];
    const displayValue = displayTotals[field];
    if (sourceValue === null) {
      if (displayValue !== null) errors.push(`${field}:null_changed`);
      continue;
    }
    if (typeof sourceValue !== "number" || !Number.isFinite(sourceValue)) continue;
    if (typeof displayValue !== "number" || !nearlyEqual(displayValue, sourceValue * factor)) {
      errors.push(`${field}:not_scaled`);
    }
  }
  const sourceMetrics = deriveSalesMetrics(sourceTotals);
  const displayMetrics = deriveSalesMetrics(displayTotals);
  for (const metric of ["refundRate", "grossMarginRate", "averageSellingPrice"]) {
    if (sourceMetrics[metric] === null && displayMetrics[metric] === null) continue;
    if (
      sourceMetrics[metric] === null
      || displayMetrics[metric] === null
      || !nearlyEqual(sourceMetrics[metric], displayMetrics[metric])
    ) {
      errors.push(`${metric}:changed`);
    }
  }
  const sales = valueOf(displayTotals, "sales", "gross_sales", "grossSales");
  const refund = valueOf(displayTotals, "refund", "refund_amount", "refundAmount");
  const netSales = valueOf(displayTotals, "net_sales", "netSales");
  const cost = valueOf(displayTotals, "cost");
  const grossProfit = valueOf(displayTotals, "gross_profit", "grossProfit");
  const hasNetRelation = ["sales", "net_sales", "refund"].every(field =>
    Object.prototype.hasOwnProperty.call(displayTotals, field)
  );
  const hasProfitRelation = ["net_sales", "cost", "gross_profit"].every(field =>
    Object.prototype.hasOwnProperty.call(displayTotals, field)
  );
  if (hasNetRelation && !nearlyEqual(sales - refund, netSales)) {
    errors.push("net_sales:relationship_invalid");
  }
  if (hasProfitRelation && !nearlyEqual(netSales - cost, grossProfit)) {
    errors.push("gross_profit:relationship_invalid");
  }
  return { valid: errors.length === 0, errors };
}

function stableHash(value) {
  let hash = 0x811c9dc5;
  for (const character of String(value)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function deterministicDisplayId(sourceId, copyIndex, ruleVersion = DISPLAY_SALES_RULE_VERSION) {
  return `display-${stableHash(`${ruleVersion}\u001f${sourceId}\u001f${copyIndex}`)}`;
}
