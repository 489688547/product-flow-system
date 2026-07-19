import {
  buildResolvedConfigResponse,
  jsonResponse,
  optionsResponse
} from "../_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);

  const origin = new URL(request.url).origin;
  return jsonResponse({
    configured: (await buildResolvedConfigResponse(env, origin)).configured,
    cached: false,
    message: "Cloudflare Pages 函数不保存持久组织缓存，前端会在启动时同步并缓存到本地。"
  });
}
