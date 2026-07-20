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

export function authorizeGoodsFlow(session, action = "read") {
  if (!identity(session)) throw goodsFlowError("AUTH_SESSION_REQUIRED", 401, "请先使用钉钉登录。");
  if (action !== "read" && session?.role === "readonly") {
    throw goodsFlowError("GOODS_FLOW_WRITE_DENIED", 403, "只读账号不能修改货流数据。");
  }
  const department = String(session?.department || session?.departmentName || "").trim();
  if (action === "read" && !READ_DEPARTMENTS.has(department)) {
    throw goodsFlowError("GOODS_FLOW_ACTION_DENIED", 403, "当前部门无权读取货流数据。");
  }
  if (action !== "read" && !DEPARTMENTS[action]?.has(department)) {
    throw goodsFlowError("GOODS_FLOW_ACTION_DENIED", 403, "当前部门无权执行该货流操作。");
  }
  return {
    id: identity(session).slice(0, 120),
    actor: String(session?.name || identity(session)).slice(0, 80),
    department,
    role: String(session?.role || "member"),
    canViewAmounts: AMOUNT_DEPARTMENTS.has(department)
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
