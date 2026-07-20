import { jsonResponse, optionsResponse } from "../../../dingtalk/_shared/dingtalk.js";
import { publicProviderStatus } from "./_shared/provider-config.js";
import { resolveAiDataAccess } from "./_shared/data-policy.js";
import { aiError, loadAiConfiguration } from "./_shared/http.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "GET") return aiError("Method not allowed", 405, "AI_METHOD_NOT_ALLOWED");
  if (!data.session) return aiError("请先使用钉钉登录。", 401, "AI_SESSION_REQUIRED");
  if (env.AI_ASSISTANT_ENABLED !== "1") {
    return jsonResponse({ enabled: false, ready: false, provider: null, allowedDomains: [], blockedDomains: [] });
  }
  try {
    const { stored, provider } = await loadAiConfiguration(env);
    const access = resolveAiDataAccess({
      session: data.session,
      policies: stored.state.aiDataPolicies,
      providerId: provider.providerId
    });
    return jsonResponse({
      enabled: true,
      ready: provider.enabled && provider.secretConfigured,
      provider: publicProviderStatus(provider),
      allowedDomains: access.allowed,
      blockedDomains: access.blocked.filter(item => item.reason === "provider_transfer").map(item => item.domainId)
    });
  } catch (error) {
    return aiError(error.message || "AI 总助状态加载失败。", error.status || 500, error.code || "AI_STATUS_FAILED", Boolean(error.retryable));
  }
}
