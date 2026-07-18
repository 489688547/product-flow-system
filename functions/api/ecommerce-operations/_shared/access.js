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

export function actor(session = {}) {
  return { userId: session.userId || session.userid || session.unionId || session.name, name: session.name || "系统" };
}
