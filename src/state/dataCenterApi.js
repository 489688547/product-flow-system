import { filterOperationalSales } from "../domain/dataCenter.js";

function validDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) === value;
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
        meta: { from, to, rowCount: rows.length, timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true, lastSuccessfulSyncAt: "", latestDataDate }
      };
    }
    const payload = await payloadFor(response, "数据中心销售数据加载失败。");
    return { rows: payload.rows || [], meta: payload.meta || {}, local: false };
  });
}
