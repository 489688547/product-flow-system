const BASE_URL = "/api/platform/v1/data-standards";
const DEFINITION_FIELDS = [
  "metricCode", "name", "category", "ownerDepartment", "unit", "period", "effectiveFrom",
  "displayFormula", "formulaAst", "sourceFields", "expectedVersion"
];
const CALCULATION_FIELDS = ["metricCodes", "from", "to", "targetVersions", "mode", "confirmed", "idempotencyKey"];

export class DataStandardsApiError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "DataStandardsApiError";
    this.status = Number(options.status || 0);
    this.code = options.code || "INTERNAL_UNEXPECTED";
    this.details = options.details;
    this.retryable = Boolean(options.retryable);
  }
}

export async function runAuthorizedDataStandardsWrite(canWrite, operation) {
  if (!canWrite) {
    throw new DataStandardsApiError("当前身份不能维护数据口径。", {
      status: 403,
      code: "PERMISSION_WRITE_DENIED",
      retryable: false
    });
  }
  return operation();
}

function pick(input, fields) {
  return Object.fromEntries(fields.filter(field => Object.hasOwn(input || {}, field)).map(field => [field, input[field]]));
}

async function payloadFor(response, fallbackMessage) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.synced === false) {
    throw new DataStandardsApiError(payload.message || fallbackMessage, {
      status: response.status,
      code: payload.error?.code,
      details: payload.error?.details,
      retryable: payload.error?.retryable ?? payload.retryable
    });
  }
  return payload;
}

function queryString(query, fields) {
  const params = new URLSearchParams();
  for (const field of fields) {
    const value = query?.[field];
    if (value === undefined || value === null || value === "") continue;
    if (field === "metricCodes") params.set(field, (Array.isArray(value) ? value : [value]).filter(Boolean).join(","));
    else if (field === "dimensions") params.set(field, JSON.stringify(value));
    else params.set(field, String(value));
  }
  const result = params.toString();
  return result ? `?${result}` : "";
}

function requestOptions(method, body, signal) {
  return {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {})
  };
}

function getOptions(signal) {
  return signal ? { signal } : undefined;
}

export async function loadDataStandards(filters = {}, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}${queryString(filters, ["category", "ownerDepartment", "status"])}`, getOptions(signal));
  return payloadFor(response, "数据口径目录加载失败。");
}

export async function loadDataStandard(id, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(id)}`, getOptions(signal));
  return payloadFor(response, "数据口径详情加载失败。");
}

export async function createDataStandard(input, fetchImpl = fetch, signal) {
  const response = await fetchImpl(BASE_URL, requestOptions("POST", pick(input, DEFINITION_FIELDS), signal));
  return payloadFor(response, "数据口径创建失败。");
}

export async function publishDataStandardVersion(id, input, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(id)}`, requestOptions("PUT", pick(input, DEFINITION_FIELDS), signal));
  return payloadFor(response, "数据口径版本发布失败。");
}

export async function archiveDataStandard(id, input, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/${encodeURIComponent(id)}/archive`, requestOptions("POST", pick(input, ["expectedVersion"]), signal));
  return payloadFor(response, "数据口径归档失败。");
}

export async function previewDataStandard(input, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/preview`, requestOptions("POST", pick(input, [...DEFINITION_FIELDS, "from", "to"]), signal));
  return payloadFor(response, "数据口径预览失败。");
}

export async function requestMetricCalculation(input, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/recalculate`, requestOptions("POST", pick(input, CALCULATION_FIELDS), signal));
  return payloadFor(response, "数据口径计算请求失败。");
}

export async function loadMetricResults(query = {}, fetchImpl = fetch, signal) {
  const response = await fetchImpl(`${BASE_URL}/results${queryString(query, ["metricCodes", "from", "to", "runId", "dimensions"])}`, getOptions(signal));
  return payloadFor(response, "数据口径结果加载失败。");
}

function wait(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    const finish = () => {
      signal?.removeEventListener("abort", abort);
      resolve();
    };
    const timer = setTimeout(finish, milliseconds);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    };
    if (!signal) return;
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

export async function pollMetricResults(query, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const waitImpl = options.waitImpl || wait;
  const interval = Number(options.interval || 800);
  const maxAttempts = Number(options.maxAttempts || 20);
  const signal = options.signal;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    signal?.throwIfAborted();
    const payload = await loadMetricResults(query, fetchImpl, signal);
    if (payload.results?.length || ["succeeded", "failed"].includes(payload.run?.status)) return payload;
    if (attempt < maxAttempts) {
      await waitImpl(interval, signal);
      signal?.throwIfAborted();
    }
  }
  throw new DataStandardsApiError("数据口径计算仍在进行，请稍后重试。", {
    status: 408,
    code: "DATA_STANDARD_CALCULATION_TIMEOUT",
    retryable: true
  });
}
