import {
  ensureMonthlyReports,
  settleIncentiveProject,
  transitionDepartmentCommitment,
  transitionMonthlyReport
} from "./executionGovernance.js";

const DAY_MS = 86400000;

export const PLATFORM_COLLECTIONS = [
  "strategies",
  "requiredResults",
  "departmentCommitments",
  "commitmentMilestones",
  "incentiveProjects",
  "departmentRewardBudgets",
  "monthlyReports",
  "reportCorrections",
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

const DOCUMENT_SOURCE = "《提野星2026年重点工作》";
const DOCUMENT_UPDATED_AT = "2026-07-17T00:00:00.000Z";
const DOCUMENT_V3_SEED = {
  strategies: [
    {
      id: "strategy-organization-2026",
      name: "组织建设全面加强",
      intent: "明晰权责边界，建立跨部门协作、周期复盘与钉钉数据资产机制。",
      successStandard: "四项组织建设必达结果全部完成，并由总经办依据制度、会议记录和数据资产清单核验。",
      owner: "周荣庆",
      year: 2026,
      status: "active",
      sourceReference: DOCUMENT_SOURCE
    },
    {
      id: "strategy-bird-gmv-2026",
      name: "鸟类销量明显突破",
      intent: "围绕鸟类产品、内容投放和渠道运营形成可持续增长能力。",
      successStandard: "2026 年 12 月鸟类单月实付 GMV 达到 100 万元，且重点运营方法形成可复用记录。",
      owner: "周荣庆",
      year: 2026,
      status: "active",
      sourceReference: DOCUMENT_SOURCE
    },
    {
      id: "strategy-hamster-brand-2026",
      name: "仓鼠品牌表达与竞争力提升",
      intent: "统一品牌视觉和核心概念，提升或守住重点平台市场排名。",
      successStandard: "品牌表达和经营决策两项必达结果均在 2026 年 9 月前核验通过。",
      owner: "周荣庆",
      year: 2026,
      status: "active",
      sourceReference: DOCUMENT_SOURCE
    }
  ],
  requiredResults: [
    { id: "result-org-roles", strategyId: "strategy-organization-2026", title: "完成岗位职责、权责边界与审批流程", acceptanceStandard: "各部门职责说明书明确职责、目标、权限、协作对象和考核指标；人事行政部与财务部完成审批流整合并经总经办验收。", owner: "人事行政部", dueDate: "2026-08-31", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "result-org-collaboration", strategyId: "strategy-organization-2026", title: "跨部门协作与专项会议机制顺畅运行", acceptanceStandard: "提需、沟通和资源协调边界清晰；跨部门专项会议形成纪要并由总助持续追踪，连续一个月无长期悬置事项。", owner: "总经办", dueDate: "2026-08-31", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "result-org-review-cadence", strategyId: "strategy-organization-2026", title: "周度经理办公会与月度复盘稳定运行", acceptanceStandard: "每周一经理办公会持续召开；每月 5 日前完成月度例会，各部门围绕年度目标和关键工作提交汇报，连续运行两个月。", owner: "总经办", dueDate: "2026-09-05", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "result-org-data", strategyId: "strategy-organization-2026", title: "形成钉钉数据资产沉淀机制", acceptanceStandard: "各部门形成数据资产清单，重点指标通过 AI 表格稳定更新，并建立可检索的知识库沉淀。", owner: "总经办", dueDate: "2026-07-31", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "result-bird-gmv", strategyId: "strategy-bird-gmv-2026", title: "12 月鸟类单月 GMV 达到 100 万元", acceptanceStandard: "财务确认的 2026 年 12 月鸟类实付 GMV 不低于 100 万元。", owner: "运营部", dueDate: "2026-12-31", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "result-bird-playbook", strategyId: "strategy-bird-gmv-2026", title: "形成鸟类重点运营与内容投放方法", acceptanceStandard: "鸟类重点产品、内容选题、素材迭代和投放复盘形成书面方法，至少完成两轮可复用验证。", owner: "运营部", dueDate: "2026-11-30", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "result-hamster-rank", strategyId: "strategy-hamster-brand-2026", title: "平台排名和品牌内容表达达标", acceptanceStandard: "重点平台市场排名提升或至少不下降；最迟 9 月核心页面和内容视觉统一并清楚传达品牌核心概念。", owner: "品牌部", dueDate: "2026-09-30", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "result-hamster-brand-decisions", strategyId: "strategy-hamster-brand-2026", title: "品牌理念进入日常经营决策", acceptanceStandard: "各部门会议纪要和关键决策记录中能够说明是否符合品牌核心概念，连续一个月由品牌部抽查通过。", owner: "品牌部", dueDate: "2026-09-30", status: "active", sourceReference: DOCUMENT_SOURCE }
  ],
  departmentCommitments: [
    { id: "commitment-brand-organization-2026", strategyId: "strategy-organization-2026", title: "明确品牌部素材与内容协作流程", department: "品牌部", owner: "品牌部负责人", reviewerName: "周荣庆", executiveOwner: "周荣庆", period: "2026-Q3", successStandard: "素材管理、调度、制作、审核和复盘流程形成文档并稳定执行一个月。", dueDate: "2026-09-30", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-brand-concept-2026", strategyId: "strategy-hamster-brand-2026", title: "确定并落地品牌核心概念", department: "品牌部", owner: "品牌部负责人", reviewerName: "周荣庆", executiveOwner: "周荣庆", period: "2026-Q3", successStandard: "品牌核心概念完成公司级同步，并覆盖核心平台内容和三款重点产品。", dueDate: "2026-09-30", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-brand-ip-2026", strategyId: "strategy-bird-gmv-2026", title: "鸟类与仓鼠 IP 进入常态化运营", department: "品牌部", owner: "品牌部负责人", reviewerName: "周荣庆", executiveOwner: "周荣庆", period: "2026-Q3", successStandard: "两个品类 IP 账号形成稳定内容产出与复盘节奏，鸟类账号持续跟踪涨粉和爆款选题。", dueDate: "2026-09-30", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-brand-performance-2026", strategyId: "strategy-bird-gmv-2026", title: "建立信息流爆款素材迭代机制", department: "品牌部", owner: "品牌部负责人", reviewerName: "周荣庆", executiveOwner: "周荣庆", period: "2026-Q3", successStandard: "品牌与运营每周完成素材复盘和迭代，连续四周产出达到投放标准的候选素材。", dueDate: "2026-09-30", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-brand-offline-2026", strategyId: "strategy-hamster-brand-2026", title: "提升线下店品牌形象和私域经营", department: "品牌部", owner: "品牌部负责人", reviewerName: "周荣庆", executiveOwner: "周荣庆", period: "2026-Q4", successStandard: "形成日常探店与产品讲解内容，并建立仓鼠、鸟类活体私域售卖记录。", dueDate: "2026-12-31", status: "draft", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ops-data-2026", strategyId: "strategy-organization-2026", title: "建立运营关键数据日常记录", department: "运营部", owner: "运营部负责人", reviewerName: "周荣庆", executiveOwner: "周荣庆", period: "2026-Q3", successStandard: "核心运营数据按日记录，能够支持年度运营计划和目标复盘，连续稳定更新一个月。", dueDate: "2026-08-31", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ops-bird-q3", strategyId: "strategy-bird-gmv-2026", title: "鸟类产品重点运营并快速放量", department: "运营部", owner: "运营部负责人", reviewerName: "周荣庆", executiveOwner: "周荣庆", period: "2026-Q3", successStandard: "形成鸟类重点产品运营节奏，月度 GMV 按里程碑增长并沉淀投放复盘。", dueDate: "2026-09-30", status: "active", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ops-channel-2026", strategyId: "strategy-hamster-brand-2026", title: "形成渠道打品方法并守住平台排名", department: "运营部", owner: "运营部负责人", reviewerName: "周荣庆", executiveOwner: "周荣庆", period: "2026-Q4", successStandard: "天猫仓鼠类稳定前 3、抖音仓鼠类稳定前 2、拼多多进入前 10，并形成渠道打品方法文档。", dueDate: "2026-12-31", status: "active", sourceReference: DOCUMENT_SOURCE }
  ],
  commitmentMilestones: [
    { id: "commitment-ms-brand-process-aug", commitmentId: "commitment-brand-organization-2026", title: "发布品牌部素材与审核流程", month: "2026-08", dueDate: "2026-08-31", owner: "品牌部负责人", status: "pending", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ms-brand-concept-sep", commitmentId: "commitment-brand-concept-2026", title: "完成品牌核心概念全公司同步", month: "2026-09", dueDate: "2026-09-15", owner: "品牌部负责人", status: "pending", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ms-brand-ip-aug", commitmentId: "commitment-brand-ip-2026", title: "建立双品类 IP 周度选题与复盘表", month: "2026-08", dueDate: "2026-08-31", owner: "品牌部负责人", status: "pending", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ms-brand-material-sep", commitmentId: "commitment-brand-performance-2026", title: "连续四周完成素材投放复盘", month: "2026-09", dueDate: "2026-09-30", owner: "品牌部负责人", status: "pending", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ms-brand-offline-oct", commitmentId: "commitment-brand-offline-2026", title: "完成线下店内容和私域方案", month: "2026-10", dueDate: "2026-10-31", owner: "品牌部负责人", status: "pending", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ms-ops-data-aug", commitmentId: "commitment-ops-data-2026", title: "运营核心数据连续记录一个月", month: "2026-08", dueDate: "2026-08-31", owner: "运营部负责人", status: "pending", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ms-bird-sep", commitmentId: "commitment-ops-bird-q3", title: "完成鸟类重点运营第三轮月度复盘", month: "2026-09", dueDate: "2026-09-30", owner: "运营部负责人", status: "pending", sourceReference: DOCUMENT_SOURCE },
    { id: "commitment-ms-channel-dec", commitmentId: "commitment-ops-channel-2026", title: "核验三大平台排名与打品方法", month: "2026-12", dueDate: "2026-12-31", owner: "运营部负责人", status: "pending", sourceReference: DOCUMENT_SOURCE }
  ]
};

const REQUIRED_RESULT_BY_COMMITMENT_ID = {
  "commitment-brand-organization-2026": "result-org-collaboration",
  "commitment-brand-concept-2026": "result-hamster-rank",
  "commitment-brand-ip-2026": "result-bird-playbook",
  "commitment-brand-performance-2026": "result-bird-playbook",
  "commitment-brand-offline-2026": "result-hamster-rank",
  "commitment-ops-data-2026": "result-org-data",
  "commitment-ops-bird-q3": "result-bird-gmv",
  "commitment-ops-channel-2026": "result-hamster-rank"
};

const MIGRATION_PRESERVED_FIELDS = [
  "status", "statusReason", "createdAt", "updatedAt", "archived", "archivedAt", "archivedBy", "dingTodo"
];

function mergeDocumentSeed(records = [], seeds = []) {
  const existing = new Map(records.map(record => [record.id, { ...record }]));
  seeds.forEach(seed => {
    const current = existing.get(seed.id);
    if (!current) {
      existing.set(seed.id, { ...seed, createdAt: DOCUMENT_UPDATED_AT, updatedAt: DOCUMENT_UPDATED_AT, archived: false });
      return;
    }
    const merged = { ...current, ...seed };
    MIGRATION_PRESERVED_FIELDS.forEach(field => {
      if (current[field] !== undefined) merged[field] = current[field];
    });
    existing.set(seed.id, merged);
  });
  return [...existing.values()];
}

export function migratePlatformState(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  if (input.version === "strategy-platform-v4") return input;
  const v3 = input.version === "strategy-platform-v2"
    ? {
        ...input,
        version: "strategy-platform-v3",
        strategies: mergeDocumentSeed(input.strategies, DOCUMENT_V3_SEED.strategies),
        requiredResults: mergeDocumentSeed(input.requiredResults, DOCUMENT_V3_SEED.requiredResults),
        departmentCommitments: mergeDocumentSeed(input.departmentCommitments, DOCUMENT_V3_SEED.departmentCommitments),
        commitmentMilestones: mergeDocumentSeed(input.commitmentMilestones, DOCUMENT_V3_SEED.commitmentMilestones)
      }
    : input;
  if (v3.version !== "strategy-platform-v3") return v3;
  return {
    ...v3,
    version: "strategy-platform-v4",
    departmentCommitments: (v3.departmentCommitments || []).map(commitment => {
      if (commitment.requiredResultId || !REQUIRED_RESULT_BY_COMMITMENT_ID[commitment.id]) return commitment;
      return { ...commitment, requiredResultId: REQUIRED_RESULT_BY_COMMITMENT_ID[commitment.id] };
    })
  };
}

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

function archivedRecord(record, action, timestamp) {
  return {
    ...record,
    archived: true,
    archivedAt: timestamp,
    archivedBy: action.actor || "系统",
    updatedAt: timestamp
  };
}

function archiveMatching(records, predicate, action, timestamp) {
  return records.map(record => predicate(record) ? archivedRecord(record, action, timestamp) : record);
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
    version: "strategy-platform-v2",
    updatedAt: "2026-07-16T00:00:00.000Z",
    strategies: [
      {
        id: "strategy-organization-2026",
        name: "组织建设",
        intent: "建立清晰的岗位职责、跨部门协作边界和可持续的数据资产机制。",
        successStandard: "全部组织建设必达结果完成并经总经办核验。",
        owner: "周荣庆",
        year: 2026,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      },
      {
        id: "strategy-bird-gmv-2026",
        name: "鸟类销量突破",
        intent: "形成鸟类产品、内容、渠道、供应和财务协同增长能力。",
        successStandard: "12 月鸟类单月 GMV 达到 100 万元，并完成配套必达结果。",
        owner: "周荣庆",
        year: 2026,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      },
      {
        id: "strategy-hamster-brand-2026",
        name: "仓鼠品牌升级",
        intent: "通过品牌、产品、渠道和服务协同提升仓鼠品类品牌排名。",
        successStandard: "全部品牌升级必达结果完成并经总经办核验。",
        owner: "周荣庆",
        year: 2026,
        status: "active",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    requiredResults: [
      { id: "result-org-roles", strategyId: "strategy-organization-2026", title: "完成岗位职责与跨部门协作边界", acceptanceStandard: "全公司岗位说明书与跨部门协作边界通过总经办验收。", owner: "人事行政部", dueDate: "2026-09-30", status: "active", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" },
      { id: "result-org-data", strategyId: "strategy-organization-2026", title: "形成核心经营数据资产机制", acceptanceStandard: "核心部门数据台账按约定频率稳定更新一个月。", owner: "总经办", dueDate: "2026-10-31", status: "active", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" },
      { id: "result-bird-gmv", strategyId: "strategy-bird-gmv-2026", title: "12 月鸟类单月 GMV 达到 100 万元", acceptanceStandard: "财务确认的 12 月鸟类实付 GMV 不低于 100 万元。", owner: "运营部", dueDate: "2026-12-31", status: "active", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" },
      { id: "result-bird-supply", strategyId: "strategy-bird-gmv-2026", title: "鸟类核心产品供应稳定", acceptanceStandard: "核心产品断货率控制在 10% 以内并建立备选供应商。", owner: "供应链团队", dueDate: "2026-12-31", status: "active", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" },
      { id: "result-hamster-rank", strategyId: "strategy-hamster-brand-2026", title: "仓鼠品类品牌排名稳定提升", acceptanceStandard: "目标平台品牌排名达到公司确认的目标位次并保持一个月。", owner: "运营部", dueDate: "2026-12-31", status: "active", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" },
      { id: "result-hamster-visual", strategyId: "strategy-hamster-brand-2026", title: "完成仓鼠品牌视觉与内容标准升级", acceptanceStandard: "VI 手册定稿并应用到核心平台和重点产品。", owner: "品牌部", dueDate: "2026-09-30", status: "active", createdAt: "2026-07-16T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" }
    ],
    departmentCommitments: [
      {
        id: "commitment-ops-bird-q3",
        strategyId: "strategy-bird-gmv-2026",
        title: "形成鸟类投流与内容放量模型",
        department: "运营部",
        owner: "陈铭懿",
        reviewerName: "周荣庆",
        executiveOwner: "周荣庆",
        period: "2026-Q3",
        successStandard: "9 月鸟类月 GMV 达到 50 万元，投流 ROI 稳定在部门确认的安全线以上。",
        dueDate: "2026-09-30",
        status: "active",
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      },
      {
        id: "commitment-brand-hamster-q3",
        strategyId: "strategy-hamster-brand-2026",
        title: "完成仓鼠品牌核心视觉统一",
        department: "品牌部",
        owner: "叶津成",
        reviewerName: "周荣庆",
        executiveOwner: "周荣庆",
        reviewDueDate: "2026-07-20",
        period: "2026-Q3",
        successStandard: "VI 手册通过评审并覆盖抖音、天猫及三款核心产品。",
        dueDate: "2026-09-30",
        status: "office_review",
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    commitmentMilestones: [
      { id: "commitment-ms-bird-jul", commitmentId: "commitment-ops-bird-q3", title: "完成三套投流模型对照测试", month: "2026-07", dueDate: "2026-07-31", owner: "陈铭懿", status: "pending", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" },
      { id: "commitment-ms-bird-aug", commitmentId: "commitment-ops-bird-q3", title: "鸟类月 GMV 达到 35 万元", month: "2026-08", dueDate: "2026-08-31", owner: "陈铭懿", status: "pending", createdAt: "2026-07-01T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" },
      { id: "commitment-ms-brand-aug", commitmentId: "commitment-brand-hamster-q3", title: "完成 VI 手册终稿评审", month: "2026-08", dueDate: "2026-08-20", owner: "叶津成", status: "pending", createdAt: "2026-07-14T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" }
    ],
    incentiveProjects: [
      {
        id: "incentive-douyin-roi",
        name: "优化抖音投流效率",
        goal: "用两周对照实验找出可稳定复制的素材与人群组合，降低无效消耗。",
        department: "运营部",
        owner: "陈铭懿",
        partnerDepartments: [],
        strategyId: "strategy-bird-gmv-2026",
        year: 2026,
        startDate: "2026-07-15",
        endDate: "2026-08-15",
        rewardCap: 5000,
        evaluationStandard: "实验结论可复用，目标计划 ROI 提升不少于 15%，由运营负责人复核数据。",
        payoutOwner: "周荣庆",
        payoutDueDate: "2026-08-20",
        status: "active",
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-16T00:00:00.000Z"
      }
    ],
    departmentRewardBudgets: [
      { id: "reward-budget-ops-2026", department: "运营部", year: 2026, amount: 30000, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" },
      { id: "reward-budget-brand-2026", department: "品牌部", year: 2026, amount: 20000, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-07-16T00:00:00.000Z" }
    ],
    monthlyReports: [
      {
        id: "report-2026-06-运营部",
        month: "2026-06",
        department: "运营部",
        owner: "陈铭懿",
        ownerUnionId: "",
        reviewerName: "周荣庆",
        freezerName: "周荣庆",
        dueDate: "2026-07-05",
        status: "submitted",
        keyResults: "完成鸟类内容与投流第一轮组合测试，确认两个可继续放量的素材方向。",
        incompleteItems: "鸟类直播间人货场方案仍需补充一轮验证。",
        nextMonthPriorities: "完成三套投流模型对照测试；推进鸟类月 GMV 至 25 万元。",
        risks: "优质素材产能不足。",
        coordinationNeeds: "需要品牌部优先支持鸟类核心卖点视觉。",
        decisionNeeds: "建议批准外部剪辑资源短期预算。",
        corrections: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-04T00:00:00.000Z"
      },
      {
        id: "report-2026-06-品牌部",
        month: "2026-06",
        department: "品牌部",
        owner: "叶津成",
        ownerUnionId: "",
        reviewerName: "周荣庆",
        freezerName: "周荣庆",
        dueDate: "2026-07-05",
        status: "draft",
        keyResults: "",
        incompleteItems: "",
        nextMonthPriorities: "",
        risks: "",
        coordinationNeeds: "",
        decisionNeeds: "",
        corrections: [],
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z"
      }
    ],
    reportCorrections: [],
    objectives: [
      {
        id: "objective-q3-new-products",
        strategyId: "strategy-hamster-brand-2026",
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
        strategyId: "strategy-hamster-brand-2026",
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
  const migrated = migratePlatformState(input);
  const state = {
    version: String(migrated.version || "strategy-platform-v1"),
    updatedAt: migrated.updatedAt || "",
    ...migrated
  };
  PLATFORM_COLLECTIONS.forEach(key => {
    const fallback = key === "appRegistry" ? DEFAULT_APP_REGISTRY : [];
    state[key] = Array.isArray(migrated[key]) ? migrated[key].map(item => ({ ...item })) : fallback.map(item => ({ ...item }));
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
  upsert_required_result: ["requiredResults", "required_result", "required-result"],
  upsert_department_commitment: ["departmentCommitments", "department_commitment", "department-commitment"],
  upsert_commitment_milestone: ["commitmentMilestones", "commitment_milestone", "commitment-milestone"],
  upsert_incentive_project: ["incentiveProjects", "incentive_project", "incentive-project"],
  upsert_department_reward_budget: ["departmentRewardBudgets", "department_reward_budget", "department-reward-budget"],
  upsert_monthly_report: ["monthlyReports", "monthly_report", "monthly-report"],
  upsert_objective: ["objectives", "objective", "objective"],
  upsert_metric: ["metrics", "metric", "metric"],
  upsert_project: ["projects", "project", "project"],
  upsert_milestone: ["milestones", "milestone", "milestone"],
  upsert_risk: ["risks", "risk", "risk"],
  upsert_decision: ["decisionRequests", "decision", "decision"],
  upsert_status_update: ["statusUpdates", "status_update", "status-update"]
};

export function reducePlatformState(input, action = {}) {
  if (action.type === "apply_personal_todo_status" && action.remoteSnapshotKey) {
    const current = Array.isArray(input?.personalTodos) ? input.personalTodos.find(item => item.id === action.id) : null;
    if (current?.dingTodo?.remoteSnapshotKey === action.remoteSnapshotKey) return input;
  }
  const state = normalizePlatformState(input);
  const timestamp = action.timestamp || nowIso();

  if (action.type === "update_monthly_snapshot") throw new Error("月度经营快照不可修改。");

  if (action.type === "replace_personal_todos") {
    const personalTodos = Array.isArray(action.todos) ? action.todos.map(item => ({ ...item, dingTodo: { ...(item.dingTodo || {}) } })) : [];
    if (JSON.stringify(personalTodos) === JSON.stringify(state.personalTodos)) return input;
    return { ...state, updatedAt: timestamp, personalTodos };
  }

  if (action.type === "update_personal_todo_notification") {
    let changed = false;
    const personalTodos = state.personalTodos.map(item => {
      if (item.id !== action.id) return item;
      changed = true;
      return {
        ...item,
        dingTodo: { ...(item.dingTodo || {}), ...(action.dingTodo || {}) },
        updatedAt: timestamp
      };
    });
    return changed ? { ...state, updatedAt: timestamp, personalTodos } : state;
  }

  if (action.type === "apply_personal_todo_status") {
    const current = state.personalTodos.find(item => item.id === action.id);
    if (!current) return state;
    const status = action.status === "done" ? "done" : "pending";
    const personalTodos = state.personalTodos.map(item => item.id === action.id ? {
      ...item,
      status,
      completedAt: status === "done" ? (action.completedAt || timestamp) : "",
      completedFrom: status === "done" ? (action.completedFrom || "platform") : "",
      dingTodo: {
        ...(item.dingTodo || {}),
        ...(action.dingTodo || {}),
        ...(action.remoteSnapshotKey ? { remoteSnapshotKey: action.remoteSnapshotKey } : {})
      },
      updatedAt: timestamp
    } : item);
    const auditAction = action.auditAction || (status === "done"
      ? action.completedFrom === "dingtalk" ? "complete_from_dingtalk" : "complete"
      : action.completedFrom === "dingtalk" ? "reopen_from_dingtalk" : "reopen");
    return audit({ ...state, updatedAt: timestamp, personalTodos }, {
      actor: action.actor,
      action: auditAction,
      entityType: "personal_todo",
      entityId: action.id,
      reason: action.reason || action.remoteSnapshotKey,
      timestamp
    });
  }

  if (action.type === "transition_department_commitment") {
    const current = state.departmentCommitments.find(item => item.id === action.id);
    if (!current) return state;
    const changed = transitionDepartmentCommitment(current, {
      type: action.transition,
      reason: action.reason,
      actor: action.actor,
      timestamp
    });
    const departmentCommitments = state.departmentCommitments.map(item => item.id === action.id ? changed : item);
    return audit({ ...state, updatedAt: timestamp, departmentCommitments }, {
      actor: action.actor,
      action: action.transition,
      entityType: "department_commitment",
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "transition_monthly_report") {
    const current = state.monthlyReports.find(item => item.id === action.id);
    if (!current) return state;
    const changed = transitionMonthlyReport(current, {
      type: action.transition,
      reason: action.reason,
      actor: action.actor,
      timestamp,
      meetingConclusion: action.meetingConclusion,
      text: action.text,
      patch: action.patch
    });
    const monthlyReports = state.monthlyReports.map(item => item.id === action.id ? changed : item);
    const latestCorrection = action.transition === "append_correction" ? changed.corrections?.at(-1) : null;
    const reportCorrections = latestCorrection
      ? upsert(state.reportCorrections, { ...latestCorrection, reportId: action.id })
      : state.reportCorrections;
    return audit({ ...state, updatedAt: timestamp, monthlyReports, reportCorrections }, {
      actor: action.actor,
      action: action.transition,
      entityType: "monthly_report",
      entityId: action.id,
      reason: action.reason || action.text,
      timestamp
    });
  }

  if (action.type === "settle_incentive_project") {
    const current = state.incentiveProjects.find(item => item.id === action.id);
    if (!current) return state;
    const changed = settleIncentiveProject(current, { ...(action.award || {}), decidedAt: action.award?.decidedAt || timestamp });
    const incentiveProjects = state.incentiveProjects.map(item => item.id === action.id ? changed : item);
    return audit({ ...state, updatedAt: timestamp, incentiveProjects }, {
      actor: action.actor,
      action: "settle",
      entityType: "incentive_project",
      entityId: action.id,
      reason: changed.rewardReason,
      timestamp
    });
  }

  if (action.type === "ensure_monthly_reports") {
    const monthlyReports = ensureMonthlyReports(state, action.month, action.departments);
    if (monthlyReports.length === state.monthlyReports.length) return input;
    return audit({ ...state, updatedAt: timestamp, monthlyReports }, {
      actor: action.actor,
      action: "generate",
      entityType: "monthly_report_batch",
      entityId: action.month,
      reason: `${monthlyReports.length - state.monthlyReports.length} 个部门`,
      timestamp
    });
  }

  if (ACTION_COLLECTION[action.type]) {
    const [collection, entityType, prefix] = ACTION_COLLECTION[action.type];
    const existing = state[collection].find(item => item.id === action.record?.id);
    if (action.type === "upsert_incentive_project" && existing?.status === "closed") {
      throw new Error("已结项激励项目不可修改。");
    }
    if (action.type === "upsert_monthly_report" && existing?.status === "frozen") {
      throw new Error("已冻结月报不可覆盖，只能追加更正记录。");
    }
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

  if (action.type === "archive_strategy") {
    const strategy = state.strategies.find(item => item.id === action.id && !item.archived);
    if (!strategy) return state;
    const activeCommitments = state.departmentCommitments.filter(item => (
      item.strategyId === action.id
      && !item.archived
      && !["completed", "cancelled"].includes(item.status)
    ));
    if (activeCommitments.length) throw new Error("请先完成或取消关联的部门承诺。");
    const linkedObjectiveIds = new Set(state.objectives.filter(item => item.strategyId === action.id && !item.archived).map(item => item.id));
    const activeProjects = state.projects.filter(item => (
      (item.strategyId === action.id || linkedObjectiveIds.has(item.objectiveId))
      && !item.archived
      && !["completed", "cancelled"].includes(item.status)
    ));
    if (activeProjects.length) throw new Error("请先完成或取消关联的重点项目。");
    return audit({
      ...state,
      updatedAt: timestamp,
      strategies: archiveMatching(state.strategies, item => item.id === action.id, action, timestamp),
      requiredResults: archiveMatching(state.requiredResults, item => item.strategyId === action.id, action, timestamp)
    }, {
      actor: action.actor,
      action: "archive",
      entityType: "strategy",
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_required_result") {
    if (!state.requiredResults.some(item => item.id === action.id && !item.archived)) return state;
    const linkedCommitments = state.departmentCommitments.filter(item => item.requiredResultId === action.id && !item.archived);
    if (linkedCommitments.length) throw new Error("该必达结果仍有关联部门任务，请先迁移或归档部门任务。");
    return audit({
      ...state,
      updatedAt: timestamp,
      requiredResults: archiveMatching(state.requiredResults, item => item.id === action.id, action, timestamp)
    }, {
      actor: action.actor,
      action: "archive",
      entityType: "required_result",
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_department_commitment") {
    const commitment = state.departmentCommitments.find(item => item.id === action.id && !item.archived);
    if (!commitment) return state;
    if (!["draft", "returned"].includes(commitment.status)) {
      throw new Error("只有草稿或退回状态的部门承诺可以归档；执行中的承诺请先取消。");
    }
    return audit({
      ...state,
      updatedAt: timestamp,
      departmentCommitments: archiveMatching(state.departmentCommitments, item => item.id === action.id, action, timestamp),
      commitmentMilestones: archiveMatching(state.commitmentMilestones, item => item.commitmentId === action.id, action, timestamp)
    }, {
      actor: action.actor,
      action: "archive",
      entityType: "department_commitment",
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_commitment_milestone") {
    if (!state.commitmentMilestones.some(item => item.id === action.id && !item.archived)) return state;
    return audit({
      ...state,
      updatedAt: timestamp,
      commitmentMilestones: archiveMatching(state.commitmentMilestones, item => item.id === action.id, action, timestamp)
    }, {
      actor: action.actor,
      action: "archive",
      entityType: "commitment_milestone",
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_project") {
    if (!state.projects.some(item => item.id === action.id && !item.archived)) return state;
    return audit({
      ...state,
      updatedAt: timestamp,
      projects: archiveMatching(state.projects, item => item.id === action.id, action, timestamp),
      milestones: archiveMatching(state.milestones, item => item.projectId === action.id, action, timestamp),
      risks: archiveMatching(state.risks, item => item.projectId === action.id, action, timestamp),
      decisionRequests: archiveMatching(state.decisionRequests, item => item.projectId === action.id, action, timestamp)
    }, {
      actor: action.actor,
      action: "archive",
      entityType: "project",
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_project_child") {
    const collection = String(action.collection || "");
    const allowed = { milestones: "milestone", risks: "risk", decisionRequests: "decision" };
    if (!allowed[collection]) throw new Error("不支持归档该项目记录。");
    if (!state[collection].some(item => item.id === action.id && !item.archived)) return state;
    return audit({
      ...state,
      updatedAt: timestamp,
      [collection]: archiveMatching(state[collection], item => item.id === action.id, action, timestamp)
    }, {
      actor: action.actor,
      action: "archive",
      entityType: allowed[collection],
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_incentive_project") {
    const project = state.incentiveProjects.find(item => item.id === action.id && !item.archived);
    if (!project) return state;
    if (!["draft", "cancelled"].includes(project.status)) {
      throw new Error("只有草稿或已取消的激励项目可以归档；执行中的项目请先取消。");
    }
    return audit({
      ...state,
      updatedAt: timestamp,
      incentiveProjects: archiveMatching(state.incentiveProjects, item => item.id === action.id, action, timestamp)
    }, {
      actor: action.actor,
      action: "archive",
      entityType: "incentive_project",
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_monthly_report") {
    const report = state.monthlyReports.find(item => item.id === action.id && !item.archived);
    if (!report) return state;
    if (report.status !== "draft") throw new Error("只有草稿月报可以归档，已提交月报保留为管理记录。");
    return audit({
      ...state,
      updatedAt: timestamp,
      monthlyReports: archiveMatching(state.monthlyReports, item => item.id === action.id, action, timestamp)
    }, {
      actor: action.actor,
      action: "archive",
      entityType: "monthly_report",
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_status_update") {
    if (!state.statusUpdates.some(item => item.id === action.id && !item.archived)) return state;
    return audit({
      ...state,
      updatedAt: timestamp,
      statusUpdates: archiveMatching(state.statusUpdates, item => item.id === action.id, action, timestamp)
    }, {
      actor: action.actor,
      action: "archive",
      entityType: "status_update",
      entityId: action.id,
      reason: action.reason,
      timestamp
    });
  }

  if (action.type === "archive_entity") {
    const collection = String(action.collection || "");
    if (!PLATFORM_COLLECTIONS.includes(collection)) return state;
    const records = archiveMatching(state[collection], item => item.id === action.id, action, timestamp);
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
