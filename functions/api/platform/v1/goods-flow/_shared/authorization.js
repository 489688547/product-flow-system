import { goodsFlowError } from "./http.js";

const DEPARTMENTS = {
  manage_terms: new Set(["财务部", "财务", "总经办"]),
  freeze_ccc: new Set(["财务部", "财务", "总经办"]),
  confirm_amount: new Set(["财务部", "财务", "总经办"]),
  recalculate_ccc: new Set(["财务部", "财务", "供应链部", "供应链", "总经办"]),
  confirm_difference: new Set(["供应链部", "供应链", "总经办"]),
  submit_count: new Set(["仓库", "仓储部", "供应链部", "供应链", "总经办"]),
  import: new Set(["数据中心", "数据部", "供应链部", "供应链", "财务部", "财务", "总经办"])
};

const READ_DEPARTMENTS = new Set([
  "总经办", "供应链", "供应链部", "供应链团队", "采购部", "财务部", "财务",
  "仓库", "仓储部", "质量管理部", "产品部", "运营部", "数据中心", "数据部"
]);
const AMOUNT_DEPARTMENTS = new Set(["总经办", "供应链", "供应链部", "供应链团队", "采购部", "财务部", "财务"]);

function identity(session) {
  return String(session?.userId || session?.userid || session?.unionId || session?.name || "").trim();
}

function departments(session = {}) {
  return [...new Set([
    session.department,
    session.departmentName,
    ...(Array.isArray(session.departments) ? session.departments : []),
    ...(Array.isArray(session.departmentNames) ? session.departmentNames : [])
  ]
    .flatMap(value => String(value || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(value => value.trim())
    .filter(Boolean))];
}

export function authorizeGoodsFlow(session, action = "read") {
  if (!identity(session)) throw goodsFlowError("AUTH_SESSION_REQUIRED", 401, "请先使用钉钉登录。");
  if (action !== "read" && session?.role === "readonly") {
    throw goodsFlowError("GOODS_FLOW_WRITE_DENIED", 403, "只读账号不能修改货流数据。");
  }
  const actorDepartments = departments(session);
  const executive = session?.role === "executive";
  if (action === "read" && !executive && !actorDepartments.some(value => READ_DEPARTMENTS.has(value))) {
    throw goodsFlowError("GOODS_FLOW_ACTION_DENIED", 403, "当前部门无权读取货流数据。");
  }
  if (action !== "read" && !actorDepartments.some(value => DEPARTMENTS[action]?.has(value))) {
    throw goodsFlowError("GOODS_FLOW_ACTION_DENIED", 403, "当前部门无权执行该货流操作。");
  }
  return {
    id: identity(session).slice(0, 120),
    actor: String(session?.name || identity(session)).slice(0, 80),
    department: actorDepartments[0] || "",
    departments: actorDepartments,
    role: String(session?.role || "member"),
    canViewAmounts: executive || actorDepartments.some(value => AMOUNT_DEPARTMENTS.has(value))
  };
}

export function hideGoodsFlowAmounts(row = {}, canViewAmounts = false) {
  if (canViewAmounts) return row;
  const visible = { ...row };
  delete visible.unitCost;
  delete visible.calibratedInventoryValue;
  delete visible.inventoryCashTied;
  delete visible.amountVariance;
  return visible;
}
