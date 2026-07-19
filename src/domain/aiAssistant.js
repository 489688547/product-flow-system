const PROVIDER_ID = "lingsuan-responses";

export const AI_DATA_DOMAINS = Object.freeze([
  { id: "strategy", name: "公司战略", classification: "internal", departments: ["总经办"] },
  { id: "projects", name: "重点项目", classification: "internal", departments: ["总经办"] },
  { id: "commitments", name: "部门承诺", classification: "internal", departments: [] },
  { id: "product_lifecycle", name: "产品需求与生命周期", classification: "internal", departments: ["产品部"] },
  { id: "supply_chain", name: "供应链", classification: "internal", departments: ["供应链部", "供应链", "供应链团队", "采购部"] },
  { id: "operating_reviews", name: "经营检查", classification: "internal", departments: ["运营部"] },
  { id: "sales_operations", name: "销售经营摘要", classification: "internal", departments: ["运营部"] },
  { id: "data_quality", name: "数据质量与同步状态", classification: "internal", departments: ["运营部", "财务部", "产品部", "供应链部"] },
  { id: "finance", name: "财务", classification: "restricted", departments: ["财务部"] }
]);

export const DEFAULT_AI_PROVIDER = Object.freeze({
  id: PROVIDER_ID,
  providerId: PROVIDER_ID,
  displayName: "灵算",
  wireApi: "responses",
  baseUrl: "https://lingsuan.top",
  responsesPath: "/responses",
  model: "gpt-5.6-sol",
  reasoningEffort: "xhigh",
  enabled: false,
  storeResponses: false,
  lastCheckedAt: "",
  lastLatencyMs: 0,
  lastStatusCode: 0
});

function safeNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function normalizeAiProvider(input = {}) {
  return {
    ...DEFAULT_AI_PROVIDER,
    enabled: input.enabled === true,
    lastCheckedAt: typeof input.lastCheckedAt === "string" ? input.lastCheckedAt.slice(0, 40) : "",
    lastLatencyMs: safeNonNegativeNumber(input.lastLatencyMs),
    lastStatusCode: safeNonNegativeNumber(input.lastStatusCode)
  };
}

export function createDefaultAiDataPolicies() {
  return AI_DATA_DOMAINS.map(domain => ({
    id: domain.id,
    domainId: domain.id,
    name: domain.name,
    classification: domain.classification,
    departments: [...domain.departments],
    providerTransfer: {
      [PROVIDER_ID]: domain.id === "finance" ? "blocked" : "allowed"
    },
    reason: domain.id === "finance"
      ? "当前模型服务尚未通过财务数据外发审核。"
      : "首期允许发送经权限校验和脱敏后的经营摘要。",
    reviewedAt: "",
    reviewedBy: ""
  }));
}

export function normalizeAiDataPolicies(input = []) {
  const incoming = new Map((Array.isArray(input) ? input : [])
    .filter(item => item && typeof item === "object")
    .map(item => [String(item.domainId || item.id || ""), item]));
  return createDefaultAiDataPolicies().map(fallback => {
    const item = incoming.get(fallback.domainId) || {};
    const transfer = item.providerTransfer?.[PROVIDER_ID] === "blocked" ? "blocked" : "allowed";
    return {
      ...fallback,
      providerTransfer: {
        [PROVIDER_ID]: fallback.domainId === "finance" ? "blocked" : transfer
      },
      reason: typeof item.reason === "string" ? item.reason.slice(0, 500) : fallback.reason,
      reviewedAt: typeof item.reviewedAt === "string" ? item.reviewedAt.slice(0, 40) : "",
      reviewedBy: typeof item.reviewedBy === "string" ? item.reviewedBy.slice(0, 120) : ""
    };
  });
}
