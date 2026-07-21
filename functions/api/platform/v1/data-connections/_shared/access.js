import { DataConnectionHttpError } from "./http.js";

const READ_DEPARTMENTS = new Set(["总经办", "运营部", "运营", "财务部", "产品部", "供应链部", "供应链", "采购部"]);
const WRITE_DEPARTMENTS = new Set(["总经办", "运营部", "运营"]);

function departments(session = {}) {
  return [...new Set([session.department, session.departmentName, ...(session.departments || []), ...(session.departmentNames || [])]
    .flatMap(value => String(value || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(value => value.trim())
    .filter(Boolean))];
}

export function requireDataConnectionActor(data = {}) {
  if (!data.session) throw new DataConnectionHttpError(401, "AUTH_SESSION_REQUIRED", "请先使用钉钉登录。");
  const session = data.session;
  const actor = {
    userId: String(session.userId || session.userid || "").trim(),
    name: String(session.name || "").trim() || "未知用户",
    role: String(session.role || "readonly"),
    readonly: session.role === "readonly" || Boolean(session.readonly),
    departments: departments(session),
    createdAt: String(session.createdAt || "")
  };
  if (actor.role !== "executive" && !actor.departments.some(item => READ_DEPARTMENTS.has(item))) {
    throw new DataConnectionHttpError(403, "DATA_CONNECTION_READ_DENIED", "当前部门无权查看数据连接。");
  }
  return actor;
}

export function canManageDataConnections(actor) {
  return !actor.readonly && (actor.role === "executive" || actor.departments.some(item => WRITE_DEPARTMENTS.has(item)));
}

export function requireDataConnectionManager(actor) {
  if (!canManageDataConnections(actor)) {
    throw new DataConnectionHttpError(403, "DATA_CONNECTION_WRITE_DENIED", "当前身份不能管理数据连接。");
  }
}

export function requireDataConnectionDestroyer(actor) {
  if (actor.readonly || actor.role !== "executive") {
    throw new DataConnectionHttpError(403, "DATA_CONNECTION_DESTROY_DENIED", "仅总经办负责人可以销毁店铺凭证。");
  }
}

export function requireFreshSession(actor, now = new Date()) {
  const createdAt = Date.parse(actor.createdAt);
  if (!Number.isFinite(createdAt) || now.getTime() - createdAt > 15 * 60 * 1000 || createdAt > now.getTime() + 60 * 1000) {
    throw new DataConnectionHttpError(403, "DATA_CONNECTION_FRESH_SESSION_REQUIRED", "查看密码前请重新登录钉钉。");
  }
}
