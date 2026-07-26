import { ownerDepartmentForResource } from "../../../../../../src/domain/supplyChainWorkflows.js";
import { workflowError } from "./http.js";

const READ_DEPARTMENTS = new Set([
  "总经办", "供应链部", "供应链", "供应链团队", "采购部", "财务部", "财务",
  "质量管理部", "产品部", "运营部", "运营", "仓库", "仓储部", "数据中心", "数据部"
]);
const OWNER_ALIASES = Object.freeze({
  总经办: new Set(["总经办"]),
  供应链部: new Set(["供应链部", "供应链", "供应链团队", "采购部"]),
  财务部: new Set(["财务部", "财务"]),
  质量管理部: new Set(["质量管理部"]),
  产品部: new Set(["产品部"])
});

function identity(session = {}) {
  return String(session.userId || session.userid || session.unionId || session.name || "").trim();
}

function departments(session = {}) {
  return [...new Set([
    session.department,
    session.departmentName,
    ...(Array.isArray(session.departments) ? session.departments : []),
    ...(Array.isArray(session.departmentNames) ? session.departmentNames : [])
  ].flatMap(value => String(value || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/)).map(value => value.trim()).filter(Boolean))];
}

export function authorizeSupplyWorkflow(session, resource, action = "read") {
  const actorId = identity(session);
  if (!actorId) throw workflowError(401, "AUTH_SESSION_REQUIRED", "请先使用钉钉登录。");
  const actorDepartments = departments(session);
  const executive = session?.role === "executive";
  if (action === "read") {
    if (!executive && !actorDepartments.some(value => READ_DEPARTMENTS.has(value))) {
      throw workflowError(403, "SUPPLY_WORKFLOW_VIEW_DENIED", "当前部门无权读取供应链工作流。");
    }
  } else {
    if (session?.role === "readonly" || session?.readonly === true) {
      throw workflowError(403, "SUPPLY_WORKFLOW_WRITE_DENIED", "只读账号不能修改供应链工作流。");
    }
    const owner = ownerDepartmentForResource(resource);
    const allowed = OWNER_ALIASES[owner] || new Set([owner]);
    const special = resource === "inspection-records" && actorDepartments.some(value => ["仓库", "仓储部"].includes(value));
    const clearanceOperator = resource === "clearance-suggestions" && actorDepartments.some(value => ["运营部", "运营"].includes(value));
    const qualityProduct = resource === "quality-standards" && actorDepartments.includes("产品部");
    const bomSupply = resource === "bom-definitions" && actorDepartments.some(value => OWNER_ALIASES["供应链部"].has(value));
    if (!executive && !actorDepartments.some(value => allowed.has(value)) && !special && !clearanceOperator && !qualityProduct && !bomSupply) {
      throw workflowError(403, "SUPPLY_WORKFLOW_ACTION_DENIED", "当前部门无权修改该供应链工作流。");
    }
  }
  return {
    id: actorId.slice(0, 160),
    name: String(session.name || actorId).slice(0, 120),
    department: actorDepartments[0] || (executive ? "总经办" : ""),
    departments: actorDepartments,
    role: String(session.role || "member")
  };
}
