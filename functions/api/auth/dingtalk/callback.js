import {
  getDingBrowserIdentity,
  jsonResponse
} from "../../dingtalk/_shared/dingtalk.js";
import {
  authSessionInternals,
  createSession
} from "../_shared/session.js";

const CLEAR_OAUTH_COOKIE = "pfs_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0";

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
  if (!code || !state || !expectedState || state !== expectedState) {
    return errorResponse("登录校验已失效，请重新发起钉钉扫码登录。", 400);
  }

  try {
    const identity = await getDingBrowserIdentity(code, env);
    const created = await createSession(identity, "browser", env);
    const response = new Response(null, {
      status: 302,
      headers: {
        location: `${url.origin}/?login=success`,
        "cache-control": "no-store"
      }
    });
    response.headers.append("set-cookie", created.cookie);
    response.headers.append("set-cookie", CLEAR_OAUTH_COOKIE);
    return response;
  } catch (error) {
    return errorResponse(error.message || "钉钉扫码登录失败。", error.status || 500);
  }
}
