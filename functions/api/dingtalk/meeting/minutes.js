import {
  getDingAccessToken,
  getDingUserAccessToken,
  jsonResponse,
  optionsResponse,
  queryDingAiMinutesForEvents,
  queryDingAiMinutesList,
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
      let cloudEvents = [];
      let cloudError = "";
      let cloudErrorDetail;
      const eventKey = event => event.clientKey || event.conferenceId || event.id || `${event.summary || event.title || ""}|${event.startTime || ""}`;
      try {
        const accessToken = await getDingAccessToken(env);
        cloudEvents = await queryDingCloudMinutesForEvents(accessToken, body);
      } catch (error) {
        cloudError = `会议 ID 查询失败：${error.message || "未知错误"}`;
        cloudErrorDetail = error.detail;
        cloudEvents = body.events.map(event => ({ ...event, minuteState: event.minuteState || "empty" }));
      }
      let events = cloudEvents.length ? cloudEvents : body.events.map(event => ({ ...event, minuteState: event.minuteState || "empty" }));
      const unresolvedEvents = events.filter(event => event.minuteState === "empty");
      if (unresolvedEvents.length && body.authCode) {
        try {
          userToken = await getDingUserAccessToken(env, { authCode: body.authCode });
          const aiEvents = await queryDingAiMinutesForEvents(userToken.accessToken, {
            ...body,
            events: unresolvedEvents
          });
          const byKey = new Map(aiEvents.map(event => [eventKey(event), event]));
          events = events.map(event => {
            const ai = byKey.get(eventKey(event));
            return ai?.minuteState === "ready" || ai?.minuteState === "found" || ai?.minuteState === "permission" ? ai : event;
          });
        } catch (error) {
          aiMinutesError = `AI 听记查询失败：${error.message || "未知错误"}`;
          aiMinutesErrorDetail = error.detail;
        }
      }
      return jsonResponse({
        synced: true,
        source: "cloudRecording",
        fallbackSource: body.authCode ? "aiMinutes" : undefined,
        cloudError: cloudError || undefined,
        cloudErrorDetail: cloudErrorDetail || undefined,
        aiMinutesError: aiMinutesError || undefined,
        aiMinutesErrorDetail: aiMinutesErrorDetail || undefined,
        events
      });
    }
    if (body.authCode && body.sourceType === "aiMinutesList") {
      const userToken = await getDingUserAccessToken(env, { authCode: body.authCode });
      const result = await queryDingAiMinutesList(userToken.accessToken, {
        keyword: body.keyword || "",
        maxResults: body.maxResults || 30
      });
      return jsonResponse({
        synced: true,
        source: "aiMinutesList",
        minutes: result.minutes,
        raw: result.raw
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
        posterUrl: result.posterUrl || "",
        posterUrls: result.posterUrls || [],
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
