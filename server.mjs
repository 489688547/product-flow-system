import http from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildConfigResponse,
  getDingAccessToken,
  getDingUserByCode,
  getDingUserDetail,
  mapDingRole,
  publicUser
} from "./functions/api/dingtalk/_shared/dingtalk.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.DINGTALK_PORT || 8127);

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
  await serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`Product flow DingTalk server: http://127.0.0.1:${PORT}/`);
});
