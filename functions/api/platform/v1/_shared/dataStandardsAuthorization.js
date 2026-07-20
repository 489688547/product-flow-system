import { canManageDataStandard, DATA_STANDARD_OWNER_DEPARTMENTS } from "../../../../../src/domain/dataStandards.js";
import { DataStandardsHttpError } from "./dataStandardsHttp.js";

const DEPARTMENT_ALIASES = new Map([
  ["供应链", "供应链部"],
  ["供应链团队", "供应链部"],
  ["采购部", "供应链部"]
]);
const VIEW_DEPARTMENTS = new Set(["总经办", "运营部", "财务部", "产品部", "供应链部"]);

function values(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap(entry => String(entry || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(entry => entry.trim())
    .filter(Boolean);
}

export function normalizeDepartmentName(value) {
  const department = String(value || "").trim();
  return DEPARTMENT_ALIASES.get(department) || department;
}

export function normalizeDepartmentNames(session = {}) {
  return [...new Set([
    ...values(session.department),
    ...values(session.departmentName),
    ...values(session.departments),
    ...values(session.departmentNames)
  ].map(normalizeDepartmentName).filter(Boolean))];
}

export function dataStandardActor(session = {}) {
  const departments = normalizeDepartmentNames(session);
  return {
    id: String(session.userId || session.id || "").trim(),
    name: String(session.name || "").trim(),
    departments,
    executive: departments.includes("总经办"),
    readonly: session.role === "readonly" || session.readonly === true
  };
}

export function requireDefinitionView(actor) {
  if (actor.departments.some(department => VIEW_DEPARTMENTS.has(department))) return;
  throw new DataStandardsHttpError(403, "PERMISSION_VIEW_DENIED", "当前身份无权查看数据口径。");
}

export function requireDefinitionWrite(actor, ownerDepartment) {
  const normalizedOwner = normalizeDepartmentName(ownerDepartment);
  if (canManageDataStandard(actor, { ownerDepartment: normalizedOwner }, "manage")) return normalizedOwner;
  throw new DataStandardsHttpError(403, "PERMISSION_WRITE_DENIED", "当前身份不能维护该责任部门的数据口径。");
}

export function lockOwnerDepartment(actor, requestedOwnerDepartment) {
  const requested = normalizeDepartmentName(requestedOwnerDepartment);
  if (actor.executive) return requested;
  const manageable = actor.departments.filter(department => DATA_STANDARD_OWNER_DEPARTMENTS.includes(department));
  const ownerDepartment = requested || (manageable.length === 1 ? manageable[0] : "");
  return requireDefinitionWrite(actor, ownerDepartment);
}

export function requireRecalculation(actor, definitions = []) {
  if (actor.readonly || !definitions.length || definitions.some(definition => !canManageDataStandard(actor, definition, "recalculate"))) {
    throw new DataStandardsHttpError(403, "PERMISSION_WRITE_DENIED", "当前身份不能重算所选数据口径。");
  }
}
