import {
  getDingAccessToken,
  jsonResponse,
  optionsResponse,
  queryDingMeetingMinutesText
} from "../_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = await getDingAccessToken(env);
    const result = await queryDingMeetingMinutesText(accessToken, body);
    return jsonResponse({ synced: true, text: result.text, raw: result.raw });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "钉钉会议纪要同步失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
