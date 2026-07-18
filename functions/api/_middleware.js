import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { readSession } from "./auth/_shared/session.js";

const PUBLIC_PATHS = new Set([
  "/api/auth/session",
  "/api/auth/logout",
  "/api/auth/dingtalk/start",
  "/api/auth/dingtalk/callback",
  "/api/auth/dingtalk/embedded",
  "/api/dingtalk/config",
  "/api/dingtalk/login",
  "/api/platform/v1/production-write-session",
  "/api/platform/v1/production-data/state"
]);

export async function onRequest(context) {
  if (context.request.method === "OPTIONS") return optionsResponse();
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
