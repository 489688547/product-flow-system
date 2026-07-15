import { kuaimaiConfigFromEnv, refreshKuaimaiSession } from "./_shared/kuaimai.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return jsonResponse({ message: "Method not allowed" }, 405);
  const config = kuaimaiConfigFromEnv(env);
  if (!config.ready || !config.refreshToken) {
    return jsonResponse({ refreshed: false, message: "缺少快麦API配置或refreshToken。" }, 400);
  }
  try {
    const session = await refreshKuaimaiSession(config);
    return jsonResponse({ refreshed: true, expiresIn: session?.expiresIn ?? null, refreshedAt: new Date().toISOString() });
  } catch (error) {
    // 平台限制每小时最多刷新一次，限流错误对调用方来说等同于"最近已刷新过"。
    const rateLimited = /限流|频繁|一小时|too many/i.test(error.message || "");
    return jsonResponse({ refreshed: false, rateLimited, message: error.message || "刷新会话失败。" }, rateLimited ? 200 : 502);
  }
}
