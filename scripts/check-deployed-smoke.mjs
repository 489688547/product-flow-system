import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkDeployedReadiness } from "./check-deployed-readiness.mjs";

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function commitFromHtml(html = "") {
  return String(html).match(
    /<meta\s+name=["']pfs-release-commit["']\s+content=["']([0-9a-f]{7,40})["'][^>]*>/i
  )?.[1] || "";
}

export function sameCommit(actual, expected) {
  const left = String(actual || "").toLowerCase();
  const right = String(expected || "").toLowerCase();
  return left === right || left.startsWith(right) || right.startsWith(left);
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

async function checkCredentialedCors({ apiUrl, browserOrigin, fetchImpl }) {
  if (!browserOrigin) return null;
  const response = await fetchImpl(`${apiUrl}/api/auth/session`, {
    method: "OPTIONS",
    headers: {
      origin: browserOrigin,
      "access-control-request-method": "GET",
      "access-control-request-headers": "content-type"
    }
  });
  if (
    response.status !== 204
    || response.headers.get("access-control-allow-origin") !== browserOrigin
    || response.headers.get("access-control-allow-credentials") !== "true"
  ) {
    throw new Error(`测试 API CORS 未就绪（HTTP ${response.status}）。`);
  }
  return { origin: browserOrigin, status: response.status };
}

export async function checkDeployedSmoke({
  baseUrl,
  apiBaseUrl = baseUrl,
  expectedCommit,
  accessToken,
  requiredPlatforms = [],
  expectedEnvironment = "",
  allowedBrowserOrigin = "",
  forbidServerEnvDev = false,
  oauthConcurrency = 20,
  fetchImpl = fetch
} = {}) {
  const url = normalizeUrl(baseUrl);
  const apiUrl = normalizeUrl(apiBaseUrl);
  const commit = String(expectedCommit || "").trim().toLowerCase();
  if (!url || !apiUrl) throw new Error("缺少固定站点或 API URL。");
  if (!/^[0-9a-f]{7,40}$/i.test(commit)) throw new Error("缺少有效的预期 commit。");

  const entry = await fetchImpl(`${url}/`, {
    headers: { accept: "text/html" },
    cache: "no-store"
  });
  const entryHtml = await entry.text();
  const deployedCommit = commitFromHtml(entryHtml);
  if (!entry.ok || !deployedCommit || !sameCommit(deployedCommit, commit)) {
    throw new Error(`固定站点 commit 不一致：预期 ${commit.slice(0, 12)}，实际 ${deployedCommit.slice(0, 12) || "missing"}。`);
  }
  if (forbidServerEnvDev && String(entry.headers.get("x-server-env") || "").toLowerCase() === "dev") {
    throw new Error("生产入口仍报告 x-server-env: dev。");
  }

  const cors = await checkCredentialedCors({
    apiUrl,
    browserOrigin: normalizeUrl(allowedBrowserOrigin),
    fetchImpl
  });
  const session = await fetchImpl(`${apiUrl}/api/auth/session`, {
    headers: { accept: "application/json", ...(allowedBrowserOrigin ? { origin: allowedBrowserOrigin } : {}) },
    cache: "no-store"
  });
  const sessionBody = await readJson(session);
  const safeAnonymousSession = session.status === 401
    && sessionBody.authenticated === false
    && (sessionBody.user === null || sessionBody.user === undefined);
  if ((!session.ok && !safeAnonymousSession) || typeof sessionBody.authenticated !== "boolean") {
    throw new Error(`认证会话检查未返回安全状态（HTTP ${session.status}）。`);
  }

  const readiness = await checkDeployedReadiness({
    baseUrl: apiUrl,
    accessToken,
    requiredPlatforms,
    expectedEnvironment,
    oauthConcurrency,
    fetchImpl
  });
  return {
    baseUrl: url,
    apiBaseUrl: apiUrl,
    commit: deployedCommit,
    checkedAt: new Date().toISOString(),
    sessionAuthenticated: sessionBody.authenticated,
    cors,
    readiness
  };
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function listArgument(name) {
  return String(argument(name) || "").split(",").map(value => value.trim()).filter(Boolean);
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  checkDeployedSmoke({
    baseUrl: argument("--url"),
    apiBaseUrl: argument("--api-url") || argument("--url"),
    expectedCommit: argument("--commit") || process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA,
    accessToken: process.env.PRODUCTION_DATA_ACCESS_TOKEN,
    requiredPlatforms: listArgument("--require-platform"),
    expectedEnvironment: argument("--expect-environment"),
    allowedBrowserOrigin: argument("--allowed-browser-origin"),
    forbidServerEnvDev: process.argv.includes("--forbid-server-env-dev")
  }).then(result => {
    process.stdout.write(`固定站点冒烟通过：${result.baseUrl} -> ${result.apiBaseUrl} @ ${result.commit.slice(0, 12)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
