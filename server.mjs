import http from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
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
  listDingCalendarEvents,
  mapDingRole,
  publicUser,
  queryDingDocTextFromUrl,
  queryDingMeetingMinutesText,
  syncDingTodoTask,
  syncDingOrg
} from "./functions/api/dingtalk/_shared/dingtalk.js";
import {
  callKuaimai,
  kuaimaiConfigFromEnv,
  pullKuaimaiDay,
  refreshKuaimaiSession
} from "./functions/api/kuaimai/_shared/kuaimai.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DINGTALK_PORT || 8127);
const LOCAL_DATA_DIR = path.join(__dirname, ".local-data");
const LOCAL_STATE_PATH = path.join(LOCAL_DATA_DIR, "product-flow-state.json");
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

async function readLocalCompanyState() {
  try {
    const raw = await readFile(LOCAL_STATE_PATH, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function validateCompanyState(state) {
  const requiredArrays = ["demands", "products", "tasks", "deliverables", "reviews", "feedbackIssues"];
  if (!state || typeof state !== "object" || Array.isArray(state)) return "缺少有效的产品流程状态数据。";
  const missing = requiredArrays.filter(key => !Array.isArray(state[key]));
  return missing.length ? `状态数据缺少必要列表：${missing.join("、")}` : "";
}

async function handleKuaimaiStatus(res) {
  const config = kuaimaiConfigFromEnv(process.env);
  if (!config.ready) {
    json(res, 200, { connected: false, configured: false, message: "缺少快麦API配置（.env 里的 KUAIMAI_* 变量）。" });
    return;
  }
  try {
    const payload = await callKuaimai("open.system.time.get", {}, config);
    json(res, 200, { connected: true, configured: true, serverTime: payload.time || payload.systemTime || payload.date || "", traceId: payload.trace_id || "" });
  } catch (error) {
    json(res, 200, { connected: false, configured: true, message: error.message || "快麦接口连接失败。" });
  }
}

async function handleKuaimaiRefresh(res) {
  const config = kuaimaiConfigFromEnv(process.env);
  if (!config.ready || !config.refreshToken) {
    json(res, 400, { refreshed: false, message: "缺少快麦API配置或refreshToken。" });
    return;
  }
  try {
    const session = await refreshKuaimaiSession(config);
    json(res, 200, { refreshed: true, expiresIn: session?.expiresIn ?? null, refreshedAt: new Date().toISOString() });
  } catch (error) {
    const rateLimited = /限流|频繁|一小时|too many/i.test(error.message || "");
    json(res, rateLimited ? 200 : 502, { refreshed: false, rateLimited, message: error.message || "刷新会话失败。" });
  }
}

async function handleKuaimaiPull(res, url) {
  const config = kuaimaiConfigFromEnv(process.env);
  if (!config.ready) {
    json(res, 400, { message: "缺少快麦API配置。" });
    return;
  }
  const date = String(url.searchParams.get("date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    json(res, 400, { message: "缺少要同步的日期参数（YYYY-MM-DD）。" });
    return;
  }
  const pageNo = Math.max(1, Number(url.searchParams.get("pageNo")) || 1);
  try {
    const result = await pullKuaimaiDay(config, { date, pageNo, maxPages: 8 });
    json(res, 200, { synced: true, ...result });
  } catch (error) {
    json(res, 502, { synced: false, message: error.message || "快麦订单拉取失败。" });
  }
}

async function handleState(req, res) {
  try {
    if (req.method === "GET") {
      const stored = await readLocalCompanyState();
      json(res, 200, stored ? { synced: true, ...stored } : { synced: false, state: null });
      return;
    }
    if (req.method !== "POST") {
      json(res, 405, { message: "Method not allowed" });
      return;
    }
    const body = await readBody(req);
    const message = validateCompanyState(body.state);
    if (message) {
      json(res, 400, { synced: false, message });
      return;
    }
    const updatedAt = new Date().toISOString();
    const payload = {
      state: body.state,
      version: String(body.state.version || "unknown"),
      updatedAt,
      updatedBy: String(body.updatedBy || "").slice(0, 80)
    };
    await mkdir(LOCAL_DATA_DIR, { recursive: true });
    await writeFile(LOCAL_STATE_PATH, JSON.stringify(payload, null, 2));
    json(res, 200, { synced: true, version: payload.version, updatedAt });
  } catch (error) {
    json(res, 500, { synced: false, message: error.message || "公司共享数据同步失败。" });
  }
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

async function handleDingTodoSync(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const todo = await syncDingTodoTask(accessToken, body);
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

async function handleDingCalendarEvents(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const result = await listDingCalendarEvents(accessToken, body);
    json(res, 200, { synced: true, ...result });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉日历会议查询失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingMeetingMinutes(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const result = await queryDingMeetingMinutesText(accessToken, body);
    json(res, 200, { synced: true, text: result.text, raw: result.raw });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉会议纪要同步失败",
      detail: error.detail || undefined
    });
  }
}

async function handleDingDocRead(req, res) {
  try {
    const body = await readBody(req);
    const accessToken = await getDingAccessToken(process.env);
    const result = await queryDingDocTextFromUrl(accessToken, {
      ...body,
      operatorUnionId: body.operatorUnionId || body.unionId || process.env.DINGTALK_OPERATOR_UNION_ID || process.env.DINGTALK_OPERATOR_ID || ""
    });
    json(res, 200, {
      synced: true,
      title: result.title,
      docKey: result.docKey,
      docUrl: result.docUrl,
      text: result.text
    });
  } catch (error) {
    json(res, error.status || 500, {
      synced: false,
      message: error.message || "钉钉文档读取失败",
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
  if (url.pathname === "/api/state") {
    await handleState(req, res);
    return;
  }
  if (url.pathname === "/api/sales") {
    json(res, 501, { synced: false, message: "本地测试模式没有 D1 数据库，销售数据将保存在浏览器本地。" });
    return;
  }
  if (url.pathname === "/api/kuaimai/status" && req.method === "GET") {
    await handleKuaimaiStatus(res);
    return;
  }
  if (url.pathname === "/api/kuaimai/refresh" && req.method === "POST") {
    await handleKuaimaiRefresh(res);
    return;
  }
  if (url.pathname === "/api/kuaimai/pull" && req.method === "GET") {
    await handleKuaimaiPull(res, url);
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
  if (url.pathname === "/api/dingtalk/todo/sync" && req.method === "POST") {
    await handleDingTodoSync(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/calendar/create" && req.method === "POST") {
    await handleDingCalendarCreate(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/calendar/events" && req.method === "POST") {
    await handleDingCalendarEvents(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/meeting/minutes" && req.method === "POST") {
    await handleDingMeetingMinutes(req, res);
    return;
  }
  if (url.pathname === "/api/dingtalk/doc/read" && req.method === "POST") {
    await handleDingDocRead(req, res);
    return;
  }
  await serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Product flow DingTalk server: http://127.0.0.1:${PORT}/`);
});
