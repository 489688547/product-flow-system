import {
  getDingBrowserLogin,
  jsonResponse
} from "../../dingtalk/_shared/dingtalk.js";
import { saveDingUserToken } from "./ding-user-token.js";
import {
  authSessionInternals,
  createSession
} from "./session.js";
import { controlDatabase } from "../../platform/_shared/dataEnvironment.js";

const CLEAR_OAUTH_COOKIE = "pfs_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";
const CLEAR_RETURN_COOKIE = "pfs_oauth_return=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

function safeReturnTo(value = "") {
  const path = String(value || "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "";
}

function errorResponse(message, status, code = "") {
  const response = jsonResponse({
    message,
    ...(code ? { error: { code, retryable: status >= 500 } } : {})
  }, status);
  response.headers.set("cache-control", "no-store");
  response.headers.append("set-cookie", CLEAR_OAUTH_COOKIE);
  return response;
}

function publicAppOrigin(env, fallbackOrigin) {
  const raw = String(env.PFS_PUBLIC_APP_ORIGIN || "").trim();
  if (!raw) return fallbackOrigin;
  let url;
  try {
    url = new URL(raw);
  } catch {
    url = null;
  }
  if (!url || url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash) {
    const error = new Error("PFS_PUBLIC_APP_ORIGIN must be an HTTPS origin");
    error.code = "BROWSER_ORIGIN_INVALID";
    throw error;
  }
  return url.origin;
}

export async function finishBrowserOauth({ request, env, mode = "redirect" }) {
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const url = new URL(request.url);
  const code = url.searchParams.get("code") || url.searchParams.get("authCode") || "";
  const state = url.searchParams.get("state") || "";
  const expectedState = authSessionInternals.cookieValue(request, "pfs_oauth_state");
  const returnTo = safeReturnTo(authSessionInternals.cookieValue(request, "pfs_oauth_return"));
  if (!code || !state || !expectedState || state !== expectedState) {
    return errorResponse("登录校验已失效，请重新发起钉钉扫码登录。", 400);
  }

  let redirectOrigin;
  try {
    redirectOrigin = publicAppOrigin(env, url.origin);
  } catch (error) {
    return errorResponse(error.message, 503, error.code);
  }

  try {
    const { identity, userToken } = await getDingBrowserLogin(code, env);
    const created = await createSession(identity, "browser", env);
    await saveDingUserToken(controlDatabase(env), created.sessionIdHash, userToken, env);
    const redirectTo = returnTo ? `${redirectOrigin}${returnTo}` : `${redirectOrigin}/?login=success`;
    const response = mode === "json"
      ? jsonResponse({ authenticated: true, redirectTo })
      : new Response(null, {
        status: 302,
        headers: {
          location: redirectTo,
          "cache-control": "no-store"
        }
      });
    response.headers.set("cache-control", "no-store");
    response.headers.append("set-cookie", created.cookie);
    response.headers.append("set-cookie", CLEAR_OAUTH_COOKIE);
    response.headers.append("set-cookie", CLEAR_RETURN_COOKIE);
    return response;
  } catch (error) {
    return errorResponse(error.message || "钉钉扫码登录失败。", error.status || 500);
  }
}
