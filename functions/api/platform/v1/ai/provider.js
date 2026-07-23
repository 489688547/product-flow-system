import { jsonResponse, optionsResponse } from "../../../dingtalk/_shared/dingtalk.js";
import { canAccessCompanyPlatform } from "../../../../../src/domain/permissions.js";
import { normalizeAiProvider } from "../../../../../src/domain/aiAssistant.js";
import { writeDataCenterState } from "../../../data-center/_shared/storage.js";
import { publicProviderStatus } from "./_shared/provider-config.js";
import { aiError, loadAiConfiguration } from "./_shared/http.js";

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "PUT"].includes(request.method)) return aiError("Method not allowed", 405, "AI_METHOD_NOT_ALLOWED");
  if (!data.session) return aiError("请先使用钉钉登录。", 401, "AI_SESSION_REQUIRED");
  try {
    const loaded = await loadAiConfiguration(env, data);
    const canManage = canAccessCompanyPlatform(data.session) && data.session.role !== "readonly";
    if (request.method === "GET") {
      return jsonResponse({
        provider: publicProviderStatus(loaded.provider),
        policies: canAccessCompanyPlatform(data.session) ? loaded.stored.state.aiDataPolicies : [],
        canManage
      });
    }
    if (!canManage) return aiError("仅总经办可维护 AI 模型服务。", 403, "AI_PROVIDER_MANAGE_DENIED");
    const body = await request.json().catch(() => ({}));
    const next = normalizeAiProvider({
      ...loaded.stored.state.aiProviders[0],
      providerId: body.providerId,
      model: body.model,
      reasoningEffort: body.reasoningEffort,
      enabled: body.enabled
    });
    if (next.enabled && !loaded.provider.secretConfigured) {
      return aiError("模型服务尚未配置新的服务端密钥。", 400, "AI_PROVIDER_SECRET_MISSING");
    }
    await writeDataCenterState(
      loaded.db,
      { ...loaded.stored.state, aiProviders: [next] },
      String(data.session.name || data.session.userId || "unknown").slice(0, 120)
    );
    return jsonResponse({
      provider: publicProviderStatus({ ...loaded.provider, ...next }),
      policies: loaded.stored.state.aiDataPolicies,
      canManage: true
    });
  } catch (error) {
    return aiError(error.message || "AI 模型服务保存失败。", error.status || 500, error.code || "AI_PROVIDER_UPDATE_FAILED", Boolean(error.retryable));
  }
}
