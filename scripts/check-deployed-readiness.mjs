import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export async function checkDeployedReadiness({ baseUrl, accessToken, fetchImpl = fetch } = {}) {
  const url = normalizeUrl(baseUrl);
  const token = String(accessToken || "").trim();
  if (!url) throw new Error("缺少生产部署 URL。");
  if (!token) throw new Error("缺少 PRODUCTION_DATA_ACCESS_TOKEN，无法执行受控生产检查。");
  const response = await fetchImpl(`${url}/api/platform/v1/environment-readiness`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || `生产环境检查失败（HTTP ${response.status}）。`);
  const blocking = (payload.capabilities || []).filter(capability => capability.status === "blocked");
  if (!payload.ready || blocking.length) {
    const missing = [...new Set(blocking.flatMap(capability => capability.missing || []))];
    throw new Error(`生产环境未就绪：${missing.join("、") || "存在未说明的阻断项"}`);
  }
  return payload;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  checkDeployedReadiness({
    baseUrl: argument("--url") || "https://product-flow-system.pages.dev",
    accessToken: process.env.PRODUCTION_DATA_ACCESS_TOKEN
  }).then(payload => {
    process.stdout.write(`生产环境就绪：${payload.checkedAt || new Date().toISOString()}\n`);
  }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
