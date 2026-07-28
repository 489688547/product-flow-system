export function erpArchiveApiUrl() {
  return "/api/platform/v1/erp-collection/archives";
}

export async function loadErpArchives(fetchImpl = fetch, { limit = 100 } = {}) {
  const response = await fetchImpl(`${erpArchiveApiUrl()}?limit=${encodeURIComponent(limit)}`, {
    headers: { accept: "application/json" },
    credentials: "same-origin"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "快麦归档状态读取失败。");
    error.code = payload?.error?.code || "ERP_COLLECTION_ARCHIVE_READ_FAILED";
    error.status = response.status;
    throw error;
  }
  return payload.data || { archives: [] };
}

export async function setErpArchiveDecision(input, fetchImpl = fetch) {
  const response = await fetchImpl(erpArchiveApiUrl(), {
    method: "PATCH",
    headers: { accept: "application/json", "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(input)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || "归档入库原因保存失败。");
    error.code = payload?.error?.code || "ERP_COLLECTION_ARCHIVE_DECISION_FAILED";
    error.status = response.status;
    error.requestId = payload?.error?.requestId || "";
    error.retryable = Boolean(payload?.error?.retryable);
    throw error;
  }
  return payload.data || { archive: null };
}
