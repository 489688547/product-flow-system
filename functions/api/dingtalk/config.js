import {
  buildConfigResponse,
  jsonResponse,
  optionsResponse
} from "./_shared/dingtalk.js";

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return jsonResponse({ message: "Method not allowed" }, 405);

  const origin = new URL(request.url).origin;
  return jsonResponse(buildConfigResponse(env, origin));
}
