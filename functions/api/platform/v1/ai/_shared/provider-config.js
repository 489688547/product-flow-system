import { DEFAULT_AI_PROVIDER, normalizeAiProvider } from "../../../../../../src/domain/aiAssistant.js";

export const PROVIDER_REGISTRY = Object.freeze({
  "lingsuan-responses": Object.freeze({
    ...DEFAULT_AI_PROVIDER,
    endpoint: "https://lingsuan.top/responses",
    apiKeyEnv: "LINGSUAN_API_KEY",
    actorHeaderEnv: "LINGSUAN_ACTOR_AUTHORIZATION"
  })
});

function providerConfigurationError() {
  return Object.assign(new Error("模型服务未登记。"), {
    code: "AI_PROVIDER_NOT_REGISTERED",
    status: 400,
    retryable: false
  });
}

export function resolveProviderConfig({ env = {}, storedProvider = {} } = {}) {
  const safe = normalizeAiProvider(storedProvider);
  const registered = PROVIDER_REGISTRY[safe.providerId];
  if (!registered) throw providerConfigurationError();
  const apiKey = String(env[registered.apiKeyEnv] || "").trim();
  const actorAuthorization = String(env[registered.actorHeaderEnv] || "").trim();
  return {
    ...registered,
    ...safe,
    endpoint: registered.endpoint,
    apiKey,
    actorAuthorization,
    secretConfigured: Boolean(apiKey)
  };
}

export function publicProviderStatus(config = {}) {
  return {
    providerId: config.providerId,
    displayName: config.displayName,
    wireApi: config.wireApi,
    baseUrl: config.baseUrl,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    enabled: config.enabled === true,
    storeResponses: false,
    secretConfigured: Boolean(config.secretConfigured),
    lastCheckedAt: config.lastCheckedAt || "",
    lastLatencyMs: Number(config.lastLatencyMs) || 0,
    lastStatusCode: Number(config.lastStatusCode) || 0
  };
}
