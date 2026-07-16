const DAY_MS = 86400000;

export const PLATFORM_COLLECTIONS = [
  "strategies",
  "objectives",
  "metrics",
  "projects",
  "milestones",
  "risks",
  "decisionRequests",
  "personalTodos",
  "statusUpdates",
  "monthlySnapshots",
  "appLinks",
  "appEvents",
  "appRegistry",
  "auditLogs"
];

export const HEALTH_META = {
  normal: { label: "正常", tone: "success" },
  at_risk: { label: "风险", tone: "warning" },
  off_track: { label: "偏离", tone: "danger" },
  completed: { label: "已完成", tone: "neutral" }
};

const DEFAULT_APP_REGISTRY = [
  {
    id: "product-flow",
    name: "产品全周期",
    description: "管理产品机会、规划、研发、上市与经营复盘。",
    route: "dashboard",
    enabled: true,
    status: "connected"
  }
];

function nowIso(value) {
  const date = value ? new Date(value) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function cleanDate(value) {
  const match = String(value || "").match(/^\d{4}-\d{2}-\d{2}/);
  if (match?.[0]) return match[0];
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function daysBetween(older, newer) {
  const start = Date.parse(`${cleanDate(older)}T00:00:00Z`);
  const end = Date.parse(`${cleanDate(newer)}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end) ? Math.floor((end - start) / DAY_MS) : null;
}

function numberOr(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function recordWithDefaults(record, prefix, timestamp) {
  return {
    ...record,
    id: String(record?.id || uniqueId(prefix)),
    createdAt: record?.createdAt || timestamp,
    updatedAt: timestamp,
    archived: Boolean(record?.archived)
  };
}

function upsert(records, record) {
  const found = records.some(item => item.id === record.id);
  return found
    ? records.map(item => item.id === record.id ? { ...item, ...record } : item)
    : [record, ...records];
}

function audit(state, { actor = "", action, entityType, entityId, reason = "", timestamp }) {
  const entry = {
    id: uniqueId("audit"),
    actor: actor || "系统",
    action,
    entityType,
    entityId,
    reason: String(reason || ""),
    createdAt: timestamp
  };
  return { ...state, auditLogs: [entry, ...state.auditLogs] };
}

export function createDefaultPlatformState() {
  const state = {
    version: "strategy-platform-v1",
    updatedAt: "2026-07-16T00:00:00.000Z",
    strategies: [
      {
        id: "strategy-growth-2026",
        name: "建立可持续的品类增长引擎",
        intent: "用更高成功率的新品和重点渠道增长，形成可重复的经营能力。",
        successStandard: "核心品类收入与利润同步增长，重点项目按期交付。",
        owner: "周荣庆",
        year: 2026,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    objectives: [
      {
        id: "objective-q3-new-products",
        strategyId: "strategy-growth-2026",
        title: "三季度形成两款可规模化增长的核心新品",
        quarter: "2026-Q3",
        owner: "叶津成",
        departments: ["产品部", "运营", "品牌", "供应链"],
        successStandard: "两款新品完成上市验证，其中至少一款达到首月目标。",
        confidence: 72,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    metrics: [
      {
        id: "metric-q3-launches",
        objectiveId: "objective-q3-new-products",
        name: "完成上市验证的核心新品数",
        owner: "叶津成",
        unit: "款",
        direction: "increase",
        baseline: 0,
        current: 1,
        target: 2,
        warningLine: 1,
        offTrackLine: 0,
        sourceType: "app",
        sourceName: "产品全周期",
        frequencyDays: 7,
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    projects: [
      {
        id: "project-hamster-freeze-dried",
        strategyId: "strategy-growth-2026",
        objectiveId: "objective-q3-new-products",
        name: "仓鼠冻干零食规模化上市",
        goal: "完成产品验证并形成稳定增长方案。",
        successStandard: "按计划完成上市并达到首月 GMV 目标。",
        sponsor: "周荣庆",
        owner: "叶津成",
        department: "产品部",
        partnerDepartments: ["运营", "品牌", "供应链"],
        startDate: "2026-06-01",
        endDate: "2026-09-30",
        visibility: "company",
        sourceAppId: "product-flow",
        sourceEntityId: "p2",
        sourceHealth: "normal",
        sourceProgress: 82,
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    milestones: [
      {
        id: "milestone-hamster-review",
        projectId: "project-hamster-freeze-dried",
        title: "完成上市复盘并确认放量策略",
        owner: "叶津成",
        dueDate: "2026-07-31",
        status: "pending",
        critical: true,
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    risks: [
      {
        id: "risk-content-capacity",
        projectId: "project-hamster-freeze-dried",
        title: "内容产能可能影响新品放量",
        severity: "high",
        owner: "陈铭懿",
        response: "优先保障核心渠道素材并准备外部剪辑资源。",
        promisedAt: "2026-07-22",
        status: "open",
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    decisionRequests: [
      {
        id: "decision-content-backup",
        projectId: "project-hamster-freeze-dried",
        title: "是否启用外部剪辑资源作为产能备份",
        impact: "影响新品首月素材供给与投放节奏。",
        recommendation: "批准两周外部产能预算，内部团队聚焦核心内容。",
        alternatives: "继续完全使用内部资源，但接受排期延后风险。",
        requester: "叶津成",
        decisionOwner: "周荣庆",
        dueDate: "2026-07-18",
        status: "pending",
        createdAt: "2026-07-16T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    personalTodos: [],
    statusUpdates: [],
    monthlySnapshots: [],
    appLinks: [
      { id: "link-product-p2", appId: "product-flow", entityType: "product", entityId: "p2", projectId: "project-hamster-freeze-dried" }
    ],
    appEvents: [],
    appRegistry: DEFAULT_APP_REGISTRY,
    auditLogs: []
  };
  return normalizePlatformState(state);
}

export function normalizePlatformState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return createDefaultPlatformState();
  const state = {
    version: String(input.version || "strategy-platform-v1"),
    updatedAt: input.updatedAt || "",
    ...input
  };
  PLATFORM_COLLECTIONS.forEach(key => {
    const fallback = key === "appRegistry" ? DEFAULT_APP_REGISTRY : [];
    state[key] = Array.isArray(input[key]) ? input[key].map(item => ({ ...item })) : fallback.map(item => ({ ...item }));
  });
  return state;
}

export function aggregateHealth(values = []) {
  const states = values.filter(Boolean);
  if (states.includes("off_track")) return "off_track";
  if (states.includes("at_risk")) return "at_risk";
  if (states.length && states.every(value => value === "completed")) return "completed";
  return "normal";
}

export function metricHealth(metric, today = new Date()) {
  const current = numberOr(metric?.current);
  const target = numberOr(metric?.target);
  const warning = numberOr(metric?.warningLine, target);
  const offTrack = numberOr(metric?.offTrackLine, warning);
  const direction = metric?.direction || "increase";
  let health = "normal";

  if (direction === "decrease") {
    if (current <= target) health = "completed";
    else if (current >= offTrack) health = "off_track";
    else if (current > warning) health = "at_risk";
  } else if (direction === "range") {
    const minimum = numberOr(metric?.targetMin, target);
    const maximum = numberOr(metric?.targetMax, target);
    health = current >= minimum && current <= maximum ? "completed" : "off_track";
  } else {
    if (current >= target) health = "completed";
    else if (current <= offTrack) health = "off_track";
    else if (current < warning) health = "at_risk";
  }

  const age = daysBetween(metric?.updatedAt, today);
  const freshness = age == null
    ? "unknown"
    : age > Math.max(1, numberOr(metric?.frequencyDays, 7)) ? "stale" : "fresh";
  if ((freshness === "stale" || freshness === "unknown") && health === "normal") health = "at_risk";
  return { health, freshness, ageDays: age };
}

export function projectHealth(state, project, today = new Date()) {
  const milestones = state.milestones.filter(item => item.projectId === project?.id && !item.archived);
  const risks = state.risks.filter(item => item.projectId === project?.id && item.status !== "closed" && !item.archived);
  const reasons = [];
  const states = [project?.sourceHealth].filter(Boolean);
  const todayValue = cleanDate(today);

  milestones.forEach(milestone => {
    if (milestone.status === "completed") return;
    const overdue = cleanDate(milestone.dueDate) && cleanDate(milestone.dueDate) < todayValue;
    if (overdue && milestone.critical) {
      states.push("off_track");
      reasons.push(`关键里程碑延期：${milestone.title}`);
    } else if (overdue) {
      states.push("at_risk");
      reasons.push(`里程碑延期：${milestone.title}`);
    }
  });

  risks.forEach(risk => {
    if (risk.severity === "critical") {
      states.push("off_track");
      reasons.push(`重大风险：${risk.title || "未命名风险"}`);
    } else if (risk.severity === "high") {
      states.push("at_risk");
      reasons.push(`高风险：${risk.title || "未命名风险"}`);
    }
  });

  const age = daysBetween(project?.updatedAt, today);
  const freshness = age == null ? "unknown" : age > 7 ? "stale" : "fresh";
  if (freshness !== "fresh") {
    states.push("at_risk");
    reasons.push("项目状态超过一周未确认");
  }
  return { health: aggregateHealth(states), freshness, reasons };
}

export function objectiveHealth(state, objective, today = new Date()) {
  const metrics = state.metrics.filter(item => item.objectiveId === objective?.id && !item.archived);
  const projects = state.projects.filter(item => (
    item.objectiveId === objective?.id || (item.objectiveIds || []).includes(objective?.id)
  ) && !item.archived);
  const metricResults = metrics.map(metric => ({ metric, ...metricHealth(metric, today) }));
  const projectResults = projects.map(project => ({ project, ...projectHealth(state, project, today) }));
  const health = aggregateHealth([
    ...metricResults.map(item => item.health),
    ...projectResults.map(item => item.health)
  ]);
  return { health, metricResults, projectResults };
}

export function strategyHealth(state, strategy, today = new Date()) {
  const objectives = state.objectives.filter(item => item.strategyId === strategy?.id && !item.archived);
  const results = objectives.map(objective => ({ objective, ...objectiveHealth(state, objective, today) }));
  return { health: aggregateHealth(results.map(item => item.health)), objectiveResults: results };
}

const ACTION_COLLECTION = {
  upsert_strategy: ["strategies", "strategy", "strategy"],
  upsert_objective: ["objectives", "objective", "objective"],
  upsert_metric: ["metrics", "metric", "metric"],
  upsert_project: ["projects", "project", "project"],
  upsert_milestone: ["milestones", "milestone", "milestone"],
  upsert_risk: ["risks", "risk", "risk"],
  upsert_decision: ["decisionRequests", "decision", "decision"]
};

export function reducePlatformState(input, action = {}) {
  const state = normalizePlatformState(input);
  const timestamp = action.timestamp || nowIso();

  if (action.type === "update_monthly_snapshot") throw new Error("月度经营快照不可修改。");

  if (ACTION_COLLECTION[action.type]) {
    const [collection, entityType, prefix] = ACTION_COLLECTION[action.type];
    const record = recordWithDefaults(action.record || {}, prefix, timestamp);
    const next = { ...state, updatedAt: timestamp, [collection]: upsert(state[collection], record) };
    return audit(next, {
      actor: action.actor,
      action: state[collection].some(item => item.id === record.id) ? "update" : "create",
      entityType,
      entityId: record.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_entity") {
    const collection = String(action.collection || "");
    if (!PLATFORM_COLLECTIONS.includes(collection)) return state;
    const records = state[collection].map(item => item.id === action.id ? { ...item, archived: true, updatedAt: timestamp } : item);
    return audit({ ...state, updatedAt: timestamp, [collection]: records }, {
      actor: action.actor,
      action: "archive",
      entityType: collection,
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "resolve_decision") {
    const decisionRequests = state.decisionRequests.map(item => item.id === action.id ? {
      ...item,
      status: action.status || "approved",
      resolution: action.resolution || "",
      resolvedBy: action.actor || "",
      resolvedAt: timestamp,
      updatedAt: timestamp
    } : item);
    return audit({ ...state, updatedAt: timestamp, decisionRequests }, {
      actor: action.actor,
      action: "resolve",
      entityType: "decision",
      entityId: action.id,
      reason: action.resolution,
      timestamp
    });
  }

  if (action.type === "append_status_update") {
    const record = recordWithDefaults(action.record || {}, "update", timestamp);
    return audit({ ...state, updatedAt: timestamp, statusUpdates: [record, ...state.statusUpdates] }, {
      actor: action.actor,
      action: "create",
      entityType: "status_update",
      entityId: record.id,
      timestamp
    });
  }

  if (action.type === "create_monthly_snapshot") {
    const record = recordWithDefaults(action.record || {}, "snapshot", timestamp);
    if (state.monthlySnapshots.some(item => item.id === record.id || (record.month && item.month === record.month))) return state;
    return audit({ ...state, updatedAt: timestamp, monthlySnapshots: [record, ...state.monthlySnapshots] }, {
      actor: action.actor,
      action: "create",
      entityType: "monthly_snapshot",
      entityId: record.id,
      timestamp
    });
  }

  if (action.type === "ingest_app_events") {
    const seen = new Set(state.appEvents.map(event => event.idempotencyKey || event.id));
    const incoming = (action.events || []).filter(event => {
      const key = event.idempotencyKey || event.id;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (!incoming.length) return state;
    const projects = state.projects.map(project => {
      const events = incoming.filter(event => event.appId === project.sourceAppId && event.entityId === project.sourceEntityId);
      if (!events.length) return project;
      const latest = [...events].sort((left, right) => String(right.occurredAt || "").localeCompare(String(left.occurredAt || "")))[0];
      return {
        ...project,
        sourceHealth: latest.health || project.sourceHealth,
        sourceProgress: Number.isFinite(Number(latest.progress)) ? Number(latest.progress) : project.sourceProgress,
        sourceSyncedAt: latest.syncedAt || timestamp,
        updatedAt: latest.occurredAt || project.updatedAt
      };
    });
    return { ...state, updatedAt: timestamp, projects, appEvents: [...incoming, ...state.appEvents] };
  }

  if (action.type === "update_decision_notification") {
    const decisionRequests = state.decisionRequests.map(item => item.id === action.id ? {
      ...item,
      dingTodo: { ...(item.dingTodo || {}), ...(action.dingTodo || {}) },
      updatedAt: timestamp
    } : item);
    return { ...state, updatedAt: timestamp, decisionRequests };
  }

  return state;
}

export function buildExecutiveSummary(input, context = {}) {
  const state = normalizePlatformState(input);
  const today = context.today || new Date();
  const strategies = state.strategies.filter(item => !item.archived).map(strategy => ({
    strategy,
    ...strategyHealth(state, strategy, today)
  }));
  const objectives = state.objectives.filter(item => !item.archived).map(objective => ({
    objective,
    ...objectiveHealth(state, objective, today)
  }));
  const projects = state.projects.filter(item => !item.archived).map(project => ({
    project,
    ...projectHealth(state, project, today)
  }));
  const pendingDecisions = state.decisionRequests
    .filter(item => item.status === "pending" && !item.archived)
    .sort((left, right) => String(left.dueDate || "9999-12-31").localeCompare(String(right.dueDate || "9999-12-31")));
  const openRisks = state.risks
    .filter(item => item.status !== "closed" && !item.archived)
    .sort((left, right) => ({ critical: 0, high: 1, medium: 2, low: 3 }[left.severity] ?? 9) - ({ critical: 0, high: 1, medium: 2, low: 3 }[right.severity] ?? 9));
  const counts = { normal: 0, atRisk: 0, offTrack: 0, completed: 0 };
  objectives.forEach(item => {
    if (item.health === "normal") counts.normal += 1;
    else if (item.health === "at_risk") counts.atRisk += 1;
    else if (item.health === "off_track") counts.offTrack += 1;
    else if (item.health === "completed") counts.completed += 1;
  });
  return {
    strategies,
    objectives,
    projects,
    offTrackObjectives: objectives.filter(item => item.health === "off_track"),
    atRiskObjectives: objectives.filter(item => item.health === "at_risk"),
    offTrackProjects: projects.filter(item => item.health === "off_track"),
    atRiskProjects: projects.filter(item => item.health === "at_risk"),
    pendingDecisions,
    openRisks,
    counts
  };
}

export function buildMonthlyTrend(snapshots = []) {
  return snapshots
    .filter(item => /^\d{4}-\d{2}$/.test(String(item.month || "")))
    .map(item => ({ month: item.month, ...(item.summary || {}) }))
    .sort((left, right) => left.month.localeCompare(right.month));
}

export function buildAppHealth(appRegistry = [], events = [], today = new Date()) {
  return appRegistry.map(app => {
    const appEvents = events.filter(event => event.appId === app.id);
    const latest = [...appEvents].sort((left, right) => String(right.syncedAt || "").localeCompare(String(left.syncedAt || "")))[0];
    const lastSyncedAt = latest?.syncedAt || app.lastSyncedAt || "";
    const age = daysBetween(lastSyncedAt, today);
    const freshness = app.status === "failed"
      ? "failed"
      : age == null ? "unknown" : age > 7 ? "stale" : "healthy";
    return { ...app, lastSyncedAt, freshness, ageDays: age };
  });
}
