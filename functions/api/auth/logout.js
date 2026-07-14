import { jsonResponse, optionsResponse } from "../dingtalk/_shared/dingtalk.js";
import { clearSessionCookie, revokeSession } from "./_shared/session.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  await revokeSession(request, env);
  const response = jsonResponse({ authenticated: false });
  response.headers.append("set-cookie", clearSessionCookie());
  return response;
}
