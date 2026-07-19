const PROVIDER_ID = "lingsuan-responses";

export const AI_DATA_DOMAINS = Object.freeze([
  { id: "strategy", name: "公司战略", classification: "internal", viewDepartments: ["总经办"], viewTitles: [] },
  { id: "projects", name: "重点项目", classification: "internal", viewDepartments: ["总经办"], viewTitles: [] },
  { id: "commitments", name: "部门承诺", classification: "internal", viewDepartments: [], viewTitles: ["负责人", "主管", "总监"] },
  { id: "product_lifecycle", name: "产品需求与生命周期", classification: "internal", viewDepartments: ["产品部"], viewTitles: ["产品经理"] },
  { id: "supply_chain", name: "供应链", classification: "internal", viewDepartments: ["供应链部", "供应链", "供应链团队", "采购部"], viewTitles: [] },
  { id: "operating_reviews", name: "经营检查", classification: "internal", viewDepartments: ["运营部", "品牌部"], viewTitles: ["运营主管"] },
  { id: "sales_operations", name: "销售经营摘要", classification: "internal", viewDepartments: ["运营部", "品牌部"], viewTitles: ["运营主管"] },
  { id: "data_quality", name: "数据质量与同步状态", classification: "internal", viewDepartments: ["运营部", "财务部", "产品部", "供应链部"], viewTitles: [] },
  { id: "ecommerce_operations", name: "电商店铺运营", classification: "internal", viewDepartments: ["运营部", "品牌部", "产品部", "供应链部", "供应链", "供应链团队", "采购部", "财务部"], viewTitles: [] },
  { id: "brand_content", name: "品牌内容协同", classification: "internal", viewDepartments: ["品牌部", "运营部"], viewTitles: ["品牌", "编导", "剪辑", "运营"] },
  { id: "performance_management", name: "绩效管理", classification: "sensitive", viewDepartments: ["运营部", "品牌部", "产品部", "供应链部", "供应链", "供应链团队", "采购部", "财务部", "人事行政部", "人事部", "质量管理部"], viewTitles: [] },
  { id: "finance", name: "财务", classification: "restricted", viewDepartments: ["财务部"], viewTitles: [] }
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
  lastStatusCode: 0,
  skillsSupported: false,
  lastSkillCheckedAt: ""
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
    lastStatusCode: safeNonNegativeNumber(input.lastStatusCode),
    skillsSupported: input.skillsSupported === true,
    lastSkillCheckedAt: typeof input.lastSkillCheckedAt === "string" ? input.lastSkillCheckedAt.slice(0, 40) : ""
  };
}

export function createDefaultAiDataPolicies() {
  return AI_DATA_DOMAINS.map(domain => ({
    id: domain.id,
    domainId: domain.id,
    name: domain.name,
    classification: domain.classification,
    viewDepartments: [...domain.viewDepartments],
    viewTitles: [...domain.viewTitles],
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
      viewDepartments: stringList(item.viewDepartments, fallback.viewDepartments),
      viewTitles: stringList(item.viewTitles, fallback.viewTitles),
      providerTransfer: {
        [PROVIDER_ID]: fallback.domainId === "finance" ? "blocked" : transfer
      },
      reason: typeof item.reason === "string" ? item.reason.slice(0, 500) : fallback.reason,
      reviewedAt: typeof item.reviewedAt === "string" ? item.reviewedAt.slice(0, 40) : "",
      reviewedBy: typeof item.reviewedBy === "string" ? item.reviewedBy.slice(0, 120) : ""
    };
  });
}

function stringList(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return [...new Set(value.map(item => String(item || "").trim()).filter(Boolean))].slice(0, 50);
}
