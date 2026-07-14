import {
  getDingEmbeddedIdentity,
  jsonResponse,
  optionsResponse
} from "../../dingtalk/_shared/dingtalk.js";
import { createSession } from "../_shared/session.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    const identity = await getDingEmbeddedIdentity(body.authCode || body.code, body.corpId || "", env);
    const created = await createSession(identity, "embedded", env);
    const response = jsonResponse({
      authenticated: true,
      user: created.session
    });
    response.headers.append("set-cookie", created.cookie);
    return response;
  } catch (error) {
    return jsonResponse({ message: error.message || "钉钉免登失败。" }, error.status || 500);
  }
}
