import {
  getDingBrowserLogin,
  jsonResponse
} from "../../dingtalk/_shared/dingtalk.js";
import { saveDingUserToken } from "../_shared/ding-user-token.js";
import {
  authSessionInternals,
  createSession
} from "../_shared/session.js";

const CLEAR_OAUTH_COOKIE = "pfs_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
const CLEAR_RETURN_COOKIE = "pfs_oauth_return=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

function safeReturnTo(value = "") {
  const path = String(value || "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "";
}

function errorResponse(message, status) {
  const response = jsonResponse({ message }, status);
  response.headers.append("set-cookie", CLEAR_OAUTH_COOKIE);
  return response;
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || url.searchParams.get("authCode") || "";
  const state = url.searchParams.get("state") || "";
  const expectedState = authSessionInternals.cookieValue(request, "pfs_oauth_state");
  const returnTo = safeReturnTo(authSessionInternals.cookieValue(request, "pfs_oauth_return"));
  if (!code || !state || !expectedState || state !== expectedState) {
    return errorResponse("登录校验已失效，请重新发起钉钉扫码登录。", 400);
  }

  try {
    const { identity, userToken } = await getDingBrowserLogin(code, env);
    const created = await createSession(identity, "browser", env);
    await saveDingUserToken(env.PRODUCT_FLOW_DB, created.sessionIdHash, userToken, env);
    const response = new Response(null, {
      status: 302,
      headers: {
        location: returnTo ? `${url.origin}${returnTo}` : `${url.origin}/?login=success`,
        "cache-control": "no-store"
      }
    });
    response.headers.append("set-cookie", created.cookie);
    response.headers.append("set-cookie", CLEAR_OAUTH_COOKIE);
    response.headers.append("set-cookie", CLEAR_RETURN_COOKIE);
    return response;
  } catch (error) {
    return errorResponse(error.message || "钉钉扫码登录失败。", error.status || 500);
  }
}
