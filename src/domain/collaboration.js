const KINDS = new Set(["handoff", "risk", "decision", "data_issue", "task"]);
const STATUSES = new Set([
  "pending_acceptance",
  "in_progress",
  "blocked",
  "pending_verification",
  "closed",
  "returned",
  "cancelled"
]);
const TERMINAL_STATUSES = new Set(["closed", "cancelled"]);
const IMPACT_LEVELS = new Set(["high", "medium", "low"]);
const DECISION_OUTCOMES = new Set(["recommended", "alternative", "custom"]);
const REASON_REQUIRED = new Set(["return", "block", "resume", "reopen", "cancel", "escalate"]);
const METADATA_FIELDS = new Set(["version", "updatedAt", "updatedBy"]);

function cleanText(value, maxLength = Infinity) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function iso(value, fallback = "") {
  if (!value) return fallback;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function uniqueStrings(values = []) {
  return [...new Set(values.map(value => cleanText(value)).filter(Boolean))];
}

function normalizeUser(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const user = {
    userId: cleanText(value.userId || value.userid, 120),
    unionId: cleanText(value.unionId || value.unionid, 120),
    name: cleanText(value.name, 120)
  };
  return user.userId || user.unionId || user.name ? user : null;
}

function normalizeDepartment(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const department = {
    id: cleanText(value.id || value.deptId, 120),
    name: cleanText(value.name, 120)
  };
  return department.id || department.name ? department : null;
}

function userKey(value) {
  const user = normalizeUser(value);
  return user ? user.userId || user.unionId || user.name : "";
}

function departmentKey(value) {
  const department = normalizeDepartment(value);
  return department ? department.id || department.name : "";
}

function normalizeDepartments(values, ownerDepartment) {
  const ownerKey = departmentKey(ownerDepartment);
  const seen = new Set();
  const departments = [];
  for (const value of Array.isArray(values) ? values : []) {
    const department = normalizeDepartment(value);
    const key = departmentKey(department);
    if (!key || key === ownerKey || seen.has(key)) continue;
    seen.add(key);
    departments.push(department);
    if (departments.length === 10) break;
  }
  return departments;
}

function normalizeEvidence(values) {
  return (Array.isArray(values) ? values : []).slice(0, 20).map(value => ({
    label: cleanText(value?.label, 80),
    value: cleanText(value?.value, 300),
    basis: cleanText(value?.basis, 160),
    asOf: cleanText(value?.asOf, 40)
  })).filter(value => value.label && value.value);
}

function normalizeSource(value = {}) {
  return {
    appId: cleanText(value.appId, 80),
    entityType: cleanText(value.entityType, 80),
    entityId: cleanText(value.entityId, 160),
    sourceRecordId: cleanText(value.sourceRecordId, 160),
    sourceRoute: cleanText(value.sourceRoute, 500),
    sourceLabel: cleanText(value.sourceLabel, 160)
  };
}

function normalizeStrategyLinks(value = {}) {
  return {
    strategyId: cleanText(value.strategyId, 160),
    requiredResultId: cleanText(value.requiredResultId, 160),
    projectId: cleanText(value.projectId, 160)
  };
}

function actorUser(actor = {}) {
  return normalizeUser(actor);
}

function actorDepartment(actor = {}) {
  const ids = uniqueStrings(actor.departmentIds || actor.deptIds || []);
  const names = uniqueStrings(actor.departmentNames || actor.departments || [actor.department]);
  return normalizeDepartment({ id: ids[0] || "", name: names[0] || "" });
}

function actorUserMatches(identity, actor = {}) {
  const wanted = normalizeUser(identity);
  if (!wanted) return false;
  return Boolean(
    (wanted.userId && wanted.userId === cleanText(actor.userId || actor.userid))
    || (wanted.unionId && wanted.unionId === cleanText(actor.unionId || actor.unionid))
    || (!wanted.userId && !wanted.unionId && wanted.name && wanted.name === cleanText(actor.name))
  );
}

function actorDepartmentMatches(identity, actor = {}) {
  const wanted = normalizeDepartment(identity);
  if (!wanted) return false;
  const ids = uniqueStrings(actor.departmentIds || actor.deptIds || []);
  const names = uniqueStrings(actor.departmentNames || actor.departments || [actor.department]);
  return Boolean((wanted.id && ids.includes(wanted.id)) || (wanted.name && names.includes(wanted.name)));
}

function requesterMatches(item, actor) {
  return actorUserMatches(item.requesterUser, actor) || actorDepartmentMatches(item.requesterDepartment, actor);
}

function ownerMatches(item, actor) {
  return actorUserMatches(item.ownerUser, actor) || actorDepartmentMatches(item.ownerDepartment, actor);
}

function partnerMatches(item, actor) {
  return item.partnerDepartments.some(department => actorDepartmentMatches(department, actor));
}

function domainError(message, code = "COLLABORATION_TRANSITION_INVALID") {
  const error = new Error(message);
  error.code = code;
  return error;
}

function changedFields(before, after) {
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !METADATA_FIELDS.has(key))
    .filter(key => JSON.stringify(before[key] ?? null) !== JSON.stringify(after[key] ?? null))
    .sort();
}

function actionId(itemId, idempotencyKey, action, at) {
  const suffix = cleanText(idempotencyKey, 160) || `${action}-${at.replaceAll(/[^0-9]/g, "")}`;
  return `activity:${itemId}:${suffix}`;
}

export function normalizeCollaborationDraft(input = {}, context = {}) {
  const now = iso(context.now || input.updatedAt || input.createdAt || new Date(), new Date().toISOString());
  const ownerDepartment = normalizeDepartment(input.ownerDepartment);
  const status = STATUSES.has(input.status) ? input.status : "pending_acceptance";
  const version = Number.isInteger(Number(input.version)) && Number(input.version) > 0 ? Number(input.version) : 1;
  return {
    id: cleanText(input.id, 160),
    idempotencyKey: cleanText(input.idempotencyKey, 240),
    kind: KINDS.has(input.kind) ? input.kind : "task",
    title: cleanText(input.title, 120),
    description: cleanText(input.description, 2000),
    requestedAction: cleanText(input.requestedAction, 500),
    impactLevel: IMPACT_LEVELS.has(input.impactLevel) ? input.impactLevel : "medium",
    businessImpact: cleanText(input.businessImpact, 1000),
    status,
    requesterUser: normalizeUser(input.requesterUser),
    requesterDepartment: normalizeDepartment(input.requesterDepartment),
    ownerUser: normalizeUser(input.ownerUser),
    ownerDepartment,
    decisionOwner: normalizeUser(input.decisionOwner),
    partnerDepartments: normalizeDepartments(input.partnerDepartments, ownerDepartment),
    dueAt: iso(input.dueAt),
    blockedReason: cleanText(input.blockedReason, 1000),
    coordinationNeed: cleanText(input.coordinationNeed, 1000),
    expectedResumeAt: iso(input.expectedResumeAt),
    completionSummary: cleanText(input.completionSummary, 2000),
    decisionOutcome: DECISION_OUTCOMES.has(input.decisionOutcome) ? input.decisionOutcome : "",
    decisionSummary: cleanText(input.decisionSummary, 2000),
    source: normalizeSource(input.source),
    strategyLinks: normalizeStrategyLinks(input.strategyLinks),
    evidence: normalizeEvidence(input.evidence),
    relatedItemId: cleanText(input.relatedItemId, 160),
    dingTodo: input.dingTodo && typeof input.dingTodo === "object" && !Array.isArray(input.dingTodo)
      ? { ...input.dingTodo }
      : null,
    version,
    createdAt: iso(input.createdAt, now),
    createdBy: normalizeUser(input.createdBy || input.requesterUser),
    updatedAt: now,
    updatedBy: normalizeUser(input.updatedBy || input.createdBy || input.requesterUser),
    returnedAt: iso(input.returnedAt),
    returnReason: cleanText(input.returnReason, 1000),
    blockedAt: iso(input.blockedAt),
    resumedAt: iso(input.resumedAt),
    resumeSummary: cleanText(input.resumeSummary, 1000),
    submittedAt: iso(input.submittedAt),
    closedAt: iso(input.closedAt),
    cancelledAt: iso(input.cancelledAt),
    escalatedAt: iso(input.escalatedAt),
    escalationReason: cleanText(input.escalationReason, 1000),
    archivedAt: iso(input.archivedAt),
    archivedBy: normalizeUser(input.archivedBy),
    archiveReason: cleanText(input.archiveReason, 1000)
  };
}

export function canReadCollaborationItem(input, actor = {}) {
  const item = normalizeCollaborationDraft(input);
  if (actor.executive) return true;
  return actorUserMatches(item.requesterUser, actor)
    || actorUserMatches(item.ownerUser, actor)
    || actorUserMatches(item.decisionOwner, actor)
    || actorDepartmentMatches(item.requesterDepartment, actor)
    || actorDepartmentMatches(item.ownerDepartment, actor)
    || partnerMatches(item, actor);
}

export function collaborationTransitionsFor(input, actor = {}) {
  const item = normalizeCollaborationDraft(input);
  if (actor.readonly || item.archivedAt || TERMINAL_STATUSES.has(item.status)) return [];
  const transitions = new Set();
  const requester = requesterMatches(item, actor);
  const owner = ownerMatches(item, actor);
  const receivingDepartment = actorDepartmentMatches(item.ownerDepartment, actor);

  if (item.kind === "decision" && item.status === "pending_acceptance") {
    if (actorUserMatches(item.decisionOwner, actor)) transitions.add("decide").add("return");
  } else if (item.status === "pending_acceptance" && receivingDepartment) {
    transitions.add("accept").add("return");
  }

  if (item.status === "returned" && (requester || actor.executive)) transitions.add("resubmit");
  if (item.status === "in_progress" && actorUserMatches(item.ownerUser, actor)) transitions.add("block").add("submit");
  if (item.status === "blocked" && actorUserMatches(item.ownerUser, actor)) transitions.add("resume");
  if (item.status === "pending_verification" && (requester || actor.executive)) transitions.add("verify").add("reopen");
  if (["pending_acceptance", "returned", "in_progress", "blocked"].includes(item.status) && (requester || actor.executive)) transitions.add("cancel");
  if (["pending_acceptance", "returned", "in_progress", "blocked", "pending_verification"].includes(item.status) && actor.executive) transitions.add("escalate");

  if (!owner && item.status === "in_progress") transitions.delete("block").delete("submit");
  return [...transitions];
}

export function applyCollaborationTransition(input, request = {}, actor = {}, now = new Date()) {
  const item = normalizeCollaborationDraft(input);
  const transition = cleanText(request.transition, 60);
  if (!collaborationTransitionsFor(item, actor).includes(transition)) {
    throw domainError("当前状态或身份不能执行此协同动作。");
  }
  const reason = cleanText(request.reason, 1000);
  if (REASON_REQUIRED.has(transition) && !reason) throw domainError("请填写执行此动作的原因。");
  const fields = request.fields && typeof request.fields === "object" && !Array.isArray(request.fields) ? request.fields : {};
  const at = iso(now, new Date().toISOString());
  const next = { ...item };

  if (transition === "accept") {
    const ownerUser = normalizeUser(fields.ownerUser || item.ownerUser);
    if (!ownerUser?.userId && !ownerUser?.unionId) throw domainError("确认接收前请选择具有稳定身份的主负责人。");
    next.ownerUser = ownerUser;
    next.status = "in_progress";
  } else if (transition === "return") {
    next.status = "returned";
    next.returnReason = reason;
    next.returnedAt = at;
  } else if (transition === "resubmit") {
    next.status = "pending_acceptance";
  } else if (transition === "block") {
    next.status = "blocked";
    next.blockedReason = reason;
    next.coordinationNeed = cleanText(fields.coordinationNeed, 1000);
    next.expectedResumeAt = iso(fields.expectedResumeAt);
    next.blockedAt = at;
  } else if (transition === "resume") {
    next.status = "in_progress";
    next.resumeSummary = reason;
    next.resumedAt = at;
  } else if (transition === "submit") {
    const completionSummary = cleanText(fields.completionSummary || request.completionSummary, 2000);
    if (!completionSummary) throw domainError("提交验收前请填写完成结果。");
    next.status = "pending_verification";
    next.completionSummary = completionSummary;
    next.submittedAt = at;
  } else if (transition === "verify") {
    next.status = "closed";
    next.closedAt = at;
  } else if (transition === "reopen") {
    next.status = "in_progress";
    next.returnReason = reason;
    next.closedAt = "";
  } else if (transition === "cancel") {
    next.status = "cancelled";
    next.cancelledAt = at;
  } else if (transition === "escalate") {
    next.escalatedAt = at;
    next.escalationReason = reason;
    next.coordinationNeed = cleanText(fields.coordinationNeed || reason, 1000);
  } else if (transition === "decide") {
    const decisionOutcome = cleanText(fields.decisionOutcome, 40);
    const decisionSummary = cleanText(fields.decisionSummary, 2000);
    if (!DECISION_OUTCOMES.has(decisionOutcome) || !decisionSummary) {
      throw domainError("请填写有效的决策结果和决策说明。");
    }
    next.status = "closed";
    next.decisionOutcome = decisionOutcome;
    next.decisionSummary = decisionSummary;
    next.closedAt = at;
  }

  const changed = changedFields(item, next);
  const updatedBy = actorUser(actor);
  next.version = Number(item.version || 0) + 1;
  next.updatedAt = at;
  next.updatedBy = updatedBy;
  const normalizedNext = normalizeCollaborationDraft(next, { now: at });
  const activity = {
    id: actionId(item.id, request.idempotencyKey, transition, at),
    itemId: item.id,
    idempotencyKey: cleanText(request.idempotencyKey, 160),
    action: transition,
    fromStatus: item.status,
    toStatus: normalizedNext.status,
    actorUser: updatedBy,
    actorDepartment: actorDepartment(actor),
    reason,
    changedFields: changed,
    createdAt: at
  };
  return { item: normalizedNext, activity };
}

function viewMatches(item, view, actor, executiveIds) {
  if (view === "pending_acceptance") return item.status === "pending_acceptance" && actorDepartmentMatches(item.ownerDepartment, actor);
  if (view === "in_progress") return ["in_progress", "blocked"].includes(item.status) && ownerMatches(item, actor);
  if (view === "waiting_others") return requesterMatches(item, actor) && !TERMINAL_STATUSES.has(item.status);
  if (view === "pending_verification") return item.status === "pending_verification" && requesterMatches(item, actor);
  if (view === "participating") return partnerMatches(item, actor);
  if (view === "completed") return TERMINAL_STATUSES.has(item.status);
  if (view === "executive") return Boolean(actor.executive && executiveIds.has(item.id));
  return true;
}

export function filterCollaborationItems(values = [], query = {}, actor = {}, now = new Date()) {
  const items = values.map(value => normalizeCollaborationDraft(value));
  const view = cleanText(query.view) || "my_scope";
  const executiveIds = new Set(view === "executive" && actor.executive ? buildExecutiveActions(items, now).map(action => action.itemId) : []);
  const search = cleanText(query.query, 80).toLowerCase();
  const statuses = new Set(Array.isArray(query.status) ? query.status : query.status ? [query.status] : []);
  const dueBefore = iso(query.dueBefore);

  return items.filter(item => {
    if (!canReadCollaborationItem(item, actor)) return false;
    if (item.archivedAt && !query.includeArchived) return false;
    if (!viewMatches(item, view, actor, executiveIds)) return false;
    if (statuses.size && !statuses.has(item.status)) return false;
    if (query.appId && item.source.appId !== query.appId) return false;
    if (query.kind && item.kind !== query.kind) return false;
    if (query.impactLevel && item.impactLevel !== query.impactLevel) return false;
    if (query.departmentId && ![
      departmentKey(item.requesterDepartment),
      departmentKey(item.ownerDepartment),
      ...item.partnerDepartments.map(departmentKey)
    ].includes(query.departmentId)) return false;
    if (dueBefore && (!item.dueAt || item.dueAt > dueBefore)) return false;
    if (search && ![
      item.title,
      item.source.sourceLabel,
      item.ownerUser?.name,
      item.ownerDepartment?.name,
      item.requesterDepartment?.name
    ].filter(Boolean).join(" ").toLowerCase().includes(search)) return false;
    return true;
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || right.id.localeCompare(left.id));
}

function daysOverdue(dueAt, now) {
  const due = Date.parse(dueAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(due) || !Number.isFinite(current) || due >= current) return 0;
  return Math.max(1, Math.ceil((current - due) / 86400000));
}

function hoursSince(value, now) {
  const start = Date.parse(value);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  return Number.isFinite(start) && Number.isFinite(current) ? Math.max(0, (current - start) / 3600000) : 0;
}

function crossDepartment(item) {
  const requester = departmentKey(item.requesterDepartment);
  const owner = departmentKey(item.ownerDepartment);
  return Boolean((requester && owner && requester !== owner) || item.partnerDepartments.length);
}

function executiveReason(item, now) {
  if (item.kind === "decision" && item.ownerDepartment?.name === "总经办") return ["decision_required", 1000];
  if (item.escalatedAt) return ["explicit_escalation", 950];
  if (item.impactLevel === "high" && item.status === "blocked") return ["high_impact_blocked", 900];
  const overdue = daysOverdue(item.dueAt, now);
  if (overdue && crossDepartment(item)) return ["overdue", 800 + Math.min(overdue, 60)];
  if (item.status === "blocked" && hoursSince(item.blockedAt || item.updatedAt, now) >= 24) return ["blocked_over_24h", 700];
  const linked = Object.values(item.strategyLinks).some(Boolean);
  if (linked && ["blocked", "returned"].includes(item.status)) return ["strategy_execution_gap", 600];
  return null;
}

const EXECUTIVE_LABELS = {
  decision_required: "待拍板",
  explicit_escalation: "已升级协调",
  high_impact_blocked: "高影响阻塞",
  overdue: "跨部门逾期",
  blocked_over_24h: "阻塞超过 24 小时",
  strategy_execution_gap: "战略执行缺口"
};

export function buildExecutiveActions(values = [], now = new Date()) {
  return values.map(value => normalizeCollaborationDraft(value)).flatMap(item => {
    if (item.archivedAt || TERMINAL_STATUSES.has(item.status)) return [];
    const reason = executiveReason(item, now);
    if (!reason) return [];
    const [reasonKey, score] = reason;
    return [{
      id: `executive-action:${item.id}`,
      itemId: item.id,
      reason: reasonKey,
      label: EXECUTIVE_LABELS[reasonKey],
      score,
      title: item.title,
      status: item.status,
      impactLevel: item.impactLevel,
      dueAt: item.dueAt,
      ownerDepartment: item.ownerDepartment,
      ownerUser: item.ownerUser,
      source: item.source,
      strategyLinks: item.strategyLinks,
      updatedAt: item.updatedAt,
      item
    }];
  }).sort((left, right) => right.score - left.score
    || String(left.dueAt || "9999").localeCompare(String(right.dueAt || "9999"))
    || right.updatedAt.localeCompare(left.updatedAt));
}
