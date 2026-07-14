import { getDingCredentials, jsonResponse } from "../../dingtalk/_shared/dingtalk.js";

function randomState() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function oauthStateCookie(state) {
  return `pfs_oauth_state=${encodeURIComponent(state)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const { appKey, missing } = getDingCredentials(env);
  if (missing.length) return jsonResponse({ message: `缺少钉钉应用配置：${missing.join("、")}` }, 501);

  const origin = new URL(request.url).origin;
  const state = randomState();
  const authorize = new URL("https://login.dingtalk.com/oauth2/auth");
  authorize.searchParams.set("redirect_uri", `${origin}/api/auth/dingtalk/callback`);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("client_id", appKey);
  authorize.searchParams.set("scope", "openid");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("prompt", "consent");

  return new Response(null, {
    status: 302,
    headers: {
      location: authorize.toString(),
      "set-cookie": oauthStateCookie(state),
      "cache-control": "no-store"
    }
  });
}
