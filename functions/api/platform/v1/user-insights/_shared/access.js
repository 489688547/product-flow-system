import { UserInsightHttpError } from "./http.js";

const ALLOWED_DEPARTMENTS = new Set(["总经办", "产品部", "产品团队", "运营部", "运营"]);

function values(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap(entry => String(entry || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(entry => entry.trim())
    .filter(Boolean);
}

export function userInsightActor(session = {}) {
  const departments = [...new Set([
    ...values(session.department),
    ...values(session.departmentName),
    ...values(session.departments),
    ...values(session.departmentNames)
  ])];
  return {
    userId: String(session.userId || session.userid || "").trim(),
    unionId: String(session.unionId || session.unionid || "").trim(),
    name: String(session.name || "").trim() || "未知用户",
    departments,
    executive: departments.includes("总经办") || ["executive", "admin"].includes(String(session.role || "")),
    readonly: session.role === "readonly" || Boolean(session.readonly)
  };
}

export function requireInsightActor(data = {}) {
  if (!data.session) throw new UserInsightHttpError(401, "AUTH_SESSION_REQUIRED", "请先使用钉钉登录。");
  const actor = userInsightActor(data.session);
  if (!actor.executive && !actor.departments.some(department => ALLOWED_DEPARTMENTS.has(department))) {
    throw new UserInsightHttpError(403, "PERMISSION_READ_DENIED", "当前部门无权查看用户洞察。");
  }
  return actor;
}

export function requireWritable(actor) {
  if (actor.readonly) throw new UserInsightHttpError(403, "PERMISSION_WRITE_DENIED", "当前身份不能执行此操作。");
}

export function actorOwnsRule(actor, rule = {}) {
  if (actor.executive) return true;
  if (rule.consumerAppId === "product-flow") return actor.departments.some(item => ["产品部", "产品团队"].includes(item));
  if (rule.consumerAppId === "ecommerce-operations") return actor.departments.some(item => ["运营部", "运营"].includes(item));
  return actor.departments.includes(String(rule.ownerDepartment || ""));
}

export function assertRuleOwner(actor, rule) {
  requireWritable(actor);
  if (!actorOwnsRule(actor, rule)) {
    throw new UserInsightHttpError(403, "PERMISSION_RULE_WRITE_DENIED", "只能维护本部门 App 的洞察规则。");
  }
}

export function assertCategoryManager(actor) {
  requireWritable(actor);
  if (actor.executive || actor.departments.some(item => ["产品部", "产品团队", "运营部", "运营"].includes(item))) return;
  throw new UserInsightHttpError(403, "PERMISSION_CATEGORY_WRITE_DENIED", "只有产品或运营负责人可以确认平台类目。");
}

export function assertExecutive(actor) {
  requireWritable(actor);
  if (!actor.executive) throw new UserInsightHttpError(403, "PERMISSION_EXECUTIVE_REQUIRED", "只有总经办可以登记采集设备。");
}
