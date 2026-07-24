import { nodeRequest } from "./http.mjs";
import { projectKuaimaiErpRecords } from "../../src/domain/kuaimaiErpProjection.js";

const CHUNK_SIZE = 250;
const SALES_FACTS_CHUNK_SIZE = 1000;
// 每包失败时按指数退避重试最多 3 次（1s / 3s / 9s）。
const DEFAULT_RETRY_DELAYS_MS = [1000, 3000, 9000];

function normalizeBaseUrl(value) {
  return String(value || "http://127.0.0.1:8132").trim().replace(/\/+$/, "");
}

function defaultSleep(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

// 仅网络错误、请求超时（拿不到 HTTP 状态）和 5xx 允许重试；
// 4xx（含 422 校验失败）说明请求本身有问题，重试无意义，直接抛出。
function isRetryableUploadStatus(status) {
  return status == null || status >= 500;
}

async function postWithRetry(fetchImpl, url, options, {
  retryDelays = DEFAULT_RETRY_DELAYS_MS,
  sleep = defaultSleep,
  errorPrefix = "上传失败",
  errorCode = "ERP_COLLECTION_UPLOAD_FAILED"
} = {}) {
  for (let attempt = 0; ; attempt += 1) {
    let status = null;
    let failure = null;
    try {
      const response = await fetchImpl(url, options);
      status = response.status;
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload.data || payload;
      failure = new Error(payload?.error?.message || `${errorPrefix}（HTTP ${response.status}）。`);
      failure.code = payload?.error?.code || errorCode;
      failure.status = response.status;
    } catch (error) {
      failure = error;
    }
    if (attempt >= retryDelays.length || !isRetryableUploadStatus(status)) throw failure;
    await sleep(retryDelays[attempt]);
  }
}

export async function uploadErpCollection(collection, {
  baseUrl,
  fetchImpl = nodeRequest,
  headers = {},
  retryDelays = DEFAULT_RETRY_DELAYS_MS,
  sleep = defaultSleep
} = {}) {
  if (!collection?.batch || !Array.isArray(collection.records) || !collection.records.length) {
    throw new Error("没有可上传的 ERP 记录。");
  }
  if (collection.batch.resourceType === "sales_items") {
    if (collection.batch.status !== "completed") {
      const error = new Error("快麦销售明细未通过完整性校验，不能标记为同步成功。");
      error.code = "ERP_COLLECTION_BATCH_PARTIAL";
      error.status = 422;
      throw error;
    }
    const projection = projectKuaimaiErpRecords("sales_items", collection.records, {
      batchId: collection.batch.id,
      now: collection.batch.collectedAt || new Date().toISOString()
    });
    const facts = projection.salesDaily;
    const factChunks = [];
    for (let index = 0; index < facts.length; index += SALES_FACTS_CHUNK_SIZE) {
      factChunks.push(facts.slice(index, index + SALES_FACTS_CHUNK_SIZE));
    }
    if (!factChunks.length) {
      const error = new Error("快麦销售明细没有可写入的标准销售事实。");
      error.code = "ERP_COLLECTION_SALES_FACTS_EMPTY";
      error.status = 422;
      throw error;
    }
    // 服务端按日期整体重写标准事实：首包携带完整日期列表先删后写，
    // 后续包只插入，保证同一批次的日期重写只做一次。
    const allDates = [...new Set(facts.map(fact => fact.date))].sort();
    const issues = [...(collection.issues || []), ...projection.exceptions];
    const results = [];
    for (const [index, chunkFacts] of factChunks.entries()) {
      const first = index === 0;
      const last = index === factChunks.length - 1;
      const result = await postWithRetry(fetchImpl, `${normalizeBaseUrl(baseUrl)}/api/platform/v1/erp-collection/sales-facts`, {
        method: "POST",
        timeoutMs: 120_000,
        headers: {
          "content-type": "application/json",
          "idempotency-key": `${collection.batch.id}:projected-sales:${index + 1}`,
          ...headers
        },
        body: JSON.stringify({
          ...(first && collection.archive ? { archive: collection.archive } : {}),
          batch: collection.batch,
          facts: chunkFacts,
          issues: last ? issues : [],
          ...(factChunks.length > 1 ? { chunk: { index: index + 1, total: factChunks.length } } : {}),
          ...(factChunks.length > 1 && first ? { replaceDates: allDates } : {})
        })
      }, {
        retryDelays,
        sleep,
        errorPrefix: "ERP 销售事实上传失败"
      });
      results.push(result);
    }
    return {
      batchId: collection.batch.id,
      chunks: factChunks.length,
      records: collection.records.length,
      issues: collection.issues?.length || 0,
      results
    };
  }
  const chunks = [];
  for (let index = 0; index < collection.records.length; index += CHUNK_SIZE) {
    chunks.push(collection.records.slice(index, index + CHUNK_SIZE));
  }
  const results = [];
  for (const [index, records] of chunks.entries()) {
    const last = index === chunks.length - 1;
    const result = await postWithRetry(fetchImpl, `${normalizeBaseUrl(baseUrl)}/api/platform/v1/erp-collection/ingest`, {
      method: "POST",
      timeoutMs: 120_000,
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
    }, {
      retryDelays,
      sleep,
      errorPrefix: `ERP 分块 ${index + 1} 上传失败`
    });
    results.push(result);
  }
  const finalResult = results.at(-1) || {};
  const finalStatus = String(finalResult.status || collection.batch.status || "");
  if (collection.batch.resourceType === "sales_items" && finalStatus !== "completed") {
    const error = new Error("快麦销售明细已上传原始记录，但批次校验未完成，不能标记为同步成功。");
    error.code = "ERP_COLLECTION_BATCH_PARTIAL";
    error.status = 422;
    throw error;
  }
  return { batchId: collection.batch.id, chunks: chunks.length, records: collection.records.length, issues: collection.issues?.length || 0, results };
}

export async function uploadErpArchive(archive, { baseUrl, fetchImpl = nodeRequest, headers = {} } = {}) {
  const response = await fetchImpl(`${normalizeBaseUrl(baseUrl)}/api/platform/v1/erp-collection/archives`, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ archive })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `ERP 归档清单上传失败（HTTP ${response.status}）。`);
    error.code = payload?.error?.code || "ERP_COLLECTION_ARCHIVE_UPLOAD_FAILED";
    error.status = response.status;
    throw error;
  }
  return payload.data || payload;
}
