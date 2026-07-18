const uid = session => String(session?.userId || session?.userid || session?.unionId || session?.name || "");
const dept = session => String(session?.department || session?.departmentName || "");
export const isHr = session => ["人事行政部", "人事部"].includes(dept(session)) || dept(session) === "总经办";
export const isManager = session => isHr(session) || /主管|经理|总监|负责人/.test(String(session?.title || ""));
export const actor = session => ({ userId: uid(session), name: session?.name || "系统" });
export const currentUserId = uid;

export function filterPerformanceState(state, session) {
  if (isHr(session) || isManager(session)) return state;
  const employeeId = uid(session);
  const ids = new Set(state.assessments.filter(item => item.employeeId === employeeId).map(item => item.id));
  return { ...state, templates: [], assessments: state.assessments.filter(item => ids.has(item.id)), reviewRequests: state.reviewRequests.filter(item => ids.has(item.assessmentId)), auditLogs: [] };
}
