import {
  getDingAccessToken,
  jsonResponse,
  optionsResponse,
  queryDingDocTextFromUrl
} from "../_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);

  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = await getDingAccessToken(env);
    const result = await queryDingDocTextFromUrl(accessToken, {
      ...body,
      operatorUnionId: body.operatorUnionId || body.unionId || env.DINGTALK_OPERATOR_UNION_ID || env.DINGTALK_OPERATOR_ID || ""
    });
    return jsonResponse({
      synced: true,
      title: result.title,
      docKey: result.docKey,
      docUrl: result.docUrl,
      text: result.text
    });
  } catch (error) {
    return jsonResponse({
      synced: false,
      message: error.message || "钉钉文档读取失败",
      detail: error.detail || undefined
    }, error.status || 500);
  }
}
