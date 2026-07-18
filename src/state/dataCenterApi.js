import { filterOperationalSales } from "../domain/dataCenter.js";

export function dataCenterApiUrl() {
  return "/api/data-center";
}

export function dataCenterSalesApiUrl({ from, to }) {
  const params = new URLSearchParams({ from: String(from || ""), to: String(to || "") });
  return `/api/data-center/sales?${params}`;
}

async function payloadFor(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.synced === false) {
    const error = new Error(payload.message || fallbackMessage);
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function loadDataCenterState(fetchImpl = fetch) {
  const response = await fetchImpl(dataCenterApiUrl());
  return payloadFor(response, "数据中心元数据加载失败。");
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
  const response = await fetchImpl(dataCenterSalesApiUrl({ from, to }));
  if ([404, 405, 501].includes(response.status) && fallback) {
    const rows = filterOperationalSales(await fallback(codes)).filter(row => row.date >= from && row.date <= to);
    return {
      rows,
      local: true,
      meta: { from, to, rowCount: rows.length, timeBasis: "create_time", timezone: "Asia/Shanghai", excludeOther: true, lastSuccessfulSyncAt: "" }
    };
  }
  const payload = await payloadFor(response, "数据中心销售数据加载失败。");
  return { rows: payload.rows || [], meta: payload.meta || {}, local: false };
}
