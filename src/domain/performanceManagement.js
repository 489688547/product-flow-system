const COLLECTIONS = ["templates", "managerAssignments", "assessments", "reviewRequests", "auditLogs"];

const clean = value => String(value || "").trim();
const score = value => Number.isFinite(Number(value)) ? Number(value) : null;
const idFor = prefix => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

function audit(state, action, entityId) {
  const timestamp = action.timestamp || new Date().toISOString();
  return { ...state, revision: state.revision + 1, updatedAt: timestamp, auditLogs: [{ id: idFor("perf-audit"), action: action.type, actorId: clean(action.actor?.userId || action.actor?.name), actorName: clean(action.actor?.name), entityId, createdAt: timestamp }, ...state.auditLogs] };
}

function upsert(items, record) {
  return items.some(item => item.id === record.id) ? items.map(item => item.id === record.id ? { ...item, ...record } : item) : [record, ...items];
}

export function createDefaultPerformanceState() {
  return { schemaVersion: "performance-management-v1", revision: 0, updatedAt: "", templates: [], managerAssignments: [], assessments: [], reviewRequests: [], auditLogs: [] };
}

export function normalizePerformanceState(input = {}) {
  const base = createDefaultPerformanceState();
  const state = { ...base, ...input, revision: Number(input.revision) || 0 };
  for (const key of COLLECTIONS) state[key] = Array.isArray(input[key]) ? input[key].map(item => ({ ...item })) : [];
  return state;
}

export function validateAssessmentTemplate(template = {}) {
  const total = (template.items || []).reduce((sum, item) => sum + (Number(item.weight) || 0), 0);
  return total === 100 ? [] : ["考核项权重合计必须为 100%"];
}

export function calculateSuggestedScore(items = []) {
  if (!items.length || validateAssessmentTemplate({ items }).length) return null;
  let total = 0;
  for (const item of items) {
    if (item.formula !== "completion" || !(Number(item.target) > 0) || item.actual === null || item.actual === undefined || item.actual === "" || !Number.isFinite(Number(item.actual))) return null;
    total += Math.min(100, Math.max(0, Number(item.actual) / Number(item.target) * 100)) * Number(item.weight) / 100;
  }
  return Math.round(total * 100) / 100;
}

export function reducePerformanceState(input, action = {}) {
  const state = normalizePerformanceState(input);
  const timestamp = action.timestamp || new Date().toISOString();
  if (action.type === "upsert_template") {
    if (validateAssessmentTemplate(action.record).length) throw new Error("考核项权重合计必须为 100%");
    const record = { ...action.record, id: clean(action.record?.id) || idFor("template"), updatedAt: timestamp };
    return audit({ ...state, templates: upsert(state.templates, record) }, action, record.id);
  }
  if (action.type === "upsert_manager_assignment") {
    const record = { ...action.record, id: clean(action.record?.id) || idFor("manager-assignment"), active: action.record?.active !== false, updatedAt: timestamp };
    if (!clean(record.managerId) || !clean(record.employeeId)) throw new Error("请选择主管和员工。");
    return audit({ ...state, managerAssignments: upsert(state.managerAssignments, record) }, action, record.id);
  }
  if (action.type === "create_assessment") {
    if (validateAssessmentTemplate(action.record).length) throw new Error("考核项权重合计必须为 100%");
    const record = { ...action.record, status: "self_review", id: clean(action.record?.id) || idFor("assessment"), suggestedScore: calculateSuggestedScore(action.record?.items), createdAt: timestamp, updatedAt: timestamp };
    return audit({ ...state, assessments: upsert(state.assessments, record) }, action, record.id);
  }
  const assessment = state.assessments.find(item => item.id === action.id);
  if (!assessment) return state;
  if (assessment.status === "frozen" && action.type !== "append_correction") throw new Error("考核已冻结，只能追加更正记录。");
  if (action.type === "submit_self_review") {
    if (assessment.status !== "self_review") throw new Error("当前状态不能提交自评。");
    const selfScore = score(action.selfScore);
    if (selfScore === null || selfScore < 0 || selfScore > 100 || !clean(action.selfComment)) throw new Error("请填写 0–100 分自评和自评说明。");
    const changed = { ...assessment, selfScore, selfComment: clean(action.selfComment), status: "manager_review", updatedAt: timestamp };
    return audit({ ...state, assessments: upsert(state.assessments, changed) }, action, assessment.id);
  }
  if (action.type === "manager_score") {
    if (assessment.status !== "manager_review") throw new Error("当前状态不能提交主管评分。");
    const finalScore = score(action.finalScore);
    if (finalScore === null || finalScore < 0 || finalScore > 100) throw new Error("主管评分必须在 0–100 之间。");
    const differs = [assessment.selfScore, assessment.suggestedScore].filter(value => value !== null && value !== undefined).some(value => Math.abs(finalScore - value) >= 10);
    if (differs && !clean(action.reason)) throw new Error("评分差异达到 10 分，请说明原因。");
    const changed = { ...assessment, finalScore, managerReason: clean(action.reason), status: "pending_freeze", updatedAt: timestamp };
    return audit({ ...state, assessments: upsert(state.assessments, changed) }, action, assessment.id);
  }
  if (action.type === "request_review") {
    if (assessment.reviewRequestedAt) throw new Error("每次考核仅可申请一次复核。");
    if (assessment.status !== "pending_freeze") throw new Error("仅待归档考核可以申请复核。");
    if (!clean(action.reason)) throw new Error("请填写复核原因。");
    const request = { id: idFor("review"), assessmentId: assessment.id, employeeId: assessment.employeeId, reason: clean(action.reason), status: "pending", createdAt: timestamp };
    const changed = { ...assessment, reviewRequestedAt: timestamp, status: "review_requested", updatedAt: timestamp };
    return audit({ ...state, assessments: upsert(state.assessments, changed), reviewRequests: [request, ...state.reviewRequests] }, action, assessment.id);
  }
  if (action.type === "resolve_review") {
    if (assessment.status !== "review_requested") throw new Error("当前考核没有待处理复核。");
    if (!clean(action.reason)) throw new Error("处理复核必须填写说明。");
    const review = state.reviewRequests.find(item => item.assessmentId === assessment.id && item.status === "pending");
    if (!review) throw new Error("未找到待处理复核申请。");
    const finalScore = action.decision === "adjusted" ? score(action.finalScore) : assessment.finalScore;
    if (finalScore === null || finalScore < 0 || finalScore > 100) throw new Error("调整后的评分必须在 0–100 之间。");
    const changed = { ...assessment, finalScore, reviewResolvedAt: timestamp, reviewResolution: clean(action.reason), status: "pending_freeze", updatedAt: timestamp };
    const reviewRequests = upsert(state.reviewRequests, { ...review, status: action.decision === "adjusted" ? "adjusted" : "upheld", reason: clean(action.reason), resolvedAt: timestamp });
    return audit({ ...state, assessments: upsert(state.assessments, changed), reviewRequests }, action, assessment.id);
  }
  if (action.type === "freeze_assessment") {
    if (assessment.status !== "pending_freeze") throw new Error("当前状态不能冻结归档。");
    const frozenSnapshot = {
      employeeId: assessment.employeeId,
      employeeName: assessment.employeeName,
      managerId: assessment.managerId,
      month: assessment.month,
      items: assessment.items,
      selfScore: assessment.selfScore,
      selfComment: assessment.selfComment,
      suggestedScore: assessment.suggestedScore,
      finalScore: assessment.finalScore,
      managerReason: assessment.managerReason,
      reviewResolution: assessment.reviewResolution || ""
    };
    const changed = { ...assessment, status: "frozen", frozenAt: timestamp, frozenSnapshot, updatedAt: timestamp };
    return audit({ ...state, assessments: upsert(state.assessments, changed) }, action, assessment.id);
  }
  if (action.type === "append_correction") {
    const corrections = [...(assessment.corrections || []), { id: idFor("correction"), reason: clean(action.reason), value: action.value, createdAt: timestamp }];
    return audit({ ...state, assessments: upsert(state.assessments, { ...assessment, corrections }) }, action, assessment.id);
  }
  return state;
}
