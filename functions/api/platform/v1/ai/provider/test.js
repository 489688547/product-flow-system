import { jsonResponse, optionsResponse } from "../../../../dingtalk/_shared/dingtalk.js";
import { canAccessCompanyPlatform } from "../../../../../../src/domain/permissions.js";
import { normalizeAiProvider } from "../../../../../../src/domain/aiAssistant.js";
import { writeDataCenterState } from "../../../../data-center/_shared/storage.js";
import { testProviderConnection } from "../_shared/responses-adapter.js";
import { aiError, loadAiConfiguration } from "../_shared/http.js";

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (request.method !== "POST") return aiError("Method not allowed", 405, "AI_METHOD_NOT_ALLOWED");
  if (!data.session) return aiError("请先使用钉钉登录。", 401, "AI_SESSION_REQUIRED");
  if (!canAccessCompanyPlatform(data.session) || data.session.role === "readonly") {
    return aiError("仅总经办可测试 AI 模型服务。", 403, "AI_PROVIDER_TEST_DENIED");
  }
  try {
    const loaded = await loadAiConfiguration(env);
    const result = await testProviderConnection({
      config: loaded.provider,
      fetchImpl: env.AI_PROVIDER_FETCH || fetch
    });
    const next = normalizeAiProvider({
      ...loaded.stored.state.aiProviders[0],
      lastCheckedAt: result.checkedAt,
      lastLatencyMs: result.latencyMs,
      lastStatusCode: result.statusCode
    });
    await writeDataCenterState(
      loaded.db,
      { ...loaded.stored.state, aiProviders: [next] },
      String(data.session.name || data.session.userId || "unknown").slice(0, 120)
    );
    return jsonResponse({ ...result, requestId: requestId() }, result.connected ? 200 : result.statusCode === 429 ? 429 : 502);
  } catch (error) {
    return aiError(error.message || "AI 模型服务测试失败。", error.status || 500, error.code || "AI_PROVIDER_TEST_FAILED", Boolean(error.retryable));
  }
}
