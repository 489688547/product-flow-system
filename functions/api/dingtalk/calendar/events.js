import {
  getDingAccessToken,
  jsonResponse,
  listDingCalendarEvents,
  optionsResponse
} from "../_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = await getDingAccessToken(env);
    const result = await listDingCalendarEvents(accessToken, body);
    return jsonResponse({ synced: true, ...result });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "钉钉日历会议查询失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
