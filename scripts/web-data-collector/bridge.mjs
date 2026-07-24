import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const SAFE_TASK_FIELDS = Object.freeze([
  "jobId",
  "providerId",
  "storeId",
  "resourceType",
  "businessDate",
  "status",
  "attempt",
  "scheduleVersion"
]);
const STORE_DAILY_FACT_KEYS = Object.freeze([
  "transactionAmount",
  "transactionOrderCount",
  "transactionBuyerCount",
  "userPaymentAmount",
  "settlementAmount",
  "refundAmountByPaymentDate",
  "refundAmountByRefundDate",
  "refundOrderCountByPaymentDate",
  "refundOrderCountByRefundDate",
  "productExposureUsers",
  "productClickUsers"
]);
const RESULT_FIELDS = Object.freeze({
  downloaded: new Set(["kind", "jobId", "downloadId", "safeFileName", "pageType", "reportVersion"]),
  captured: new Set(["kind", "jobId", "resourceType", "facts", "pageType", "selectorVersion"]),
  waiting_human: new Set(["kind", "jobId", "errorCode", "safeSummary"]),
  failed: new Set(["kind", "jobId", "errorCode", "safeSummary", "stage"]),
  schema_changed: new Set(["kind", "jobId", "errorCode", "safeSummary", "stage"])
});
const SAFE_CODE = /^[A-Z0-9_]{3,80}$/;
const SAFE_LABEL = /^[a-zA-Z0-9_-]{1,80}$/;

function json(response, status, body, origin) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin"
  });
  response.end(JSON.stringify(body));
}

function secretsEqual(left, right) {
  const first = Buffer.from(String(left || ""));
  const second = Buffer.from(String(right || ""));
  return first.length === second.length && first.length > 0 && timingSafeEqual(first, second);
}

function safeTaskProjection(task) {
  if (!task) return null;
  return Object.fromEntries(SAFE_TASK_FIELDS.filter(field => task[field] !== undefined).map(field => [field, task[field]]));
}

function validateStoreIdentity(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("STORE_IDENTITY_INVALID");
  const allowed = new Set(["providerId", "storeId", "storeName"]);
  if (Object.keys(value).some(field => !allowed.has(field))) throw new Error("STORE_IDENTITY_UNSAFE_FIELD");
  const providerId = String(value.providerId || "");
  const storeId = String(value.storeId || "");
  const storeName = String(value.storeName || "").trim();
  if (
    providerId !== "douyin-ecommerce"
    || !/^[-_a-zA-Z0-9]{1,128}$/.test(storeId)
    || !storeName
    || storeName.length > 120
    || /[\u0000-\u001f\u007f]/.test(storeName)
  ) {
    throw new Error("STORE_IDENTITY_INVALID");
  }
  return { providerId, storeId, storeName };
}

function validateResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RESULT_INVALID");
  const allowed = RESULT_FIELDS[value.kind];
  if (!allowed) throw new Error("RESULT_KIND_INVALID");
  if (Object.keys(value).some(field => !allowed.has(field))) throw new Error("RESULT_UNSAFE_FIELD");
  if (!/^[-_a-zA-Z0-9]{1,128}$/.test(String(value.jobId || ""))) throw new Error("RESULT_JOB_ID_INVALID");
  if (value.kind === "downloaded") {
    const fileName = String(value.safeFileName || "");
    if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName === "." || fileName === "..") {
      throw new Error("RESULT_FILE_NAME_INVALID");
    }
    if (!Number.isSafeInteger(value.downloadId) || value.downloadId < 0) throw new Error("RESULT_DOWNLOAD_ID_INVALID");
    if (!SAFE_LABEL.test(String(value.pageType || "")) || !SAFE_LABEL.test(String(value.reportVersion || ""))) {
      throw new Error("RESULT_REPORT_IDENTITY_INVALID");
    }
  }
  if (value.kind === "captured") {
    if (value.resourceType !== "store_daily") throw new Error("RESULT_CAPTURE_RESOURCE_INVALID");
    if (!SAFE_LABEL.test(String(value.pageType || "")) || !/^\d{4}-\d{2}-\d{2}$/.test(String(value.selectorVersion || ""))) {
      throw new Error("RESULT_CAPTURE_IDENTITY_INVALID");
    }
    if (!value.facts || typeof value.facts !== "object" || Array.isArray(value.facts)) {
      throw new Error("RESULT_CAPTURE_FACTS_INVALID");
    }
    const keys = Object.keys(value.facts);
    if (keys.length !== STORE_DAILY_FACT_KEYS.length || keys.some(key => !STORE_DAILY_FACT_KEYS.includes(key))) {
      throw new Error("RESULT_CAPTURE_FACTS_INVALID");
    }
    if (keys.some(key => value.facts[key] !== null && !Number.isFinite(value.facts[key]))) {
      throw new Error("RESULT_CAPTURE_FACTS_INVALID");
    }
  }
  if (["waiting_human", "failed", "schema_changed"].includes(value.kind)) {
    if (!SAFE_CODE.test(String(value.errorCode || ""))) throw new Error("RESULT_ERROR_CODE_INVALID");
    if (!String(value.safeSummary || "") || String(value.safeSummary).length > 240) throw new Error("RESULT_SUMMARY_TOO_LONG");
    if (value.stage !== undefined && !SAFE_LABEL.test(String(value.stage))) throw new Error("RESULT_STAGE_INVALID");
  }
  return Object.fromEntries(Object.entries(value));
}

async function readJson(request) {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > 64 * 1024) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

export function createCollectorBridge({ allowedOrigin, pairingKey, getNextTask, submitResult, registerStore }) {
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(String(allowedOrigin || ""))) throw new Error("BRIDGE_ORIGIN_INVALID");
  if (!/^wcp_[a-f0-9]{48}$/i.test(String(pairingKey || ""))) throw new Error("BRIDGE_PAIRING_KEY_INVALID");
  if (
    typeof getNextTask !== "function"
    || typeof submitResult !== "function"
    || typeof registerStore !== "function"
  ) throw new Error("BRIDGE_HANDLERS_REQUIRED");

  let server;
  let listeningPort = null;
  const handler = async (request, response) => {
    const requestOrigin = String(request.headers.origin || "");
    if (requestOrigin && requestOrigin !== allowedOrigin) {
      json(response, 403, { error: { code: "BRIDGE_ORIGIN_FORBIDDEN" } }, allowedOrigin);
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": allowedOrigin,
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Collector-Pairing-Key",
        "Access-Control-Max-Age": "600",
        Vary: "Origin"
      });
      response.end();
      return;
    }
    if (!secretsEqual(request.headers["x-collector-pairing-key"], pairingKey)) {
      json(response, 401, { error: { code: "BRIDGE_PAIRING_REQUIRED" } }, allowedOrigin);
      return;
    }
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (request.method === "GET" && url.pathname === "/v1/health") {
        json(response, 200, { ok: true }, allowedOrigin);
        return;
      }
      if (request.method === "GET" && url.pathname === "/v1/tasks/next") {
        json(response, 200, { task: safeTaskProjection(await getNextTask()) }, allowedOrigin);
        return;
      }
      if (request.method === "POST" && url.pathname === "/v1/providers/douyin-ecommerce/stores/identify") {
        await registerStore(validateStoreIdentity(await readJson(request)));
        json(response, 202, { accepted: true }, allowedOrigin);
        return;
      }
      const resultRoute = url.pathname.match(/^\/v1\/tasks\/([-_a-zA-Z0-9]{1,128})\/result$/);
      if (request.method === "POST" && resultRoute) {
        const result = validateResult(await readJson(request));
        if (result.jobId !== resultRoute[1]) throw new Error("RESULT_JOB_ID_MISMATCH");
        await submitResult(result);
        json(response, 202, { accepted: true }, allowedOrigin);
        return;
      }
      json(response, 404, { error: { code: "BRIDGE_ROUTE_NOT_FOUND" } }, allowedOrigin);
    } catch (error) {
      json(response, 400, { error: { code: error?.message || "BRIDGE_REQUEST_INVALID" } }, allowedOrigin);
    }
  };

  return {
    get port() {
      return listeningPort;
    },
    async listen({ port = 17653, host = "127.0.0.1" } = {}) {
      if (host !== "127.0.0.1") throw new Error("BRIDGE_HOST_MUST_BE_LOOPBACK");
      if (server) return;
      server = createServer((request, response) => void handler(request, response));
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, resolve);
      });
      listeningPort = server.address().port;
    },
    async close() {
      if (!server) return;
      const current = server;
      server = undefined;
      listeningPort = null;
      await new Promise((resolve, reject) => current.close(error => error ? reject(error) : resolve()));
    }
  };
}
