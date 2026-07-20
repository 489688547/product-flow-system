import { normalizeDataStandardDraft, orderMetricDependencies } from "../../../../../src/domain/dataStandards.js";
import { lockOwnerDepartment, normalizeDepartmentName } from "./dataStandardsAuthorization.js";
import { DataStandardsHttpError } from "./dataStandardsHttp.js";

const WRITE_FIELDS = new Set([
  "metricCode", "name", "category", "ownerDepartment", "unit", "period", "effectiveFrom",
  "displayFormula", "formulaAst", "sourceFields", "expectedVersion"
]);
const UNTRUSTED_SERVER_FIELDS = new Set([
  "actor", "createdBy", "createdAt", "updatedBy", "updatedAt", "publishedAt", "archivedAt", "archivedBy", "audit"
]);

function invalid(message, code = "DATA_STANDARD_INVALID", details) {
  throw new DataStandardsHttpError(400, code, message, details);
}

function isDateOnly(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function sanitizedBody(body) {
  const unknown = Object.keys(body).filter(key => !WRITE_FIELDS.has(key) && !UNTRUSTED_SERVER_FIELDS.has(key));
  if (unknown.length) invalid("数据口径请求包含不支持的字段。", "DATA_STANDARD_INVALID", { fields: unknown });
  return Object.fromEntries(Object.entries(body).filter(([key]) => WRITE_FIELDS.has(key)));
}

export function validateDefinitionInput(body, actor, { existing = null, definitions = [] } = {}) {
  const submitted = sanitizedBody(body);
  if (existing && submitted.metricCode && submitted.metricCode !== existing.metricCode) {
    invalid("已发布口径的 metricCode 不能修改。", "DATA_STANDARD_INVALID", { fields: ["metricCode"] });
  }
  const currentVersion = existing?.versions?.find(version => version.version === existing.currentVersion)
    || existing?.versions?.[0]
    || {};
  const input = existing ? {
    metricCode: existing.metricCode,
    name: existing.name,
    category: existing.category,
    ownerDepartment: existing.ownerDepartment,
    unit: existing.unit,
    period: existing.period,
    displayFormula: currentVersion.displayFormula,
    formulaAst: currentVersion.formulaAst,
    sourceFields: currentVersion.sourceFields,
    ...submitted
  } : submitted;
  input.ownerDepartment = lockOwnerDepartment(actor, input.ownerDepartment);
  if (existing && (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1)) {
    invalid("更新数据口径必须提交有效的 expectedVersion。");
  }
  if (!String(input.name || "").trim() || !String(input.displayFormula || "").trim() || !isDateOnly(input.effectiveFrom)) {
    invalid("名称、展示公式和有效生效日期为必填项。");
  }
  const contextDefinitions = definitions.map(definition => ({ ...definition }));
  const index = contextDefinitions.findIndex(definition => definition.metricCode === input.metricCode);
  const validationContext = { definitions: contextDefinitions };
  const draft = normalizeDataStandardDraft(input, validationContext);
  if (!draft.validation.ok) invalid("数据口径公式或字段不符合契约。", draft.validation.code);
  const graphDefinition = { ...(existing || {}), ...draft, status: "active" };
  if (index >= 0) contextDefinitions[index] = graphDefinition;
  else contextDefinitions.push(graphDefinition);
  try {
    orderMetricDependencies(contextDefinitions);
  } catch (error) {
    if (error?.code === "DATA_STANDARD_CYCLE") invalid("数据口径依赖不能形成循环。", "DATA_STANDARD_CYCLE");
    throw error;
  }
  return draft;
}

export function validateArchiveInput(body) {
  const unknown = Object.keys(body).filter(key => key !== "expectedVersion" && !UNTRUSTED_SERVER_FIELDS.has(key));
  if (unknown.length || !Number.isInteger(body.expectedVersion) || body.expectedVersion < 1) {
    invalid("归档数据口径必须提交有效的 expectedVersion。", "DATA_STANDARD_INVALID", unknown.length ? { fields: unknown } : undefined);
  }
  return { expectedVersion: body.expectedVersion };
}

export function validateListQuery(request) {
  const params = new URL(request.url).searchParams;
  const allowed = new Set(["category", "ownerDepartment", "status"]);
  const unknown = [...params.keys()].filter(key => !allowed.has(key));
  const status = String(params.get("status") || "");
  if (unknown.length || status && !["active", "archived"].includes(status)) {
    invalid("数据口径筛选条件无效。", "DATA_STANDARD_INVALID", unknown.length ? { fields: unknown } : undefined);
  }
  return {
    category: String(params.get("category") || "").slice(0, 40),
    ownerDepartment: normalizeDepartmentName(String(params.get("ownerDepartment") || "").slice(0, 40)),
    status
  };
}
