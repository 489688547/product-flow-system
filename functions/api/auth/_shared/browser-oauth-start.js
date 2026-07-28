const PRODUCTION_ORIGIN = "https://deshan-tiyes-system.pages.dev";
const DEVELOPMENT_ORIGIN = "https://deshan-tiyes-system-dev.pages.dev";
const LEGACY_PRODUCTION_ORIGIN = "https://product-flow-system.pages.dev";

function fixedPagesOrigin(requestUrl) {
  if (
    requestUrl.hostname.endsWith(".deshan-tiyes-system-dev.pages.dev")
    && requestUrl.origin !== DEVELOPMENT_ORIGIN
  ) {
    return DEVELOPMENT_ORIGIN;
  }
  if (
    requestUrl.hostname.endsWith(".deshan-tiyes-system.pages.dev")
    && requestUrl.origin !== PRODUCTION_ORIGIN
  ) {
    return PRODUCTION_ORIGIN;
  }
  if (
    requestUrl.hostname.endsWith(".product-flow-system.pages.dev")
    && requestUrl.origin !== LEGACY_PRODUCTION_ORIGIN
  ) {
    return LEGACY_PRODUCTION_ORIGIN;
  }
  return "";
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function credentials(env = {}) {
  const appKey = env.DINGTALK_APP_KEY || env.DINGTALK_CLIENT_ID || "";
  const appSecret = env.DINGTALK_APP_SECRET || env.DINGTALK_CLIENT_SECRET || "";
  const missing = [];
  if (!appKey) missing.push("DINGTALK_APP_KEY");
  if (!appSecret) missing.push("DINGTALK_APP_SECRET");
  return { appKey, missing };
}

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function oauthStateCookie(state) {
  return `pfs_oauth_state=${encodeURIComponent(state)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}

function safeReturnTo(value = "") {
  const path = String(value || "").trim();
  return path.startsWith("/") && !path.startsWith("//") ? path : "";
}

function appendCookies(response, state, returnTo) {
  response.headers.append("set-cookie", oauthStateCookie(state));
  if (returnTo) {
    response.headers.append(
      "set-cookie",
      `pfs_oauth_return=${encodeURIComponent(returnTo)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`
    );
  }
  return response;
}

export function createBrowserOauthStartResponse({ request, env, mode = "redirect" }) {
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const requestUrl = new URL(request.url);
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
  const fixedOrigin = fixedPagesOrigin(requestUrl);
  if (fixedOrigin) {
    const productionStart = new URL("/api/auth/dingtalk/start", fixedOrigin);
    if (returnTo) productionStart.searchParams.set("returnTo", returnTo);
    if (mode === "json") {
      return jsonResponse({ ready: true, authorizeUrl: productionStart.toString() });
    }
    return new Response(null, {
      status: 302,
      headers: {
        location: productionStart.toString(),
        "cache-control": "no-store"
      }
    });
  }

  const { appKey, missing } = credentials(env);
  if (missing.length) return jsonResponse({ message: `缺少钉钉应用配置：${missing.join("、")}` }, 501);

  const state = randomState();
  const authorize = new URL("https://login.dingtalk.com/oauth2/auth");
  authorize.searchParams.set("redirect_uri", `${requestUrl.origin}/api/auth/dingtalk/callback`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", appKey);
  authorize.searchParams.set("scope", "openid");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "consent");

  const response = mode === "json"
    ? jsonResponse({ ready: true, authorizeUrl: authorize.toString() })
    : new Response(null, {
      status: 302,
      headers: {
        location: authorize.toString(),
        "cache-control": "no-store"
      }
    });
  return appendCookies(response, state, returnTo);
}

export const browserOauthStartInternals = {
  safeReturnTo
};
