function numeric(value) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateOnly(value) {
  return String(value || "").slice(0, 10);
}

function monthBounds(month) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  const periodEndDate = new Date(Date.UTC(year, monthNumber, 0));
  return {
    periodStart: `${month}-01`,
    periodEnd: periodEndDate.toISOString().slice(0, 10),
    daysInPeriod: periodEndDate.getUTCDate()
  };
}

function usableEvent(event, periodEnd) {
  const occurredAt = dateOnly(event?.occurredAt);
  return Boolean(occurredAt && occurredAt <= periodEnd && !event?.payloadMalformed);
}

export function buildGoodsFlowMetricInput({ month, events = [], inventoryDaily = [], receivableTerms = [] } = {}) {
  const { periodStart, periodEnd, daysInPeriod } = monthBounds(month);
  const usable = events.filter(event => usableEvent(event, periodEnd));
  const inMonth = usable.filter(event => dateOnly(event.occurredAt) >= periodStart);

  const sales = inMonth
    .filter(event => event.eventType === "sale_consumed")
    .map(event => ({
      platform: String(event.payload?.platform || "").trim(),
      date: dateOnly(event.occurredAt),
      netSales: numeric(event.payload?.netSales),
      cost: numeric(event.payload?.cost)
    }));
  const purchases = inMonth
    .filter(event => event.eventType === "purchase_approved")
    .map(event => ({
      id: event.purchaseId || event.payload?.processInstanceId || event.id,
      amount: numeric(event.payload?.approvedAmount),
      receivedAt: event.payload?.receivedAt || null,
      approvedAt: event.occurredAt
    }));
  const payments = usable
    .filter(event => event.eventType === "purchase_paid")
    .map(event => ({
      purchaseId: event.purchaseId || event.payload?.purchaseId || event.payload?.purchaseProcessInstanceId,
      amount: numeric(event.payload?.amount),
      paidAt: event.occurredAt
    }));

  const periodInventory = inventoryDaily.filter(row => {
    const date = dateOnly(row?.date || row?.snapshotDate);
    return date >= periodStart && date <= periodEnd;
  });
  const inventoryFunds = usable.reduce((totals, event) => {
    if (event.eventType === "purchase_paid") totals.paidPurchaseAmount += Math.max(0, numeric(event.payload?.amount));
    if (event.eventType === "sale_consumed") totals.consumedSalesCost += Math.max(0, numeric(event.payload?.cost));
    if (event.eventType === "inventory_adjustment_confirmed") totals.confirmedStocktakeAdjustment += numeric(event.payload?.amountVariance);
    return totals;
  }, { paidPurchaseAmount: 0, consumedSalesCost: 0, confirmedStocktakeAdjustment: 0 });

  const updatedCandidates = [
    ...usable.map(row => row.occurredAt),
    ...periodInventory.map(row => row.sourceUpdatedAt || row.date),
    ...receivableTerms.map(row => row.createdAt || row.effectiveFrom)
  ].filter(Boolean).sort();

  return {
    month,
    periodEnd,
    daysInPeriod,
    inventoryDaily: periodInventory,
    sales,
    receivableTerms,
    purchases,
    payments,
    inventoryFunds,
    sourceUpdatedAt: updatedCandidates.at(-1) || null
  };
}
