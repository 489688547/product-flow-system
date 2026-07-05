import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildConfigResponse,
  createDingCalendarEvent,
  createDingTodoTask,
  getDingAccessToken,
  getDingUserByCode,
  getDingUserDetail,
  filterOrgUsers,
  mapDingRole,
  publicUser,
  syncDingOrg
} from "./functions/api/dingtalk/_shared/dingtalk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DINGTALK_PORT || 8127);
let orgCache = null;

loadDotEnv();

function loadDotEnv() {
  const envPath = path.join(__dirname, ".env");
  if (!existsSync(envPath)) return;
  const lines = readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^["']|["']$/g, "");
  }
}

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", chunk => {
      body += chunk;
      if (body.length > 1024 * 1024) reject(new Error("request body too large"));
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

async function handleDingLogin(req, res) {
  try {
    const body = await readBody(req);
    const authCode = body.authCode || body.code;
    if (!authCode) {
      json(res, 400, { message: "缺少钉钉免登授权码 authCode" });
      return;
    }
    const accessToken = await getDingAccessToken(process.env);
    const basic = await getDingUserByCode(accessToken, authCode);
    const detail = await getDingUserDetail(accessToken, basic.userid);
    const user = publicUser(basic, detail);
    const role = mapDingRole({ ...basic, ...detail });
    json(res, 200, {
      role,
      user,
      org: { corpId: body.corpId || "", deptIds: user.deptIds, roles: user.roles }
    });
  } catch (error) {
    json(res, error.status || 500, {
      message: error.message || "钉钉登录失败",
      detail: error.detail || undefined
    });
  }
}

async function syncOrgCache() {
  const accessToken = await getDingAccessToken(process.env);
  orgCache = await syncDingOrg(accessToken, fetch, new Date(), {
    rootDeptId: process.env.DINGTALK_ROOT_DEPT_ID || 1
  });
  return orgCache;
}

async function handleDingOrgSync(req, res) {
  try {
    const org = await syncOrgCache();
    json(res, 200, { synced: true, org });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉组织架构同步失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingOrgUsers(req, res, url) {
  try {
    if (!orgCache || Date.now() > Date.parse(orgCache.expiresAt || 0)) await syncOrgCache();
    const query = url.searchParams.get("q") || "";
    const limit = Number(url.searchParams.get("limit") || 20);
    json(res, 200, { users: filterOrgUsers(orgCache, query, limit), syncedAt: orgCache.syncedAt });
  } catch (error) {
    json(res, error.status || 500, {
      users: [],
      message: error.message || "钉钉同事搜索失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingTodoCreate(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const todo = await createDingTodoTask(accessToken, body);
    json(res, 200, { synced: true, todo });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉待办同步失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingCalendarCreate(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const event = await createDingCalendarEvent(accessToken, body);
    json(res, 200, { synced: true, event });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉会议同步失败",
      detail: error.detail || undefined
    });
  }
}

function handleDingOrgStatus(res) {
  json(res, 200, {
    configured: buildConfigResponse(process.env, "").configured,
    cached: !!orgCache,
    syncedAt: orgCache?.syncedAt || "",
    expiresAt: orgCache?.expiresAt || ""
  });
}

async function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const filePath = path.normalize(path.join(__dirname, pathname));
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  try {
    const body = await readFile(filePath);
    const ext = path.extname(filePath);
    const type = {
      ".html": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".json": "application/json; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".webp": "image/webp"
    }[ext] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(body);
  } catch (error) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    json(res, 200, {});
    return;
  }
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === "/api/dingtalk/config") {
    json(res, 200, buildConfigResponse(process.env, url.origin));
    return;
  }
  if (url.pathname === "/api/dingtalk/login" && req.method === "POST") {
    await handleDingLogin(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/org/status" && req.method === "GET") {
    handleDingOrgStatus(res);
    return;
  }
  if (url.pathname === "/api/dingtalk/org/sync" && ["GET", "POST"].includes(req.method)) {
    await handleDingOrgSync(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/org/users" && req.method === "GET") {
    await handleDingOrgUsers(req, res, url);
    return;
  }
  if (url.pathname === "/api/dingtalk/todo/create" && req.method === "POST") {
    await handleDingTodoCreate(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/calendar/create" && req.method === "POST") {
    await handleDingCalendarCreate(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Product flow DingTalk server: http://127.0.0.1:${PORT}/`);
});
