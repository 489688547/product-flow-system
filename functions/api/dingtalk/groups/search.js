import { getValidDingUserToken } from "../../auth/_shared/ding-user-token.js";
import { jsonResponse, optionsResponse } from "../_shared/dingtalk.js";
import { searchDingGroups } from "../_shared/groups.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const url = new URL(request.url);
  const query = String(url.searchParams.get("q") || "").trim();
  if (!query) return jsonResponse({ groups: [], nextCursor: "", hasMore: false });
  try {
    const token = await getValidDingUserToken(request, env);
    return jsonResponse(await searchDingGroups(token, query, url.searchParams.get("cursor") || "0"));
  } catch (error) {
    return jsonResponse({ code: error.code || "DING_GROUP_SEARCH_FAILED", message: error.message }, error.status || 500);
  }
}
