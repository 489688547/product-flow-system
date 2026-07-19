import { activeAssignment, normalizeHrManagementState } from "../../../../src/domain/hrManagement.js";

function values(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap(item => String(item || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(item => item.trim())
    .filter(Boolean);
}

function shanghaiDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
}

function activeInRange(record, day) {
  return (!record.effectiveFrom || record.effectiveFrom <= day) && (!record.effectiveTo || record.effectiveTo >= day);
}

export function readHrScope(session = {}, input, now = new Date()) {
  const state = normalizeHrManagementState(input);
  const day = shanghaiDay(now);
  const userId = String(session.userId || "");
  const unionId = String(session.unionId || "");
  const employee = state.employees.find(item => (userId && item.userId === userId) || (unionId && item.unionId === unionId)) || null;
  const departments = values([session.department, session.departments, session.departmentNames]);
  const roles = new Set();
  if (session.role === "executive" || departments.includes("总经办")) roles.add("executive");
  if (employee) roles.add("employee");
  for (const assignment of state.roleAssignments) {
    if (assignment.employeeId === employee?.id && activeInRange(assignment, day)) roles.add(assignment.role);
  }
  const managedEmployeeIds = employee
    ? state.assignments.filter(item => item.managerEmployeeId === employee.id && activeAssignment(state.assignments, item.employeeId, day)?.id === item.id).map(item => item.employeeId)
    : [];
  if (managedEmployeeIds.length) roles.add("manager");
  return { roles: [...roles], employeeId: employee?.id || "", managedEmployeeIds, asOfDate: day };
}

export function canReadHr(scope) {
  return scope.roles.some(role => ["employee", "manager", "hr_admin", "hr_manager", "executive"].includes(role));
}

function hasFullAccess(scope) {
  return scope.roles.some(role => ["hr_admin", "hr_manager", "executive"].includes(role));
}

export function filterHrStateForScope(input, scope) {
  const state = normalizeHrManagementState(input);
  if (hasFullAccess(scope)) return state;
  const allowedIds = new Set([scope.employeeId, ...scope.managedEmployeeIds].filter(Boolean));
  const employees = state.employees.filter(item => allowedIds.has(item.id));
  const assignments = state.assignments.filter(item => allowedIds.has(item.employeeId));
  const lifecycleEvents = state.lifecycleEvents.filter(item => allowedIds.has(item.employeeId));
  const performanceItems = state.performanceItems.filter(item => allowedIds.has(item.employeeId));
  const itemIds = new Set(performanceItems.map(item => item.id));
  const cycleIds = new Set(performanceItems.map(item => item.cycleId));
  return normalizeHrManagementState({
    ...state,
    employees,
    assignments,
    roleAssignments: [],
    lifecycleEvents,
    performanceCycles: state.performanceCycles.filter(item => cycleIds.has(item.id)),
    performanceItems,
    evidenceSnapshots: state.evidenceSnapshots.filter(item => itemIds.has(item.performanceItemId)),
    auditLogs: []
  });
}

export function canApplyHrAction(scope, action = {}) {
  const full = hasFullAccess(scope);
  if (full) return { allowed: true };
  if (scope.roles.includes("manager") && ["upsert_performance_item", "submit_manager_review"].includes(action.type)) {
    const employeeId = action.employeeId || action.record?.employeeId;
    return scope.managedEmployeeIds.includes(employeeId)
      ? { allowed: true }
      : { allowed: false, code: "HR_SCOPE_DENIED", message: "只能维护当前直属员工的绩效。" };
  }
  if (scope.roles.includes("employee") && ["submit_self_review", "request_performance_review"].includes(action.type)) {
    return action.employeeId === scope.employeeId
      ? { allowed: true }
      : { allowed: false, code: "HR_SCOPE_DENIED", message: "只能维护自己的绩效记录。" };
  }
  return { allowed: false, code: "HR_WRITE_DENIED", message: "当前账号无权执行该人事操作。" };
}
