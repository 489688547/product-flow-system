import { jsonResponse } from "../dingtalk/_shared/dingtalk.js";
import { readSession } from "./_shared/session.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const session = data.session || await readSession(request, env);
  if (!session) return jsonResponse({ authenticated: false, user: null }, 401);
  return jsonResponse({ authenticated: true, user: session });
}
