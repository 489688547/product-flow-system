function connectionField(key, label, envVar, options = {}) {
  return Object.freeze({
    key,
    label,
    envVar,
    aliases: [],
    type: "password",
    required: true,
    maxLength: 4096,
    ...options
  });
}

function connectionDefinition(input) {
  return Object.freeze({
    available: true,
    ...input,
    fields: Object.freeze((input.fields || []).map(field => Object.freeze(field)))
  });
}

export const PLATFORM_CONNECTION_DEFINITIONS = Object.freeze([
  connectionDefinition({
    id: "dingtalk",
    name: "钉钉",
    mark: "钉",
    description: "公司登录、组织通讯录、待办、日历、文档和审批能力",
    fields: [
      connectionField("appKey", "应用凭证", "DINGTALK_APP_KEY", { type: "text", aliases: ["DINGTALK_CLIENT_ID"] }),
      connectionField("appSecret", "应用密钥", "DINGTALK_APP_SECRET", { aliases: ["DINGTALK_CLIENT_SECRET"] })
    ]
  }),
  connectionDefinition({
    id: "kuaimai",
    name: "快麦 ERP",
    mark: "快",
    description: "订单拉取、销售聚合和接口会话维护",
    fields: [
      connectionField("appKey", "应用凭证", "KUAIMAI_APP_KEY", { type: "text" }),
      connectionField("appSecret", "应用密钥", "KUAIMAI_APP_SECRET"),
      connectionField("accessToken", "访问令牌", "KUAIMAI_ACCESS_TOKEN"),
      connectionField("refreshToken", "刷新令牌", "KUAIMAI_REFRESH_TOKEN", { required: false })
    ]
  }),
  connectionDefinition({
    id: "lingsuan-ai-gateway",
    name: "灵算 AI 网关",
    mark: "AI",
    description: "公司统一模型调用、Token 与 Skill 审计",
    fields: [
      connectionField("apiKey", "API Key", "LINGSUAN_API_KEY"),
      connectionField("actorAuthorization", "Actor Authorization", "LINGSUAN_ACTOR_AUTHORIZATION", { required: false })
    ]
  }),
  connectionDefinition({
    id: "aliyun",
    name: "阿里云",
    mark: "云",
    description: "云资源、对象存储和 OpenAPI 能力",
    available: false,
    disabledReason: "当前尚无可用的系统适配器",
    fields: []
  })
]);

const DEFINITIONS_BY_ID = new Map(PLATFORM_CONNECTION_DEFINITIONS.map(item => [item.id, item]));

export function platformConnectionDefinition(platformId) {
  return DEFINITIONS_BY_ID.get(String(platformId || "").trim()) || null;
}

export function platformEnvironmentValues(env = {}, platformId) {
  const definition = platformConnectionDefinition(platformId);
  if (!definition?.available) return {};
  return Object.fromEntries(definition.fields.flatMap(field => {
    const names = [field.envVar, ...(field.aliases || [])];
    const value = names.map(name => String(env[name] || "").trim()).find(Boolean) || "";
    return value ? [[field.key, value]] : [];
  }));
}

export function platformConfiguredEnvVars(platformId, configuredFields = []) {
  const definition = platformConnectionDefinition(platformId);
  const configured = new Set(configuredFields);
  return new Set((definition?.fields || []).filter(field => configured.has(field.key)).map(field => field.envVar));
}

export function platformRequiredFields(platformId) {
  return (platformConnectionDefinition(platformId)?.fields || []).filter(field => field.required).map(field => field.key);
}
