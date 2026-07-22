const FEATURES = Object.freeze([
  Object.freeze({
    appId: "company-ai-assistant",
    appName: "公司 AI 总助",
    featureId: "assistant-chat",
    featureName: "对话分析",
    supportsSkills: true,
    fallbackMode: "none",
    historyNote: ""
  }),
  Object.freeze({
    appId: "ecommerce-operations",
    appName: "电商店铺运营",
    featureId: "plan-review",
    featureName: "方案点评",
    supportsSkills: false,
    fallbackMode: "rule_fallback",
    historyNote: "统一接入前暂无统计"
  })
]);

const FEATURES_BY_KEY = new Map(FEATURES.map(feature => [`${feature.appId}:${feature.featureId}`, feature]));

function featureError() {
  return Object.assign(new Error("AI 功能未登记。"), {
    code: "AI_FEATURE_NOT_REGISTERED",
    status: 500,
    retryable: false
  });
}

export function getAiFeatureDefinition(appId, featureId) {
  const key = `${String(appId || "").trim()}:${String(featureId || "").trim()}`;
  const feature = FEATURES_BY_KEY.get(key);
  if (!feature) throw featureError();
  return feature;
}

export function listAiFeatureDefinitions() {
  return [...FEATURES];
}
