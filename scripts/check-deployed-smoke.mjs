import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { checkDeployedReadiness } from "./check-deployed-readiness.mjs";

function normalizeUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function commitFromHtml(html = "") {
  return String(html).match(
    /<meta\s+name=["']pfs-release-commit["']\s+content=["']([0-9a-f]{7,40})["'][^>]*>/i
  )?.[1] || "";
}

function sameCommit(actual, expected) {
  const left = String(actual || "").toLowerCase();
  const right = String(expected || "").toLowerCase();
  return left === right || left.startsWith(right) || right.startsWith(left);
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

export async function checkDeployedSmoke({
  baseUrl,
  expectedCommit,
  accessToken,
  requiredPlatforms = [],
  fetchImpl = fetch
} = {}) {
  const url = normalizeUrl(baseUrl);
  const commit = String(expectedCommit || "").trim().toLowerCase();
  if (!url) throw new Error("缺少固定站点 URL。");
  if (!/^[0-9a-f]{7,40}$/i.test(commit)) throw new Error("缺少有效的预期 commit。");

  const entry = await fetchImpl(`${url}/cloudflare-entry.html`, {
    headers: { accept: "text/html" },
    cache: "no-store"
  });
  const entryHtml = await entry.text();
  const deployedCommit = commitFromHtml(entryHtml);
  if (!entry.ok || !deployedCommit || !sameCommit(deployedCommit, commit)) {
    throw new Error(`固定站点 commit 不一致：预期 ${commit.slice(0, 12)}，实际 ${deployedCommit.slice(0, 12) || "missing"}。`);
  }

  const oauthEntry = await fetchImpl(`${url}/api/auth/dingtalk/start`, {
    headers: { accept: "text/html" },
    cache: "no-store",
    redirect: "manual"
  });
  const oauthHtml = await oauthEntry.text();
  if (
    !oauthEntry.ok
    || !String(oauthEntry.headers.get("content-type") || "").includes("text/html")
    || !/data-oauth-status|runDingTalkOAuthStart/.test(oauthHtml)
  ) {
    throw new Error(`钉钉 OAuth 静态入口未就绪（HTTP ${oauthEntry.status}）。`);
  }

  const bootstrap = await fetchImpl(`${url}/api/auth/dingtalk/bootstrap`, {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  const bootstrapBody = await readJson(bootstrap);
  const authorize = new URL(bootstrapBody.authorizeUrl || "https://invalid.local");
  const callback = new URL(authorize.searchParams.get("redirect_uri") || "https://invalid.local");
  if (
    !bootstrap.ok
    || bootstrapBody.ready !== true
    || authorize.origin !== "https://login.dingtalk.com"
    || callback.origin !== new URL(url).origin
  ) {
    throw new Error("钉钉 OAuth callback Origin 与固定站点不一致。");
  }

  const session = await fetchImpl(`${url}/api/auth/session`, {
    headers: { accept: "application/json" },
    cache: "no-store"
  });
  const sessionBody = await readJson(session);
  if (!session.ok || typeof sessionBody.authenticated !== "boolean") {
    throw new Error(`认证会话检查未返回安全状态（HTTP ${session.status}）。`);
  }

  const readiness = await checkDeployedReadiness({
    baseUrl: url,
    accessToken,
    requiredPlatforms,
    fetchImpl
  });
  return {
    baseUrl: url,
    commit: deployedCommit,
    checkedAt: new Date().toISOString(),
    oauth: {
      entryStatus: oauthEntry.status,
      callbackOrigin: callback.origin
    },
    sessionAuthenticated: sessionBody.authenticated,
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
    expectedCommit: argument("--commit") || process.env.GITHUB_SHA || process.env.CF_PAGES_COMMIT_SHA,
    accessToken: process.env.PRODUCTION_DATA_ACCESS_TOKEN,
    requiredPlatforms: listArgument("--require-platform")
  }).then(result => {
    process.stdout.write(`固定站点冒烟通过：${result.baseUrl} @ ${result.commit.slice(0, 12)}\n`);
  }).catch(error => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
