import { getValidDingUserToken } from "../../auth/_shared/ding-user-token.js";
import { jsonResponse, optionsResponse } from "../_shared/dingtalk.js";
import { listOwnedDingGroups } from "../_shared/groups.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  try {
    const token = await getValidDingUserToken(request, env);
    return jsonResponse(await listOwnedDingGroups(token));
  } catch (error) {
    return jsonResponse({ code: error.code || "DING_GROUP_LIST_FAILED", message: error.message }, error.status || 500);
  }
}
