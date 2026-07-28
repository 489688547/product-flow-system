import { finishBrowserOauth } from "../_shared/browser-oauth-finish.js";

export async function onRequest({ request, env }) {
  return finishBrowserOauth({ request, env, mode: "json" });
}
