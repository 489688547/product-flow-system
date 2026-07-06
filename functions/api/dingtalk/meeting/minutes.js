import {
  getDingAccessToken,
  getDingUserAccessToken,
  jsonResponse,
  optionsResponse,
  queryDingAiMinutesText,
  queryDingCloudMinutesForEvents,
  queryDingMeetingMinutesTextWithFallback
} from "../_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body.events)) {
      const accessToken = await getDingAccessToken(env);
      const events = await queryDingCloudMinutesForEvents(accessToken, body);
      return jsonResponse({
        synced: true,
        source: "cloudRecording",
        events
      });
    }
    if (body.authCode && (body.sourceType === "aiMinutes" || body.aiMinutesTaskUuid)) {
      const userToken = await getDingUserAccessToken(env, { authCode: body.authCode });
      const result = await queryDingAiMinutesText(userToken.accessToken, {
        taskUuid: body.aiMinutesTaskUuid || body.recordingId
      });
      return jsonResponse({
        synced: true,
        source: "aiMinutes",
        text: result.text,
        taskUuid: result.taskUuid,
        raw: result.raw
      });
    }
    const accessToken = await getDingAccessToken(env);
    const result = await queryDingMeetingMinutesTextWithFallback(accessToken, body);
    return jsonResponse({
      synced: true,
      text: result.text,
      raw: result.raw,
      resolvedConferenceId: result.resolvedConferenceId || undefined,
      scheduleConferenceId: result.scheduleConferenceId || undefined
    });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "钉钉会议纪要同步失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
