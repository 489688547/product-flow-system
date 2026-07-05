import {
  createDingCalendarEvent,
  getDingAccessToken,
  jsonResponse,
  optionsResponse
} from "../_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = await getDingAccessToken(env);
    const event = await createDingCalendarEvent(accessToken, body);
    return jsonResponse({ synced: true, event });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "钉钉会议同步失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
