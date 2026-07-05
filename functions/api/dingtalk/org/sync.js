import {
  getDingAccessToken,
  jsonResponse,
  optionsResponse,
  syncDingOrg
} from "../_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const accessToken = await getDingAccessToken(env);
    const org = await syncDingOrg(accessToken, fetch, new Date(), {
      rootDeptId: env.DINGTALK_ROOT_DEPT_ID || 1
    });
    return jsonResponse({ synced: true, org });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "钉钉组织架构同步失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
