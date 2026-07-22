import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";

const SAFE_TASK_FIELDS = Object.freeze([
  "jobId",
  "providerId",
  "resourceType",
  "businessDate",
  "status",
  "attempt",
  "scheduleVersion"
]);
const SAFE_RESULT_FIELDS = new Set([
  "jobId",
  "providerId",
  "resourceType",
  "status",
  "stage",
  "downloadId",
  "fileName",
  "rowCount",
  "errorCode",
  "errorSummary",
  "startedAt",
  "completedAt"
]);
const FORBIDDEN_FIELD_PATTERN = /(password|passwd|secret|cookie|token|authorization|credential|otp|captcha|html|page|screenshot|selector|script|url|path)/i;

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

function validateResult(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("RESULT_INVALID");
  for (const field of Object.keys(value)) {
    if (!SAFE_RESULT_FIELDS.has(field) || FORBIDDEN_FIELD_PATTERN.test(field)) throw new Error("RESULT_UNSAFE_FIELD");
  }
  if (!/^[-_a-zA-Z0-9]{1,128}$/.test(String(value.jobId || ""))) throw new Error("RESULT_JOB_ID_INVALID");
  if (value.fileName !== undefined) {
    const fileName = String(value.fileName || "");
    if (!fileName || fileName.includes("/") || fileName.includes("\\") || fileName === "." || fileName === "..") {
      throw new Error("RESULT_FILE_NAME_INVALID");
    }
  }
  if (value.errorSummary !== undefined && String(value.errorSummary).length > 240) throw new Error("RESULT_SUMMARY_TOO_LONG");
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

export function createCollectorBridge({ allowedOrigin, pairingKey, getNextTask, submitResult }) {
  if (!/^chrome-extension:\/\/[a-p]{32}$/.test(String(allowedOrigin || ""))) throw new Error("BRIDGE_ORIGIN_INVALID");
  if (!/^wcp_[a-f0-9]{48}$/i.test(String(pairingKey || ""))) throw new Error("BRIDGE_PAIRING_KEY_INVALID");
  if (typeof getNextTask !== "function" || typeof submitResult !== "function") throw new Error("BRIDGE_HANDLERS_REQUIRED");

  let server;
  let listeningPort = null;
  const handler = async (request, response) => {
    const requestOrigin = String(request.headers.origin || "");
    if (requestOrigin !== allowedOrigin) {
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
