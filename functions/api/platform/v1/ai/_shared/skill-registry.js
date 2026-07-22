import { CORE_SKILL_EXECUTORS } from "./skill-executors/core.js";
import { BUSINESS_SKILL_EXECUTORS } from "./skill-executors/business-apps.js";

const PRIVATE_KEY = /(?:phone|mobile|email|address|cookie|token|password|secret|authorization|verification|session|cost|gross.?profit|profit|margin|budget|settlement|bonus|salary|commission)/i;
const PRIVATE_VALUE = /(?:\b1[3-9]\d{9}\b|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,})/;

function inputSchema(properties) {
  return { type: "object", properties, additionalProperties: false };
}

const QUERY_PROPERTIES = Object.freeze({
  query: { type: "string", maxLength: 120, description: "标题、名称或负责人关键词" },
  status: { type: "string", maxLength: 40, description: "精确状态值" },
  limit: { type: "integer", minimum: 1, maximum: 80, description: "最多返回记录数" }
});

const SALES_PROPERTIES = Object.freeze({
  from: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "开始日期" },
  to: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$", description: "结束日期" },
  platform: { type: "string", maxLength: 40, description: "平台名称" },
  limit: { type: "integer", minimum: 1, maximum: 300, description: "最多返回聚合行数" }
});

function definition(name, appId, displayName, description, domainId, properties, maxRows = 80, maxChars = 12_000) {
  return Object.freeze({
    name,
    appId,
    displayName,
    description,
    domainIds: [domainId],
    parameters: inputSchema(properties),
    maxRows,
    maxChars,
    timeoutMs: 8_000,
    execute: CORE_SKILL_EXECUTORS[name] || BUSINESS_SKILL_EXECUTORS[name]
  });
}

export const AI_SKILL_DEFINITIONS = Object.freeze([
  definition("strategy_query_strategies", "strategy", "公司战略", "查询公司战略状态与负责人", "strategy", QUERY_PROPERTIES),
  definition("strategy_query_projects", "strategy", "重点项目", "查询重点项目、状态、负责人和节点", "projects", QUERY_PROPERTIES),
  definition("strategy_query_commitments", "strategy", "部门承诺", "查询当前权限范围内的部门承诺", "commitments", QUERY_PROPERTIES),
  definition("strategy_query_reviews", "strategy", "经营复盘", "查询当前权限范围内的风险与经营复盘", "operating_reviews", QUERY_PROPERTIES),
  definition("product_flow_query_lifecycle", "product-flow", "产品全周期", "查询需求、产品阶段和未完成任务", "product_lifecycle", QUERY_PROPERTIES),
  definition("supply_chain_query_status", "supply-chain", "供应链状态", "查询供应商、库存、质量问题和审批状态", "supply_chain", QUERY_PROPERTIES),
  definition("data_center_query_sales", "data-center", "销售经营", "按日期和平台查询销售经营聚合", "sales_operations", SALES_PROPERTIES, 300, 16_000),
  definition("data_center_query_quality", "data-center", "数据质量", "查询数据质量问题和同步状态", "data_quality", QUERY_PROPERTIES),
  definition("ecommerce_operations_query", "ecommerce-operations", "店铺运营", "查询可见店铺、重点产品、方案、执行、协同和复盘", "ecommerce_operations", QUERY_PROPERTIES),
  definition("brand_content_query", "brand-content", "品牌内容", "查询内容任务、素材、发布和非财务表现", "brand_content", QUERY_PROPERTIES),
  definition("performance_management_query", "performance-management", "绩效管理", "查询当前身份可见的考核状态与经营证据", "performance_management", QUERY_PROPERTIES)
]);

function skillError(code, message, status = 400) {
  return Object.assign(new Error(message), { code, status, retryable: false });
}

function allowed(definitionValue, access = {}) {
  const domains = new Set(access.allowed || []);
  return definitionValue.domainIds.every(domainId => domains.has(domainId));
}

export function listAvailableSkillDefinitions({ access = {}, definitions = AI_SKILL_DEFINITIONS } = {}) {
  return definitions.filter(item => allowed(item, access) && typeof item.execute === "function");
}

export function listAvailableSkills(input = {}) {
  return listAvailableSkillDefinitions(input).map(item => ({
    type: "function",
    name: item.name,
    description: item.description,
    parameters: item.parameters,
    strict: true
  }));
}

export function listAiSkillMetadata() {
  return AI_SKILL_DEFINITIONS.map(item => ({
    skillId: item.name,
    sourceAppId: item.appId,
    skillName: item.displayName
  }));
}

function parseArguments(definitionValue, argumentsText) {
  let parsed;
  try { parsed = JSON.parse(argumentsText || "{}"); } catch { throw skillError("AI_SKILL_ARGUMENTS_INVALID", "Skill 参数不是有效 JSON。"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw skillError("AI_SKILL_ARGUMENTS_INVALID", "Skill 参数必须是对象。");
  const properties = definitionValue.parameters.properties || {};
  for (const [key, value] of Object.entries(parsed)) {
    const schema = properties[key];
    if (!schema) throw skillError("AI_SKILL_ARGUMENTS_INVALID", `Skill 不接受参数 ${key}。`);
    if (schema.type === "string") {
      if (typeof value !== "string" || value.length > (schema.maxLength || 1_000) || (schema.pattern && !new RegExp(schema.pattern).test(value))) {
        throw skillError("AI_SKILL_ARGUMENTS_INVALID", `Skill 参数 ${key} 无效。`);
      }
    }
    if (schema.type === "integer" && (!Number.isInteger(value) || value < schema.minimum || value > schema.maximum)) {
      throw skillError("AI_SKILL_ARGUMENTS_INVALID", `Skill 参数 ${key} 无效。`);
    }
  }
  if (parsed.from && parsed.to && parsed.from > parsed.to) throw skillError("AI_SKILL_ARGUMENTS_INVALID", "Skill 日期范围无效。");
  return parsed;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "string") return PRIVATE_VALUE.test(value) ? "[已移除]" : value.slice(0, 600);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !PRIVATE_KEY.test(key)).map(([key, nested]) => [key, redact(nested)]));
}

function boundRows(value, limit) {
  if (Array.isArray(value)) return value.slice(0, limit).map(item => boundRows(item, limit));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, boundRows(nested, limit)]));
}

function fitChars(value, maxChars) {
  if (JSON.stringify(value).length <= maxChars) return value;
  if (Array.isArray(value)) {
    const next = [...value];
    while (next.length && JSON.stringify(next).length > maxChars) next.pop();
    return next;
  }
  if (value && typeof value === "object") {
    const next = { ...value };
    for (const key of Object.keys(next).reverse()) {
      if (JSON.stringify(next).length <= maxChars) break;
      next[key] = Array.isArray(next[key]) ? [] : null;
    }
    return next;
  }
  return value;
}

function recordCount(value) {
  if (Array.isArray(value)) return value.length;
  if (!value || typeof value !== "object") return 0;
  return Object.values(value).reduce((sum, nested) => sum + recordCount(nested), 0);
}

async function withTimeout(task, timeoutMs, signal) {
  if (signal?.aborted) throw skillError("AI_SKILL_CANCELLED", "Skill 查询已取消。", 499);
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error("Skill 查询超时。"), { code: "AI_SKILL_TIMEOUT", status: 504, retryable: true })), timeoutMs);
  });
  try { return await Promise.race([task, timeout]); } finally { clearTimeout(timer); }
}

export async function executeSkill({ db, session, access = {}, skillId, argumentsText = "{}", signal, definitions = AI_SKILL_DEFINITIONS } = {}) {
  const definitionValue = definitions.find(item => item.name === skillId);
  if (!definitionValue) throw skillError("AI_SKILL_UNKNOWN", "未知的公司只读 Skill。");
  if (!allowed(definitionValue, access) || typeof definitionValue.execute !== "function") throw skillError("AI_SKILL_DENIED", "当前身份无权使用该 Skill。", 403);
  const args = parseArguments(definitionValue, argumentsText);
  const executed = await withTimeout(Promise.resolve(definitionValue.execute({ db, session, access, args, signal })), definitionValue.timeoutMs, signal);
  const records = fitChars(boundRows(redact(executed?.records ?? {}), definitionValue.maxRows), definitionValue.maxChars);
  return {
    skillId: definitionValue.name,
    appId: definitionValue.appId,
    displayName: definitionValue.displayName,
    records,
    recordCount: recordCount(records),
    updatedAt: String(executed?.updatedAt || "").slice(0, 40),
    source: { appId: definitionValue.appId, domainIds: definitionValue.domainIds },
    safeArguments: args
  };
}
