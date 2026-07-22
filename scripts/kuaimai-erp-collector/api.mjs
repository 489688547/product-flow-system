const CHUNK_SIZE = 500;

function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:8132").trim().replace(/\/+$/, "");
}

export async function uploadErpCollection(collection, { baseUrl, fetchImpl = fetch, headers = {} } = {}) {
  if (!collection?.batch || !Array.isArray(collection.records) || !collection.records.length) {
    throw new Error("没有可上传的 ERP 记录。");
  }
  const chunks = [];
  for (let index = 0; index < collection.records.length; index += CHUNK_SIZE) {
    chunks.push(collection.records.slice(index, index + CHUNK_SIZE));
  }
  const results = [];
  for (const [index, records] of chunks.entries()) {
    const last = index === chunks.length - 1;
    const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/api/platform/v1/erp-collection/ingest`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": `${collection.batch.id}:chunk:${index + 1}`,
        ...headers
      },
      body: JSON.stringify({
        ...(collection.archive ? { archive: collection.archive } : {}),
        batch: { ...collection.batch, status: last ? collection.batch.status : "pending" },
        records,
        issues: last ? collection.issues || [] : []
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload?.error?.message || `ERP 分块 ${index + 1} 上传失败（HTTP ${response.status}）。`);
      error.code = payload?.error?.code || "ERP_COLLECTION_UPLOAD_FAILED";
      error.status = response.status;
      throw error;
    }
    results.push(payload.data || payload);
  }
  return { batchId: collection.batch.id, chunks: chunks.length, records: collection.records.length, issues: collection.issues?.length || 0, results };
}
