import {
  getDingAccessToken,
  getDingUserAccessToken,
  jsonResponse,
  optionsResponse,
  queryDingAiMinutesForEvents,
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
      let userToken = null;
      let aiMinutesError = "";
      let aiMinutesErrorDetail;
      if (body.authCode) {
        try {
          userToken = await getDingUserAccessToken(env, { authCode: body.authCode });
        } catch (error) {
          // The silent auth code may be stale or not exchangeable; fall back to cloud recording detection.
          aiMinutesError = `用户授权换取失败：${error.message || "未知错误"}`;
          aiMinutesErrorDetail = error.detail;
          userToken = null;
        }
      }
      if (userToken) {
        try {
          const aiEvents = await queryDingAiMinutesForEvents(userToken.accessToken, body);
          const unresolvedEvents = aiEvents.filter(event => event.minuteState === "empty" && event.conferenceId);
          if (unresolvedEvents.length) {
            try {
              const accessToken = await getDingAccessToken(env);
              const cloudEvents = await queryDingCloudMinutesForEvents(accessToken, {
                ...body,
                events: unresolvedEvents
              });
              const byConference = new Map(cloudEvents.map(event => [event.conferenceId, event]));
              const events = aiEvents.map(event => {
                const cloud = byConference.get(event.conferenceId);
                return cloud?.minuteState === "ready" || cloud?.minuteState === "permission" ? cloud : event;
              });
              return jsonResponse({
                synced: true,
                source: "aiMinutes",
                fallbackSource: "cloudRecording",
                events
              });
            } catch {
              // AI minutes are the primary signal here; keep their states if cloud fallback is unavailable.
            }
          }
          return jsonResponse({
            synced: true,
            source: "aiMinutes",
            events: aiEvents
          });
        } catch (error) {
          aiMinutesError = `AI 听记查询失败：${error.message || "未知错误"}`;
          aiMinutesErrorDetail = error.detail;
        }
      }
      const accessToken = await getDingAccessToken(env);
      const events = await queryDingCloudMinutesForEvents(accessToken, body);
      return jsonResponse({
        synced: true,
        source: "cloudRecording",
        aiMinutesError: aiMinutesError || undefined,
        aiMinutesErrorDetail: aiMinutesErrorDetail || undefined,
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
