const COLLECTIONS = ["cycles", "plans", "executions", "collaborations", "responsibilities", "playbooks", "aiReviews", "auditLogs"];

function text(value) {
  return String(value || "").trim();
}

function idFor(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function actorId(actor = {}) {
  return text(actor.userId || actor.userid || actor.unionId || actor.name);
}

function upsert(items, record) {
  return items.some(item => item.id === record.id)
    ? items.map(item => item.id === record.id ? { ...item, ...record } : item)
    : [record, ...items];
}

function audit(state, action, entityType, entityId, reason = "") {
  const createdAt = action.timestamp || new Date().toISOString();
  return {
    ...state,
    auditLogs: [{
      id: idFor("ops-audit"),
      action: action.type,
      actorId: actorId(action.actor),
      actorName: text(action.actor?.name),
      entityType,
      entityId,
      reason: text(reason),
      createdAt
    }, ...state.auditLogs],
    revision: state.revision + 1,
    updatedAt: createdAt
  };
}

export function createDefaultEcommerceOperationsState() {
  return {
    schemaVersion: "ecommerce-operations-v1",
    revision: 0,
    updatedAt: "",
    cycles: [],
    plans: [],
    executions: [],
    collaborations: [],
    responsibilities: [],
    playbooks: [],
    aiReviews: [],
    auditLogs: []
  };
}

export function normalizeEcommerceOperationsState(input = {}) {
  const base = createDefaultEcommerceOperationsState();
  const next = { ...base, ...input, revision: Number(input.revision) || 0 };
  for (const collection of COLLECTIONS) next[collection] = Array.isArray(input[collection]) ? input[collection].map(item => ({ ...item })) : [];
  return next;
}

export function validateStorePlan(plan = {}) {
  const missing = [];
  if (!Array.isArray(plan.evidence) || !plan.evidence.length) missing.push("现状证据");
  if (!Array.isArray(plan.goals) || !plan.goals.length) missing.push("目标");
  if (!Array.isArray(plan.issues) || !plan.issues.length) missing.push("核心问题");
  if (!Array.isArray(plan.countermeasures) || !plan.countermeasures.length) missing.push("对策");
  if (!Array.isArray(plan.monitors) || !plan.monitors.length) missing.push("检测指标");
  if (!text(plan.platform) || !text(plan.store) || !text(plan.ownerId)) missing.push("平台店铺负责人");
  return missing;
}

export function reduceEcommerceOperationsState(input, action = {}) {
  const state = normalizeEcommerceOperationsState(input);
  const timestamp = action.timestamp || new Date().toISOString();
  if (action.type === "create_cycle") {
    const duplicate = state.cycles.find(item => item.id !== action.record?.id && item.status !== "cancelled" && text(item.month) === text(action.record?.month) && text(item.product) === text(action.record?.product));
    if (duplicate) throw new Error("该产品本月已存在重点经营周期。");
    const record = { status: "draft", ...action.record, id: text(action.record?.id) || idFor("cycle"), createdAt: action.record?.createdAt || timestamp, updatedAt: timestamp };
    return audit({ ...state, cycles: upsert(state.cycles, record) }, action, "cycle", record.id);
  }
  if (action.type === "upsert_plan") {
    const existing = state.plans.find(item => item.id === action.record?.id);
    const record = { status: "draft", version: 1, ...existing, ...action.record, id: text(action.record?.id) || idFor("plan"), updatedAt: timestamp };
    return audit({ ...state, plans: upsert(state.plans, record) }, action, "plan", record.id);
  }
  if (action.type === "submit_plan") {
    const plan = state.plans.find(item => item.id === action.id);
    if (!plan) throw new Error("未找到打品方案。");
    const missing = validateStorePlan(plan);
    if (missing.length) throw new Error(`还需补充：${missing.join("、")}`);
    const changed = { ...plan, status: "submitted", submittedAt: timestamp, updatedAt: timestamp };
    return audit({ ...state, plans: upsert(state.plans, changed) }, action, "plan", plan.id);
  }
  if (action.type === "review_plan") {
    const plan = state.plans.find(item => item.id === action.id);
    if (!plan) throw new Error("未找到打品方案。");
    if (plan.status !== "submitted") throw new Error("仅待审批方案可以批准或退回。");
    if (!text(action.reason)) throw new Error("主管审批必须填写原因。");
    const status = action.decision === "approved" ? "approved" : "returned";
    const changed = { ...plan, status, version: status === "approved" ? Number(plan.version || 1) + 1 : Number(plan.version || 1), reviewedAt: timestamp, reviewReason: text(action.reason), updatedAt: timestamp };
    return audit({ ...state, plans: upsert(state.plans, changed) }, action, "plan", plan.id, action.reason);
  }
  if (action.type === "record_ai_review") {
    const record = { ...action.record, id: text(action.record?.id) || idFor("ai-review"), createdAt: timestamp };
    return audit({ ...state, aiReviews: [record, ...state.aiReviews] }, action, "ai_review", record.id);
  }
  if (action.type === "append_execution") {
    const record = { status: "submitted", ...action.record, id: text(action.record?.id) || idFor("execution"), createdAt: action.record?.createdAt || timestamp, updatedAt: timestamp };
    return audit({ ...state, executions: upsert(state.executions, record) }, action, "execution", record.id);
  }
  if (action.type === "review_execution") {
    const execution = state.executions.find(item => item.id === action.id);
    if (!execution) throw new Error("未找到执行记录。");
    if (execution.status !== "submitted") throw new Error("仅待验收执行记录可以接受或退回。");
    if (!text(action.reason)) throw new Error("执行验收必须填写说明。");
    const changed = { ...execution, status: action.decision === "accepted" ? "accepted" : "returned", acceptance: text(action.reason), reviewedAt: timestamp, updatedAt: timestamp };
    return audit({ ...state, executions: upsert(state.executions, changed) }, action, "execution", execution.id, action.reason);
  }
  if (action.type === "upsert_collaboration" || action.type === "respond_collaboration") {
    const existing = state.collaborations.find(item => item.id === (action.record?.id || action.id));
    const record = { ...existing, ...action.record, id: text(action.record?.id || action.id) || idFor("collaboration"), updatedAt: timestamp };
    if (action.type === "respond_collaboration" && !["accepted", "returned"].includes(record.status)) throw new Error("协同事项只能接受或退回。");
    if (action.type === "respond_collaboration" && !text(record.reason)) throw new Error("接受或退回必须填写说明。");
    return audit({ ...state, collaborations: upsert(state.collaborations, record) }, action, "collaboration", record.id, record.reason);
  }
  if (action.type === "upsert_responsibility" || action.type === "upsert_playbook") {
    const collection = action.type === "upsert_responsibility" ? "responsibilities" : "playbooks";
    const record = { ...action.record, id: text(action.record?.id) || idFor(collection.slice(0, -1)), updatedAt: timestamp };
    return audit({ ...state, [collection]: upsert(state[collection], record) }, action, collection.slice(0, -1), record.id);
  }
  return state;
}

export function buildPerformanceEvidence(input, { employeeId = "", month = "" } = {}) {
  const state = normalizeEcommerceOperationsState(input);
  const planById = new Map(state.plans.map(plan => [plan.id, plan]));
  const cycleById = new Map(state.cycles.map(cycle => [cycle.id, cycle]));
  return state.executions.flatMap(execution => {
    if (execution.status !== "accepted" || text(execution.ownerId) !== text(employeeId)) return [];
    const plan = planById.get(execution.planId);
    if (!plan || plan.status !== "approved") return [];
    const cycle = cycleById.get(plan.cycleId);
    const evidenceMonth = text(cycle?.month || execution.updatedAt).slice(0, 7);
    if (month && evidenceMonth !== month) return [];
    return [{
      sourceAppId: "ecommerce-operations",
      entityType: "execution",
      entityId: execution.id,
      version: Number(plan.version || 1),
      ownerId: text(execution.ownerId),
      accepted: true,
      summary: text(execution.acceptance || execution.title),
      observedAt: execution.updatedAt || ""
    }];
  });
}

export function summarizeEcommerceOperations(input) {
  const state = normalizeEcommerceOperationsState(input);
  return {
    activeCycles: state.cycles.filter(item => !["closed", "cancelled"].includes(item.status)).length,
    pendingReviews: state.plans.filter(item => item.status === "submitted").length,
    activePlans: state.plans.filter(item => item.status === "approved").length,
    blockedCollaborations: state.collaborations.filter(item => ["pending", "overdue", "returned"].includes(item.status)).length
  };
}
