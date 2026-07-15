import { callKuaimai, kuaimaiConfigFromEnv } from "./_shared/kuaimai.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const config = kuaimaiConfigFromEnv(env);
  if (!config.ready) {
    return jsonResponse({ connected: false, configured: false, message: "缺少快麦API配置（KUAIMAI_APP_KEY / KUAIMAI_APP_SECRET / KUAIMAI_ACCESS_TOKEN）。" });
  }
  try {
    const payload = await callKuaimai("open.system.time.get", {}, config);
    return jsonResponse({ connected: true, configured: true, serverTime: payload.time || payload.systemTime || payload.date || "", traceId: payload.trace_id || "" });
  } catch (error) {
    return jsonResponse({ connected: false, configured: true, message: error.message || "快麦接口连接失败。", code: error.kuaimaiCode || "" });
  }
}
