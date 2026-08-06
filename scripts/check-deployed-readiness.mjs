import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function wait(delay) {
  return new Promise(resolve => setTimeout(resolve, delay));
}

function oauthFailureMessage(text, status) {
  try {
    const payload = JSON.parse(text);
    return payload.message || payload?.error?.message || `HTTP ${status}`;
  } catch {
    return String(text || "").trim().slice(0, 180) || `HTTP ${status}`;
  }
}

function transientOauthFailure(response, text) {
  return [502, 503, 504].includes(response.status) || /temporarily unavailable/i.test(text);
}

async function readOauthBootstrap(url, fetchImpl) {
  const response = await fetchImpl(`${url}/api/auth/dingtalk/bootstrap`, {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`钉钉 OAuth bootstrap 失败：${oauthFailureMessage(text, response.status)}`);
    error.retryable = transientOauthFailure(response, text);
    throw error;
  }
  const payload = JSON.parse(text);
  const authorize = new URL(payload.authorizeUrl || "");
  const callback = new URL(authorize.searchParams.get("redirect_uri") || "https://invalid.local");
  if (
    payload.ready !== true
    || authorize.origin !== "https://login.dingtalk.com"
    || callback.origin !== new URL(url).origin
  ) {
    throw new Error("钉钉 OAuth bootstrap 未返回有效授权地址。");
  }
  return payload;
}

async function readOauthBootstrapWithRetry(url, fetchImpl, retryDelays) {
  let lastError = null;
  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) await wait(retryDelays[attempt]);
    try {
      return await readOauthBootstrap(url, fetchImpl);
    } catch (error) {
      lastError = error;
      if (!error.retryable || attempt === retryDelays.length - 1) throw error;
    }
  }
  throw lastError;
}

async function checkDingTalkOauth({
  url,
  fetchImpl,
  concurrency = 20,
  retryDelays = [0, 250, 750, 1500]
}) {
  await readOauthBootstrapWithRetry(url, fetchImpl, retryDelays);

  const count = Math.max(1, Math.min(50, Number(concurrency) || 20));
  await Promise.all(
    Array.from(
      { length: count },
      () => readOauthBootstrapWithRetry(url, fetchImpl, retryDelays)
    )
  );
  return { bootstrapConcurrency: count, callbackOrigin: new URL(url).origin };
}

export async function checkDeployedReadiness({
  baseUrl,
  accessToken,
  requiredPlatforms = [],
  fetchImpl = fetch,
  oauthConcurrency = 20,
  expectedEnvironment = ""
} = {}) {
  const url = normalizeUrl(baseUrl);
  const token = String(accessToken || "").trim();
  if (!url) throw new Error("缺少部署 API URL。");
  if (!token) throw new Error("缺少 PRODUCTION_DATA_ACCESS_TOKEN，无法执行受控部署检查。");
  const response = await fetchImpl(`${url}/api/platform/v1/environment-readiness`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `部署环境检查失败（HTTP ${response.status}）。`);
  if (expectedEnvironment && payload.environment !== expectedEnvironment) {
    throw new Error(`部署环境不一致：预期 ${expectedEnvironment}，实际 ${payload.environment || "missing"}。`);
  }
  const blocking = (payload.capabilities || []).filter(capability => capability.status === "blocked");
  if (!payload.ready || blocking.length) {
    const missing = [...new Set(blocking.flatMap(capability => capability.missing || []))];
    throw new Error(`部署环境未就绪：${missing.join("、") || "存在未说明的阻断项"}`);
  }
  const required = new Set(requiredPlatforms.map(value => String(value || "").trim().toLowerCase()).filter(Boolean));
  const affectedWarnings = (payload.capabilities || []).filter(capability =>
    capability.status === "warning"
    && (capability.platforms || []).some(platform => required.has(String(platform).toLowerCase()))
  );
  if (affectedWarnings.length) {
    const details = affectedWarnings.map(capability => {
      const missing = [...new Set(capability.missing || [])];
      return `${capability.id}${missing.length ? `（${missing.join("、")}）` : ""}`;
    });
    throw new Error(`受影响平台仍有环境警告：${details.join("；")}`);
  }
  if (required.has("dingtalk")) {
    payload.oauth = await checkDingTalkOauth({
      url,
      fetchImpl,
      concurrency: oauthConcurrency
    });
  }
  return payload;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function argumentsList(name) {
  const values = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] !== name) continue;
    values.push(...String(process.argv[index + 1] || "").split(","));
  }
  return [...new Set(values.map(value => value.trim().toLowerCase()).filter(Boolean))];
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  checkDeployedReadiness({
    baseUrl: argument("--url") || "https://deshan-tiyes.cn",
    accessToken: process.env.PRODUCTION_DATA_ACCESS_TOKEN,
    requiredPlatforms: argumentsList("--require-platform"),
    expectedEnvironment: argument("--expect-environment")
  }).then(payload => {
    process.stdout.write(`部署环境就绪：${payload.checkedAt || new Date().toISOString()}\n`);
  }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
