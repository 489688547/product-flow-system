const VIEW_DEPARTMENTS = new Set(["总经办", "运营部", "品牌部", "产品部", "供应链部", "供应链", "供应链团队", "采购部", "财务部"]);

export function department(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

export function canViewOperations(session) {
  return VIEW_DEPARTMENTS.has(department(session));
}

export function canViewOperationsEvidence(session) {
  return canViewOperations(session) || ["人事行政部", "人事部"].includes(department(session));
}

export function isOperationsManager(session) {
  return department(session) === "总经办" || (department(session) === "运营部" && /主管|经理|总监|负责人/.test(String(session.title || "")));
}

export function isOperationsMember(session) {
  return department(session) === "总经办" || department(session) === "运营部";
}

export function isDepartmentManager(session) {
  return department(session) === "总经办" || /主管|经理|总监|负责人/.test(String(session?.title || ""));
}

export function actor(session = {}) {
  return { userId: session.userId || session.userid || session.unionId || session.name, name: session.name || "系统" };
}

export function filterOperationsStateForSession(state, session = {}) {
  if (isOperationsManager(session)) return state;
  const user = actor(session); const dept = department(session);
  if (dept === "运营部") {
    const cycles = state.cycles.filter(item => String(item.ownerId || "") === String(user.userId));
    const cycleIds = new Set(cycles.map(item => item.id));
    const plans = state.plans.filter(item => String(item.ownerId || "") === String(user.userId) || cycleIds.has(item.cycleId));
    const planIds = new Set(plans.map(item => item.id));
    return { ...state, cycles, plans, executions: state.executions.filter(item => String(item.ownerId || "") === String(user.userId) || planIds.has(item.planId)), collaborations: state.collaborations.filter(item => String(item.ownerId || "") === String(user.userId) || item.targetDepartment === dept), responsibilities: state.responsibilities.filter(item => String(item.memberId || item.memberName || "") === String(user.userId) || item.memberName === user.name), aiReviews: state.aiReviews.filter(item => planIds.has(item.planId)), auditLogs: [] };
  }
  return { ...state, cycles: [], plans: [], executions: [], responsibilities: [], playbooks: [], aiReviews: [], auditLogs: [], collaborations: state.collaborations.filter(item => item.targetDepartment === dept) };
}
