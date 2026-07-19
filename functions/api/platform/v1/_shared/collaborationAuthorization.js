import { canReadCollaborationItem } from "../../../../../src/domain/collaboration.js";
import { CollaborationHttpError } from "./collaborationHttp.js";

function values(value) {
  return (Array.isArray(value) ? value : [value])
    .flatMap(entry => String(entry || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(entry => entry.trim())
    .filter(Boolean);
}

export function collaborationActor(session = {}) {
  const departmentNames = [...new Set([
    ...values(session.department),
    ...values(session.departmentName),
    ...values(session.departments),
    ...values(session.departmentNames)
  ])];
  const departmentIds = [...new Set([
    ...values(session.departmentId),
    ...values(session.departmentIds),
    ...values(session.deptId),
    ...values(session.deptIds)
  ])];
  return {
    userId: String(session.userId || session.userid || "").trim(),
    unionId: String(session.unionId || session.unionid || "").trim(),
    name: String(session.name || "").trim(),
    departmentIds,
    departmentNames,
    executive: departmentNames.includes("总经办") || ["executive", "admin"].includes(String(session.role || "")),
    readonly: session.role === "readonly" || Boolean(session.readonly)
  };
}

export function requesterIdentity(actor) {
  return {
    requesterUser: { userId: actor.userId, unionId: actor.unionId, name: actor.name },
    requesterDepartment: { id: actor.departmentIds[0] || actor.departmentNames[0] || "", name: actor.departmentNames[0] || "" }
  };
}

export function assertCanRead(item, actor) {
  if (canReadCollaborationItem(item, actor)) return;
  throw new CollaborationHttpError(404, "COLLABORATION_ITEM_NOT_FOUND", "协同事项不存在或当前无权查看。");
}

export function assertCanEdit(item, actor) {
  assertCanRead(item, actor);
  const requesterUser = item.requesterUser || {};
  const requesterDepartment = item.requesterDepartment || {};
  const userMatch = (requesterUser.userId && requesterUser.userId === actor.userId)
    || (requesterUser.unionId && requesterUser.unionId === actor.unionId);
  const departmentMatch = (requesterDepartment.id && actor.departmentIds.includes(requesterDepartment.id))
    || (requesterDepartment.name && actor.departmentNames.includes(requesterDepartment.name));
  if (actor.executive || userMatch || departmentMatch) return;
  throw new CollaborationHttpError(403, "PERMISSION_WRITE_DENIED", "当前身份不能执行此操作。");
}

export function participantSubjects(actor) {
  return [...new Set([
    actor.userId,
    actor.unionId,
    ...actor.departmentIds,
    ...actor.departmentNames
  ].filter(Boolean))];
}
