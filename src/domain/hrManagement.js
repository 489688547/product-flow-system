const COLLECTIONS = [
  "employees",
  "assignments",
  "roleAssignments",
  "lifecycleEvents",
  "performanceTemplates",
  "performanceCycles",
  "performanceItems",
  "evidenceSnapshots",
  "auditLogs"
];

const ACTION_TYPES = new Set([
  "upsert_employee",
  "upsert_assignment",
  "upsert_lifecycle_event",
  "transition_lifecycle_event",
  "upsert_performance_template",
  "upsert_performance_cycle",
  "upsert_performance_item",
  "submit_self_review",
  "submit_manager_review",
  "request_performance_review",
  "resolve_performance_review",
  "freeze_performance_cycle"
]);

function numeric(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rounded(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function cleanText(value) {
  return String(value || "").trim();
}

function cleanRecord(record = {}) {
  return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined));
}

function normalizeEmployee(record = {}) {
  const employee = {
    ...cleanRecord(record),
    id: cleanText(record.id),
    userId: cleanText(record.userId),
    unionId: cleanText(record.unionId),
    name: cleanText(record.name),
    employmentStatus: cleanText(record.employmentStatus) || "draft"
  };
  if (employee.employmentStatus === "active" && !employee.userId && !employee.unionId) {
    throw new Error("正式员工必须绑定钉钉稳定身份。");
  }
  return employee;
}

function normalizeAssignment(record = {}) {
  return {
    ...cleanRecord(record),
    id: cleanText(record.id),
    employeeId: cleanText(record.employeeId),
    managerEmployeeId: cleanText(record.managerEmployeeId),
    departmentName: cleanText(record.departmentName),
    positionName: cleanText(record.positionName),
    effectiveFrom: cleanText(record.effectiveFrom),
    effectiveTo: cleanText(record.effectiveTo),
    status: cleanText(record.status) || "active"
  };
}

function normalizePerformanceItem(record = {}) {
  return {
    ...cleanRecord(record),
    id: cleanText(record.id),
    cycleId: cleanText(record.cycleId),
    employeeId: cleanText(record.employeeId),
    title: cleanText(record.title),
    weight: numeric(record.weight) ?? 0,
    selfScore: numeric(record.selfScore),
    suggestedScore: numeric(record.suggestedScore),
    managerScore: numeric(record.managerScore),
    status: cleanText(record.status) || "draft"
  };
}

function normalizeCycle(record = {}) {
  return {
    ...cleanRecord(record),
    id: cleanText(record.id),
    name: cleanText(record.name),
    status: cleanText(record.status) || "draft",
    reviewRequests: Array.isArray(record.reviewRequests) ? record.reviewRequests.map(cleanRecord) : []
  };
}

function normalizeCollection(name, values) {
  const records = Array.isArray(values) ? values : [];
  if (name === "employees") return records.map(normalizeEmployee);
  if (name === "assignments") return records.map(normalizeAssignment);
  if (name === "performanceItems") return records.map(normalizePerformanceItem);
  if (name === "performanceCycles") return records.map(normalizeCycle);
  return records.map(cleanRecord);
}

function upsert(records, record) {
  if (!record.id) throw new Error("记录缺少稳定 ID。");
  return records.some(item => item.id === record.id)
    ? records.map(item => item.id === record.id ? { ...item, ...record } : item)
    : [record, ...records];
}

function actionTime(action) {
  return cleanText(action.now) || new Date().toISOString();
}

function appendAudit(state, action, entityType, entityId) {
  const createdAt = actionTime(action);
  return [{
    id: `hr-audit-${createdAt}-${entityType}-${entityId}`,
    entityType,
    entityId,
    action: action.type,
    actor: cleanText(action.actor) || "系统",
    reason: cleanText(action.reason),
    createdAt
  }, ...state.auditLogs];
}

function withVersion(state, changes, action, entityType, entityId) {
  return normalizeHrManagementState({
    ...state,
    ...changes,
    version: state.version + 1,
    updatedAt: actionTime(action),
    auditLogs: appendAudit(state, action, entityType, entityId)
  });
}

function itemsForEmployee(state, action) {
  const employeeId = cleanText(action.employeeId);
  const cycleId = cleanText(action.cycleId);
  return state.performanceItems.filter(item => item.employeeId === employeeId && item.cycleId === cycleId);
}

function scoreUpdates(items = [], field, commentField) {
  const byId = new Map(items.map(item => [cleanText(item.itemId), item]));
  return { byId, field, commentField };
}

function applyScoreUpdates(records, action, field, commentField, status) {
  const updates = scoreUpdates(action.items, field, commentField);
  const eligible = new Set(itemsForEmployee({ performanceItems: records }, action).map(item => item.id));
  if (!eligible.size) throw new Error("当前员工在该周期没有可评分项目。");
  return records.map(item => {
    const update = updates.byId.get(item.id);
    if (!update || !eligible.has(item.id)) return item;
    const score = numeric(update[field]);
    if (score === null || score < 0 || score > 100) throw new Error("绩效分数必须在 0 到 100 之间。");
    return { ...item, [field]: score, [commentField]: cleanText(update[commentField]), status };
  });
}

export function createEmptyHrManagementState() {
  return {
    version: 0,
    updatedAt: "",
    sourceMode: "empty",
    employees: [],
    assignments: [],
    roleAssignments: [],
    lifecycleEvents: [],
    performanceTemplates: [],
    performanceCycles: [],
    performanceItems: [],
    evidenceSnapshots: [],
    auditLogs: []
  };
}

export function normalizeHrManagementState(input = {}) {
  const base = createEmptyHrManagementState();
  const state = {
    ...base,
    ...input,
    version: Math.max(0, Math.trunc(Number(input.version) || 0)),
    updatedAt: cleanText(input.updatedAt),
    sourceMode: cleanText(input.sourceMode) || base.sourceMode
  };
  for (const name of COLLECTIONS) state[name] = normalizeCollection(name, input[name]);
  return state;
}

export function activeAssignment(assignments = [], employeeId, atDate) {
  const day = cleanText(atDate);
  return assignments
    .map(normalizeAssignment)
    .filter(item => item.employeeId === employeeId
      && item.effectiveFrom <= day
      && (!item.effectiveTo || item.effectiveTo >= day)
      && item.status !== "cancelled")
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0] || null;
}

export function validatePerformanceItems(items = []) {
  const normalized = items.map(normalizePerformanceItem);
  const totalWeight = rounded(normalized.reduce((sum, item) => sum + item.weight, 0));
  const errors = [];
  if (totalWeight !== 100) errors.push(`绩效项目权重合计必须为 100%，当前为 ${totalWeight}%。`);
  for (const item of normalized) {
    const rule = item.scoringRule;
    if (!rule || !Number.isInteger(Number(rule.version)) || !cleanText(rule.metricCode)) {
      errors.push(`${item.title || item.id || "未命名项目"}缺少版本化评分规则。`);
    }
  }
  return { valid: errors.length === 0, errors, totalWeight };
}

export function computeSuggestedScore(item = {}, evidence = {}) {
  const rule = item.scoringRule || {};
  const metricCode = cleanText(rule.metricCode);
  const value = numeric(evidence.metrics?.[metricCode]);
  if (!metricCode || value === null) {
    return {
      score: null,
      explanation: `缺少 ${metricCode || "评分指标"}，无法计算系统建议分。`,
      missing: [metricCode || "metricCode"]
    };
  }
  const target = numeric(rule.targetValue);
  const fullScore = numeric(rule.fullScore) ?? 100;
  if (target === null || target <= 0 || fullScore <= 0) {
    return { score: null, explanation: "评分规则缺少有效目标值。", missing: ["targetValue"] };
  }
  const score = rounded(Math.max(0, Math.min(fullScore, value / target * fullScore)));
  return {
    score,
    explanation: `${metricCode} 当前 ${value}，目标 ${target}，按规则 v${rule.version} 计算为 ${score} 分。`,
    missing: []
  };
}

export function reduceHrManagementState(input, action = {}) {
  const state = normalizeHrManagementState(input);
  if (!ACTION_TYPES.has(action.type)) throw new Error(`未知人事动作：${cleanText(action.type) || "空"}。`);

  if (action.type === "upsert_employee") {
    const record = normalizeEmployee({ ...action.record, updatedAt: actionTime(action) });
    return withVersion(state, { employees: upsert(state.employees, record) }, action, "employee", record.id);
  }
  if (action.type === "upsert_assignment") {
    const record = normalizeAssignment({ ...action.record, updatedAt: actionTime(action) });
    return withVersion(state, { assignments: upsert(state.assignments, record) }, action, "assignment", record.id);
  }
  if (action.type === "upsert_lifecycle_event") {
    const record = { ...cleanRecord(action.record), status: cleanText(action.record?.status) || "draft", updatedAt: actionTime(action) };
    return withVersion(state, { lifecycleEvents: upsert(state.lifecycleEvents, record) }, action, "lifecycle_event", record.id);
  }
  if (action.type === "transition_lifecycle_event") {
    const id = cleanText(action.id);
    if (!state.lifecycleEvents.some(item => item.id === id)) throw new Error("人事异动不存在。");
    const lifecycleEvents = state.lifecycleEvents.map(item => item.id === id ? { ...item, status: cleanText(action.status), updatedAt: actionTime(action) } : item);
    return withVersion(state, { lifecycleEvents }, action, "lifecycle_event", id);
  }
  if (action.type === "upsert_performance_template") {
    const record = { ...cleanRecord(action.record), updatedAt: actionTime(action) };
    return withVersion(state, { performanceTemplates: upsert(state.performanceTemplates, record) }, action, "performance_template", record.id);
  }
  if (action.type === "upsert_performance_cycle") {
    const record = normalizeCycle({ ...action.record, updatedAt: actionTime(action) });
    return withVersion(state, { performanceCycles: upsert(state.performanceCycles, record) }, action, "performance_cycle", record.id);
  }
  if (action.type === "upsert_performance_item") {
    const record = normalizePerformanceItem({ ...action.record, updatedAt: actionTime(action) });
    return withVersion(state, { performanceItems: upsert(state.performanceItems, record) }, action, "performance_item", record.id);
  }
  if (action.type === "submit_self_review") {
    const performanceItems = applyScoreUpdates(state.performanceItems, action, "selfScore", "selfComment", "self_submitted");
    return withVersion(state, { performanceItems }, action, "performance_cycle", cleanText(action.cycleId));
  }
  if (action.type === "submit_manager_review") {
    const performanceItems = applyScoreUpdates(state.performanceItems, action, "managerScore", "managerComment", "manager_submitted");
    const performanceCycles = state.performanceCycles.map(cycle => cycle.id === action.cycleId ? { ...cycle, status: "manager_submitted" } : cycle);
    return withVersion(state, { performanceItems, performanceCycles }, action, "performance_cycle", cleanText(action.cycleId));
  }
  if (action.type === "request_performance_review") {
    const cycleId = cleanText(action.cycleId);
    const employeeId = cleanText(action.employeeId);
    const cycle = state.performanceCycles.find(item => item.id === cycleId);
    if (!cycle) throw new Error("绩效周期不存在。");
    if (cycle.reviewRequests.some(item => item.employeeId === employeeId)) throw new Error("每个终评版本仅能发起一次复核。");
    const request = { employeeId, reason: cleanText(action.reason), status: "pending", requestedAt: actionTime(action) };
    const performanceCycles = state.performanceCycles.map(item => item.id === cycleId ? { ...item, status: "review_pending", reviewRequests: [...item.reviewRequests, request] } : item);
    return withVersion(state, { performanceCycles }, action, "performance_cycle", cycleId);
  }
  if (action.type === "resolve_performance_review") {
    const cycleId = cleanText(action.cycleId);
    const employeeId = cleanText(action.employeeId);
    const performanceCycles = state.performanceCycles.map(cycle => cycle.id === cycleId ? {
      ...cycle,
      status: "manager_submitted",
      reviewRequests: cycle.reviewRequests.map(item => item.employeeId === employeeId ? { ...item, status: "resolved", resolution: cleanText(action.resolution), resolvedAt: actionTime(action) } : item)
    } : cycle);
    return withVersion(state, { performanceCycles }, action, "performance_cycle", cycleId);
  }

  const cycleId = cleanText(action.cycleId);
  const cycle = state.performanceCycles.find(item => item.id === cycleId);
  if (!cycle) throw new Error("绩效周期不存在。");
  if (cycle.reviewRequests.some(item => item.status === "pending")) throw new Error("仍有待处理复核，不能冻结绩效。");
  const items = state.performanceItems.filter(item => item.cycleId === cycleId);
  const employeeIds = [...new Set(items.map(item => item.employeeId))];
  for (const employeeId of employeeIds) {
    const validation = validatePerformanceItems(items.filter(item => item.employeeId === employeeId));
    if (!validation.valid) throw new Error(validation.errors[0]);
  }
  if (!items.length || items.some(item => item.selfScore === null || item.managerScore === null)) {
    throw new Error("绩效项目尚未完成员工自评和主管终评。");
  }
  const frozenSnapshot = {
    cycleId,
    frozenAt: actionTime(action),
    frozenBy: cleanText(action.actor) || "系统",
    items: items.map(item => ({
      itemId: item.id,
      employeeId: item.employeeId,
      weight: item.weight,
      selfScore: item.selfScore,
      suggestedScore: item.suggestedScore,
      managerScore: item.managerScore
    }))
  };
  const performanceCycles = state.performanceCycles.map(item => item.id === cycleId ? { ...item, status: "frozen", frozenSnapshot } : item);
  return withVersion(state, { performanceCycles }, action, "performance_cycle", cycleId);
}

export function buildHrOverview(input, viewer = {}, now = new Date()) {
  const state = normalizeHrManagementState(input);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now);
  const employeeId = cleanText(viewer.employeeId);
  const myItems = state.performanceItems.filter(item => item.employeeId === employeeId);
  const activeEvents = state.lifecycleEvents.filter(item => !["completed", "cancelled"].includes(item.status));
  return {
    counts: {
      myPerformanceItems: myItems.length,
      activeLifecycleEvents: activeEvents.length,
      pendingSelfReviews: myItems.filter(item => item.selfScore === null).length,
      pendingReviewRequests: state.performanceCycles.reduce((sum, cycle) => sum + cycle.reviewRequests.filter(item => item.status === "pending").length, 0)
    },
    priorities: myItems.filter(item => item.selfScore === null).map(item => ({ id: item.id, type: "self_review", title: item.title || "绩效自评" })),
    risks: activeEvents.filter(item => item.effectiveDate && item.effectiveDate <= today).map(item => ({ id: item.id, type: "lifecycle_due", title: item.title || "人事异动待生效" }))
  };
}
