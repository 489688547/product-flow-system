export function salesDataServiceUrl(range) {
  if (!range) return "/api/platform/v1/data-services/sales";
  const params = new URLSearchParams({ from: String(range.from || ""), to: String(range.to || "") });
  return `/api/platform/v1/data-services/sales?${params}`;
}

export function rangeForSalesMonth(month, latestDate = "") {
  if (!/^\d{4}-\d{2}$/.test(month)) return { from: "", to: "" };
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  return { from: `${month}-01`, to: latestDate.startsWith(month) && latestDate < lastDay ? latestDate : lastDay };
}

async function readPayload(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.synced === false) {
    const error = new Error(payload.message || fallbackMessage);
    error.code = payload.error?.code || "DATA_SERVICE_QUERY_FAILED";
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function loadSalesDataAvailability(fetchImpl = fetch) {
  return readPayload(await fetchImpl(salesDataServiceUrl()), "销售数据可用范围加载失败。");
}

export async function querySalesDataService(range, fetchImpl = fetch) {
  return readPayload(await fetchImpl(salesDataServiceUrl(range)), "销售数据查询失败。");
}
