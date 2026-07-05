import {
  filterOrgUsers,
  getDingAccessToken,
  jsonResponse,
  optionsResponse,
  syncDingOrg
} from "../_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get("q") || "";
    const limit = Number(url.searchParams.get("limit") || 20);
    const accessToken = await getDingAccessToken(env);
    const org = await syncDingOrg(accessToken, fetch, new Date(), {
      rootDeptId: env.DINGTALK_ROOT_DEPT_ID || 1
    });
    return jsonResponse({ users: filterOrgUsers(org, query, limit), syncedAt: org.syncedAt });
  } catch (error) {
    return jsonResponse({
      users: [],
      message: error.message || "钉钉同事搜索失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
