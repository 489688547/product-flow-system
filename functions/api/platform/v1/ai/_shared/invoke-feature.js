import { writeAiAudit } from "./audit.js";
import { getAiFeatureDefinition } from "./feature-registry.js";
import { loadAiConfiguration } from "./http.js";
import { collectProviderResponse } from "./responses-adapter.js";

const MAX_SYSTEM_CHARS = 4_000;
const MAX_USER_INPUT_CHARS = 20_000;

function requestId() {
  return globalThis.crypto?.randomUUID?.() || `req_${Date.now().toString(36)}`;
}

function featureInput(value, maxLength, label) {
  const text = String(value || "").trim();
  if (!text || text.length > maxLength) {
    throw Object.assign(new Error(`${label}格式无效。`), {
      code: "AI_FEATURE_INPUT_INVALID",
      status: 400,
      retryable: false
    });
  }
  return text;
}

function readinessError(code, message) {
  return Object.assign(new Error(message), { code, status: 503, retryable: false });
}

function safeProviderError(error) {
  if (String(error?.code || "").startsWith("AI_")) return error;
  return Object.assign(new Error("模型服务暂不可用。"), {
    code: "AI_PROVIDER_UNAVAILABLE",
    status: 502,
    retryable: true
  });
}

export async function invokeAiFeature({
  env = {},
  session = {},
  appId,
  featureId,
  systemInstruction,
  userInput,
  timeoutMs = 20_000,
  fallback
} = {}) {
  const feature = getAiFeatureDefinition(appId, featureId);
  const system = featureInput(systemInstruction, MAX_SYSTEM_CHARS, "AI 系统指令");
  const input = featureInput(userInput, MAX_USER_INPUT_CHARS, "AI 功能输入");
  const id = requestId();
  const started = Date.now();
  const userId = String(session.userId || session.unionId || session.name || "unknown").slice(0, 120);
  let loaded;
  let providerCalled = false;
  try {
    if (env.AI_ASSISTANT_ENABLED !== "1") throw readinessError("AI_DISABLED", "公司 AI 服务尚未启用。");
    loaded = await loadAiConfiguration(env);
    if (!loaded.provider.enabled || !loaded.provider.secretConfigured) {
      throw readinessError("AI_PROVIDER_NOT_READY", "模型服务未就绪。");
    }
    providerCalled = true;
    const generated = await collectProviderResponse({
      config: loaded.provider,
      input: [{ role: "system", content: system }, { role: "user", content: input }],
      fetchImpl: env.AI_PROVIDER_FETCH || fetch,
      timeoutMs
    });
    await writeAiAudit(loaded.db, {
      requestId: id,
      userId,
      department: session.department,
      providerId: loaded.provider.providerId,
      model: loaded.provider.model,
      inputTokens: generated.usage.inputTokens,
      outputTokens: generated.usage.outputTokens,
      latencyMs: Date.now() - started,
      resultCode: "AI_COMPLETED",
      completed: true,
      appId: feature.appId,
      featureId: feature.featureId,
      executionMode: "model",
      providerCalled: true
    });
    return {
      requestId: id,
      mode: "model",
      text: generated.text,
      providerCalled: true,
      providerId: loaded.provider.providerId,
      model: loaded.provider.model,
      usage: generated.usage,
      resultCode: "AI_COMPLETED"
    };
  } catch (cause) {
    const error = safeProviderError(cause);
    if (feature.fallbackMode !== "rule_fallback" || typeof fallback !== "function") throw error;
    const fallbackValue = await fallback();
    const db = loaded?.db || env.PRODUCT_FLOW_DB || env.product_flow_db || env.DB;
    if (db) {
      await writeAiAudit(db, {
        requestId: id,
        userId,
        department: session.department,
        providerId: loaded?.provider?.providerId || "lingsuan-responses",
        model: loaded?.provider?.model || "gpt-5.6-sol",
        inputTokens: 0,
        outputTokens: 0,
        latencyMs: Date.now() - started,
        resultCode: error.code || "AI_RULE_FALLBACK",
        completed: true,
        appId: feature.appId,
        featureId: feature.featureId,
        executionMode: "rule_fallback",
        providerCalled
      });
    }
    return {
      requestId: id,
      mode: "rule_fallback",
      fallback: fallbackValue,
      providerCalled,
      providerId: loaded?.provider?.providerId || "lingsuan-responses",
      model: loaded?.provider?.model || "gpt-5.6-sol",
      usage: { inputTokens: 0, outputTokens: 0 },
      resultCode: error.code || "AI_RULE_FALLBACK"
    };
  }
}
