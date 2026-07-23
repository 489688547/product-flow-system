import { filterOperationalSales } from "../domain/dataCenter.js";

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
}

function latestDailyFacts(rows, limit = 8) {
  const dailyFacts = new Map();
  rows.forEach(row => {
    if (!validDate(String(row?.date || ""))) return;
    const current = dailyFacts.get(row.date) || { date: row.date, sales: 0, qty: 0 };
    current.sales += Number(row.sales) || 0;
    current.qty += Number(row.qty) || 0;
    dailyFacts.set(row.date, current);
  });
  return [...dailyFacts.values()]
    .sort((left, right) => left.date.localeCompare(right.date))
    .slice(-limit);
}

export function dataCenterRangeFromSearch(search, fallback) {
  const params = new URLSearchParams(String(search || ""));
  const from = String(params.get("from") || "");
  const to = String(params.get("to") || "");
  return validDate(from) && validDate(to) && from <= to ? { from, to } : fallback;
}

export function dataCenterApiUrl() {
  return "/api/data-center";
}

export function dataCenterSalesApiUrl({ from, to }) {
  const params = new URLSearchParams({ from: String(from || ""), to: String(to || "") });
  return `/api/data-center/sales?${params}`;
}

async function payloadFor(response, fallbackMessage, { allowUnsynced = false } = {}) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || (!allowUnsynced && payload.synced === false)) {
    const error = new Error(payload.message || fallbackMessage);
    error.status = response.status;
    error.code = payload.error?.code || "INTERNAL_UNEXPECTED";
    error.retryable = Boolean(payload.error?.retryable);
    throw error;
  }
  return payload;
}

async function retryDataCenterRead(operation) {
  try {
    return await operation();
  } catch (error) {
    if (!error?.retryable || Number(error?.status || 0) < 500) throw error;
    await new Promise(resolve => setTimeout(resolve, 250));
    return operation();
  }
}

export async function loadDataCenterState(fetchImpl = fetch) {
  return retryDataCenterRead(async () => {
    const response = await fetchImpl(dataCenterApiUrl());
    return payloadFor(response, "数据中心元数据加载失败。", { allowUnsynced: true });
  });
}

export async function saveDataCenterState(state, fetchImpl = fetch) {
  const response = await fetchImpl(dataCenterApiUrl(), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state })
  });
  return payloadFor(response, "数据中心元数据保存失败。");
}

export async function loadDataCenterSales({ from, to, codes = [], fetchImpl = fetch, fallback }) {
  return retryDataCenterRead(async () => {
    const response = await fetchImpl(dataCenterSalesApiUrl({ from, to }));
    if ([404, 405, 501].includes(response.status) && fallback) {
      const rows = filterOperationalSales(await fallback(codes)).filter(row => row.date >= from && row.date <= to);
      const latestDataDate = rows.reduce((latest, row) => row.date > latest ? row.date : latest, "");
      return {
        rows,
        local: true,
        meta: {
          from,
          to,
          rowCount: rows.length,
          timeBasis: "create_time",
          timezone: "Asia/Shanghai",
          excludeOther: true,
          lastSuccessfulSyncAt: "",
          latestDataDate,
          latestDailyFacts: latestDailyFacts(rows)
        }
      };
    }
    const payload = await payloadFor(response, "数据中心销售数据加载失败。");
    const rows = payload.rows || [];
    const meta = payload.meta || {};
    return {
      rows,
      meta: {
        ...meta,
        latestDataDate: meta.latestDataDate || rows.reduce((latest, row) => row.date > latest ? row.date : latest, ""),
        latestDailyFacts: Array.isArray(meta.latestDailyFacts) ? meta.latestDailyFacts : latestDailyFacts(rows)
      },
      local: false
    };
  });
}
