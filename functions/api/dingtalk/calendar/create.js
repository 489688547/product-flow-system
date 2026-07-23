import {
  createDingCalendarEvent,
  getDingAccessToken,
  jsonResponse,
  optionsResponse
} from "../_shared/dingtalk.js";
import { shouldSimulateExternalAction } from "../../platform/_shared/externalActionMode.js";
import {
  auditDisplayExternalAction,
  simulateDingCalendarEvent
} from "../../platform/_shared/displayExternalActionAdapter.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    if (shouldSimulateExternalAction(data)) {
      const event = simulateDingCalendarEvent(body);
      await auditDisplayExternalAction({ env, data, kind: "dingtalk_calendar_create", resultId: event.id });
      return jsonResponse({ synced: true, event });
    }
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
