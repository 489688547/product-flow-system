const uid = session => String(session?.userId || session?.userid || session?.unionId || session?.name || "");
const dept = session => String(session?.department || session?.departmentName || "");
export const isHr = session => ["人事行政部", "人事部"].includes(dept(session));
export const isManager = session => !isHr(session) && dept(session) !== "总经办" && /主管|经理|总监|负责人/.test(String(session?.title || ""));
export const actor = session => ({ userId: uid(session), name: session?.name || "系统" });
export const currentUserId = uid;

export function canManageEmployee(state, session, employeeId) {
  if (isHr(session)) return true;
  const managerId = uid(session);
  const sessionScope = [session?.managedUserIds, session?.subordinateUserIds].flatMap(value => Array.isArray(value) ? value.map(String) : []);
  return sessionScope.includes(String(employeeId)) || state.managerAssignments.some(item => item.active !== false && String(item.managerId) === managerId && String(item.employeeId) === String(employeeId));
}

export function filterPerformanceState(state, session) {
  if (isHr(session)) return state;
  const employeeId = uid(session);
  if (isManager(session)) {
    const ids = new Set(state.assessments.filter(item => item.managerId === employeeId).map(item => item.id));
    return { ...state, templates: state.templates, managerAssignments: state.managerAssignments.filter(item => String(item.managerId) === employeeId), assessments: state.assessments.filter(item => ids.has(item.id)), reviewRequests: state.reviewRequests.filter(item => ids.has(item.assessmentId)), auditLogs: [] };
  }
  const ids = new Set(state.assessments.filter(item => item.employeeId === employeeId).map(item => item.id));
  return { ...state, templates: [], managerAssignments: [], assessments: state.assessments.filter(item => ids.has(item.id)), reviewRequests: state.reviewRequests.filter(item => ids.has(item.assessmentId)), auditLogs: [] };
}
