import { kuaimaiConfigFromEnv, pullKuaimaiDay } from "./_shared/kuaimai.js";

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*" }
  });
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);
  const config = kuaimaiConfigFromEnv(env);
  if (!config.ready) return jsonResponse({ message: "缺少快麦API配置。" }, 400);
  const url = new URL(request.url);
  const date = String(url.searchParams.get("date") || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return jsonResponse({ message: "缺少要同步的日期参数（YYYY-MM-DD）。" }, 400);
  const pageNo = Math.max(1, Number(url.searchParams.get("pageNo")) || 1);
  try {
    const result = await pullKuaimaiDay(config, { date, pageNo, maxPages: 8 });
    return jsonResponse({ synced: true, ...result });
  } catch (error) {
    return jsonResponse({ synced: false, message: error.message || "快麦订单拉取失败。", code: error.kuaimaiCode || "" }, 502);
  }
}
