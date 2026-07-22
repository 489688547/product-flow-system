const VIEW_DEPARTMENTS = new Set(["总经办", "运营部", "财务部", "产品部", "供应链部", "供应链", "供应链团队", "采购部"]);
const EDIT_DEPARTMENTS = new Set(["总经办", "运营部"]);

export function dataCenterDepartment(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

export function isDataCenterExecutive(session = {}) {
  return session.role === "executive" || dataCenterDepartment(session).split("/").map(value => value.trim()).includes("总经办");
}

export function canViewDataCenter(session = {}) {
  return isDataCenterExecutive(session) || VIEW_DEPARTMENTS.has(dataCenterDepartment(session));
}

export function canEditDataCenter(session = {}) {
  return session.role !== "readonly" && (isDataCenterExecutive(session) || EDIT_DEPARTMENTS.has(dataCenterDepartment(session)));
}
