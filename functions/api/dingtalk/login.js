import {
  jsonResponse,
  loginWithDingTalk,
  optionsResponse
} from "./_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const payload = await loginWithDingTalk({
      authCode: body.authCode || body.code,
      corpId: body.corpId || ""
    }, env);
    return jsonResponse(payload);
  } catch (error) {
    return jsonResponse({
      message: error.message || "钉钉登录失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
