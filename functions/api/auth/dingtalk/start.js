import { jsonResponse, resolveDingCredentials } from "../../dingtalk/_shared/dingtalk.js";

const PRODUCTION_ORIGIN = "https://product-flow-system.pages.dev";

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

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const requestUrl = new URL(request.url);
  if (
    requestUrl.hostname.endsWith(".product-flow-system.pages.dev")
    && requestUrl.origin !== PRODUCTION_ORIGIN
  ) {
    const productionStart = new URL("/api/auth/dingtalk/start", PRODUCTION_ORIGIN);
    const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
    if (returnTo) productionStart.searchParams.set("returnTo", returnTo);
    return new Response(null, {
      status: 302,
      headers: {
        location: productionStart.toString(),
        "cache-control": "no-store"
      }
    });
  }
  const { appKey, missing } = await resolveDingCredentials(env);
  if (missing.length) return jsonResponse({ message: `缺少钉钉应用配置：${missing.join("、")}` }, 501);

  const origin = requestUrl.origin;
  const returnTo = safeReturnTo(requestUrl.searchParams.get("returnTo"));
  const state = randomState();
  const authorize = new URL("https://login.dingtalk.com/oauth2/auth");
  authorize.searchParams.set("redirect_uri", `${origin}/api/auth/dingtalk/callback`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", appKey);
  authorize.searchParams.set("scope", "openid");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "consent");

  const response = new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      "cache-control": "no-store"
    }
  });
  response.headers.append("set-cookie", oauthStateCookie(state));
  if (returnTo) response.headers.append("set-cookie", `pfs_oauth_return=${encodeURIComponent(returnTo)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  return response;
}
