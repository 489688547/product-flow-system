import { createBrowserOauthStartResponse } from "../_shared/browser-oauth-start.js";

export async function onRequest({ request, env }) {
  return createBrowserOauthStartResponse({ request, env, mode: "json" });
}
