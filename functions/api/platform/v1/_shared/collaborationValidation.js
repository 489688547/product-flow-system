import { normalizeCollaborationDraft } from "../../../../../src/domain/collaboration.js";
import { CollaborationHttpError } from "./collaborationHttp.js";

const CREATE_FIELDS = new Set([
  "idempotencyKey", "kind", "title", "description", "requestedAction", "impactLevel", "businessImpact",
  "ownerDepartment", "ownerUser", "decisionOwner", "partnerDepartments", "dueAt", "source", "strategyLinks",
  "evidence", "relatedItemId", "requesterUser", "requesterDepartment"
]);
const PATCH_FIELDS = new Set([
  "title", "description", "requestedAction", "impactLevel", "businessImpact", "ownerDepartment", "ownerUser",
  "decisionOwner", "partnerDepartments", "dueAt", "evidence", "source", "strategyLinks", "archived"
]);
const KINDS = new Set(["handoff", "risk", "decision", "data_issue", "task"]);
const IMPACT_LEVELS = new Set(["high", "medium", "low"]);

function invalid(message = "请检查协同事项的必填信息。", details) {
  throw new CollaborationHttpError(400, "COLLABORATION_ITEM_INVALID", message, details);
}

function assertKnownFields(value, allowed) {
  const unknown = Object.keys(value).filter(key => !allowed.has(key));
  if (unknown.length) invalid("协同事项包含不支持的字段。", { fields: unknown });
}

function validDate(value) {
  return Boolean(value && Number.isFinite(Date.parse(value)) && /(?:z|[+-]\d{2}:?\d{2})$/i.test(String(value)));
}

function validSourceRoute(value) {
  if (!value) return true;
  return String(value).startsWith("#/") || (String(value).startsWith("/") && !String(value).startsWith("//"));
}

export function validateCreateInput(body, identity, now = new Date()) {
  assertKnownFields(body, CREATE_FIELDS);
  const requiredText = ["idempotencyKey", "kind", "title", "requestedAction", "businessImpact"];
  if (requiredText.some(key => !String(body[key] || "").trim())) invalid();
  if (!KINDS.has(body.kind) || !IMPACT_LEVELS.has(body.impactLevel)) invalid();
  if (!body.ownerDepartment || typeof body.ownerDepartment !== "object") invalid();
  if (!String(body.ownerDepartment.id || body.ownerDepartment.name || "").trim()) invalid();
  if (!validDate(body.dueAt)) invalid("截止时间必须是带时区的有效时间。");
  if (!validSourceRoute(body.source?.sourceRoute)) invalid("来源路由必须是应用内部路径。");
  if (body.kind === "decision" && !body.decisionOwner) invalid("决策事项必须指定决策人。");
  if (Array.isArray(body.partnerDepartments) && body.partnerDepartments.length > 10) invalid("协同部门最多 10 个。");
  if (Array.isArray(body.evidence) && body.evidence.length > 20) invalid("证据最多 20 项。");

  const item = normalizeCollaborationDraft({
    ...body,
    ...identity,
    id: globalThis.crypto?.randomUUID?.() || `collab_${Date.now().toString(36)}`,
    status: "pending_acceptance",
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy: identity.requesterUser,
    updatedBy: identity.requesterUser
  }, { now });
  if (!item.idempotencyKey || item.idempotencyKey.length > 240 || !item.title || !item.requestedAction || !item.businessImpact) invalid();
  if (JSON.stringify(item).length > 32768) invalid("单个协同事项内容不能超过 32KB。");
  return item;
}

export function validatePatchInput(body, item, actor, now = new Date()) {
  if (!Number.isInteger(body.version) || !body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) invalid();
  assertKnownFields(body.patch, PATCH_FIELDS);
  const reason = String(body.reason || "").trim().slice(0, 1000);
  if ((["closed", "cancelled"].includes(item.status) && body.patch.archived !== true) || item.archivedAt) invalid("关闭、取消或归档事项不能普通编辑。");
  const sensitive = ["ownerDepartment", "ownerUser", "dueAt"].some(key => key in body.patch);
  if (item.status !== "pending_acceptance" && sensitive && !reason) invalid("事项接收后修改责任或截止时间必须填写原因。");
  if (body.patch.dueAt && !validDate(body.patch.dueAt)) invalid("截止时间必须是带时区的有效时间。");
  if (body.patch.source?.sourceRoute && !validSourceRoute(body.patch.source.sourceRoute)) invalid("来源路由必须是应用内部路径。");
  if (body.patch.archived === true && !reason) invalid("归档事项必须填写原因。");

  const patch = { ...body.patch };
  delete patch.archived;
  const next = normalizeCollaborationDraft({
    ...item,
    ...patch,
    archivedAt: body.patch.archived === true ? now : item.archivedAt,
    archivedBy: body.patch.archived === true ? { userId: actor.userId, unionId: actor.unionId, name: actor.name } : item.archivedBy,
    archiveReason: body.patch.archived === true ? reason : item.archiveReason,
    version: item.version + 1,
    updatedAt: now,
    updatedBy: { userId: actor.userId, unionId: actor.unionId, name: actor.name }
  }, { now });
  if (JSON.stringify(next).length > 32768) invalid("单个协同事项内容不能超过 32KB。");
  return { expectedVersion: body.version, item: next, reason, action: body.patch.archived === true ? "archive" : "update" };
}

export function validateTransitionInput(body) {
  if (!Number.isInteger(body.version) || !String(body.transition || "").trim() || !String(body.idempotencyKey || "").trim()) {
    throw new CollaborationHttpError(400, "COLLABORATION_TRANSITION_INVALID", "当前状态不能执行此动作。");
  }
  return {
    version: body.version,
    transition: String(body.transition).trim(),
    idempotencyKey: String(body.idempotencyKey).trim().slice(0, 160),
    reason: String(body.reason || "").trim().slice(0, 1000),
    fields: body.fields && typeof body.fields === "object" && !Array.isArray(body.fields) ? body.fields : {}
  };
}
