import { getValidDingUserToken } from "../../../auth/_shared/ding-user-token.js";
import { jsonResponse, optionsResponse } from "../../_shared/dingtalk.js";
import {
  loadAllDingGroupMembers,
  resolveGroupMembers,
  searchDingContacts
} from "../../_shared/groups.js";

export async function onRequest({ request, env, data = {}, params = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const groupId = String(params.groupId || "").trim();
  if (!groupId) return jsonResponse({ message: "缺少钉钉群 ID。" }, 400);
  try {
    const token = await getValidDingUserToken(request, env);
    const rawMembers = await loadAllDingGroupMembers(token, groupId);
    const result = await resolveGroupMembers(rawMembers, {
      corpId: data.session?.corpId || "",
      db: env.PRODUCT_FLOW_DB,
      searchContact: name => searchDingContacts(token, name)
    });
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ code: error.code || "DING_GROUP_MEMBERS_FAILED", message: error.message }, error.status || 500);
  }
}
