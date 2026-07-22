const WRITE_DEPARTMENTS = new Set(["总经办", "数据中心", "数据部", "供应链", "供应链部", "财务", "财务部"]);

function authorizationError(status, code, message) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

export function authorizeErpCollection(session) {
  if (!session) throw authorizationError(401, "AUTH_SESSION_REQUIRED", "请先使用钉钉登录。");
  const department = String(session.department || session.departmentName || "").trim();
  if (session.role === "readonly" || (session.role !== "executive" && !WRITE_DEPARTMENTS.has(department))) {
    throw authorizationError(403, "ERP_COLLECTION_WRITE_DENIED", "仅总经办、数据中心、供应链和财务可导入 ERP 数据。");
  }
  return {
    actor: String(session.name || session.userName || session.userId || "unknown").slice(0, 120),
    userId: String(session.userId || session.id || "").slice(0, 160),
    department
  };
}
