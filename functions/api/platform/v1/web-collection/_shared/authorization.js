import { routeError } from "./http.js";

const VIEW_DEPARTMENTS = new Set(["总经办", "数据中心", "数据部", "运营", "运营部", "供应链", "供应链部", "财务", "财务部"]);

export function authorizeWebCollectionView(session) {
  if (!session) throw routeError(401, "AUTH_SESSION_REQUIRED", "请先使用钉钉登录。");
  const department = String(session.department || session.departmentName || "").trim();
  if (session.role !== "executive" && !VIEW_DEPARTMENTS.has(department)) {
    throw routeError(403, "WEB_COLLECTION_VIEW_DENIED", "当前账号无权查看网页采集任务。");
  }
  return { actor: String(session.name || session.userName || session.userId || "unknown").slice(0, 120), department };
}

export function authorizeWebCollectionAdmin(session) {
  const actor = authorizeWebCollectionView(session);
  if (session?.role !== "executive") throw routeError(403, "WEB_COLLECTION_RUNNER_REGISTER_DENIED", "仅总经办可登记采集设备。");
  return { ...actor, userId: String(session.userId || session.id || "").slice(0, 160) };
}

