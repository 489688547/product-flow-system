import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { readSession } from "./auth/_shared/session.js";

const PUBLIC_PATHS = new Set([
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/dingtalk/start",
  "/api/auth/dingtalk/callback",
  "/api/auth/dingtalk/embedded",
  "/api/dingtalk/config",
  "/api/dingtalk/login"
]);

const LOCAL_LIVE_PREVIEW_SESSION = Object.freeze({
  corpId: "local-live-preview",
  userId: "local-live-preview",
  unionId: "local-live-preview",
  name: "周荣庆",
  role: "executive",
  department: "总经办",
  title: "总经理",
  loginMode: "local-live-d1-preview"
});

function localLivePreviewSession(request, env = {}) {
  if (env.LOCAL_LIVE_D1_PREVIEW !== "1") return null;
  const hostname = new URL(request.url).hostname;
  return ["localhost", "127.0.0.1", "::1"].includes(hostname) ? LOCAL_LIVE_PREVIEW_SESSION : null;
}

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return optionsResponse();
  const previewSession = localLivePreviewSession(context.request, context.env);
  if (previewSession) {
    if (context.request.method !== "GET") {
      return jsonResponse({ synced: false, message: "线上 D1 本地预览为只读模式，禁止写入。" }, 403);
    }
    context.data.session = previewSession;
    return context.next();
  }
  const path = new URL(context.request.url).pathname.replace(/\/$/, "") || "/";
  if (PUBLIC_PATHS.has(path)) return context.next();

  const session = await readSession(context.request, context.env);
  if (!session) {
    return jsonResponse({
      authenticated: false,
      message: "请先使用钉钉登录。"
    }, 401);
  }
  context.data.session = session;
  return context.next();
}
