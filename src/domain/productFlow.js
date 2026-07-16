import { DEFAULT_PERMISSIONS, normalizePermissions } from "./permissions.js";
import { normalizeMonthlyGmvTarget } from "./productGmv.js";

export const PRODUCT_LEVELS = ["P0 战略级", "P1 增长级", "P2 验证级", "P3 常规级"];
export const RESERVE_LEVEL = "O级储备";
export const DEMAND_POOL_STATUSES = ["待讨论", "讨论中", "已讨论", "暂缓"];
export const TASK_CATEGORIES = ["会前准备", "会议", "决策", "待办任务"];

const PRODUCT_COVER_LIBRARY = [
  { keywords: /兔|草架/, url: "https://images.unsplash.com/photo-1585110396000-c9ffd4e4b308?auto=format&fit=crop&w=480&q=82" },
  { keywords: /仓鼠|豚鼠|鼠|冻干|降温窝/, url: "https://images.unsplash.com/photo-1425082661705-1834bfd09dca?auto=format&fit=crop&w=480&q=82" },
  { keywords: /猫/, url: "https://images.unsplash.com/photo-1574158622682-e40e69881006?auto=format&fit=crop&w=480&q=82" },
  { keywords: /狗|犬/, url: "https://images.unsplash.com/photo-1552053831-71594a27632d?auto=format&fit=crop&w=480&q=82" },
  { keywords: /鱼|水族/, url: "https://images.unsplash.com/photo-1522069169874-c58ec4b76be5?auto=format&fit=crop&w=480&q=82" },
  { keywords: /鹦鹉|鸟|站杆|谷物棒/, url: "https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=480&q=82" }
];

const DEFAULT_PRODUCT_COVER = "https://images.unsplash.com/photo-1548767797-d8c844163c4c?auto=format&fit=crop&w=480&q=82";

export function generateProductCover(name = "") {
  return PRODUCT_COVER_LIBRARY.find(item => item.keywords.test(String(name || "")))?.url || DEFAULT_PRODUCT_COVER;
}

const LEGACY_TASK_CATEGORY_MAP = {
  "会议/决策": "会议",
  "会后交付": "待办任务",
  "准入条件": "待办任务"
};

export function normalizeTaskCategory(category = "") {
  const normalized = LEGACY_TASK_CATEGORY_MAP[String(category || "").trim()] || String(category || "").trim();
  return TASK_CATEGORIES.includes(normalized) ? normalized : TASK_CATEGORIES[0];
}

export function taskCategoryActions(category) {
  const normalized = normalizeTaskCategory(category);
  return {
    meeting: normalized === "会议",
    todo: normalized === "会前准备" || normalized === "决策" || normalized === "待办任务"
  };
}

export const PRODUCT_GRADING_DIMENSIONS = [
  {
    key: "strategy",
    title: "A. 战略价值",
    options: ["边缘补充", "支撑部门目标", "支撑部门关键结果", "关联公司级目标", "承担公司核心目标"]
  },
  {
    key: "salesScale",
    title: "B1. 年 GMV 贡献参考",
    options: ["＜30万", "30-100万", "100-300万", "300-600万", "＞600万"]
  },
  {
    key: "commercialValue",
    title: "B2. 商业综合价值",
    options: ["价值较弱", "基础商业价值", "健康毛利与复购潜力", "高毛利且可扩渠道", "战略商业与品牌价值"]
  },
  {
    key: "resourceDemand",
    title: "C1. 开发周期与资源",
    options: ["1周内轻量上线", "简单改款", "1-2个月三方协同", "约3个月跨部门", "＞3个月全链路协同"]
  }
];

export const PRODUCT_GRADING_RISKS = [
  { key: "firstSupplier", label: "首次合作供应商", adjustment: 0.5 },
  { key: "inventory", label: "库存风险极大", adjustment: 0.5 },
  { key: "formulaChange", label: "核心配方变更 / 新原料引入", adjustment: 0.5 },
  { key: "newRegulation", label: "涉及新法规 / 新品类", adjustment: 1 }
];

export const DEMAND_POOL_STANDARDS = [
  {
    title: "1. 收集机会",
    summary: "一句话、链接、截图或用户反馈先进池子。",
    check: "先收集，不在入口处过度判断。"
  },
  {
    title: "2. 讨论判断",
    summary: "补齐市场、用户、供应链和资源判断。",
    check: "讨论摘要沉淀判断依据。"
  },
  {
    title: "3. 形成结论",
    summary: "明确是否继续推进和建议产品定级。",
    check: "结论明确后才允许立项。"
  },
  {
    title: "4. 进入立项",
    summary: "生成产品档案，进入立项。",
    check: "进入立项后在立项会正式确认等级。"
  }
];

export const DEMAND_STATUS_SUMMARIES = {
  "待讨论": "待讨论：需要补齐机会背景、用户痛点、竞品情况、供应链可行性和资源投入。",
  "讨论中": "讨论中：请记录主要争议、关键假设、补充资料和下一步动作。",
  "已讨论": "已讨论：结论明确，可以进入立项，由立项会正式确认产品等级和投入边界。",
  "暂缓": "暂缓：记录暂缓原因、重新评估条件和预计复盘时间。"
};

export const DEFAULT_ORG_CACHE = {
  departments: [
    { id: "dept-exec", name: "总经办" },
    { id: "dept-product", name: "产品部" },
    { id: "dept-ops", name: "运营" },
    { id: "dept-brand", name: "品牌" },
    { id: "dept-cs", name: "客服" },
    { id: "dept-supply", name: "供应链" },
    { id: "dept-finance", name: "财务" }
  ],
  users: [
    { userid: "u-zhou", unionid: "union-zhou", name: "周荣庆", title: "总经理", department: "总经办", departments: ["总经办"] },
    { userid: "u-ye", name: "叶津成", title: "产品负责人", department: "产品部", departments: ["产品部"] },
    { userid: "u-zhao", name: "赵雨涵", title: "产品经理", department: "产品部", departments: ["产品部"] },
    { userid: "u-chenfei", name: "陈菲", title: "运营", department: "运营", departments: ["运营"] },
    { userid: "u-chenmingyi", name: "陈铭懿", title: "品牌助理", department: "品牌", departments: ["品牌"] },
    { userid: "u-chenyuxin", name: "陈语欣", title: "剪辑师", department: "品牌", departments: ["品牌"] }
  ],
  syncedAt: ""
};

export const STAGES = [
  { index: 0, title: "机会准备", short: "机会", goal: "判断机会是否值得立项" },
  { index: 1, title: "立项", short: "立项", goal: "正式确认产品等级和投入边界" },
  { index: 2, title: "打样研发", short: "研发", goal: "把 PRD 转成可量产标准样" },
  { index: 3, title: "测试验证", short: "测试", goal: "验证产品力、风险和内容素材" },
  { index: 4, title: "上市筹备", short: "上市", goal: "准备资料包、实物、时间表和交付物" },
  { index: 5, title: "产品复盘", short: "复盘", goal: "看经营表现，判断升级、维持、清仓或淘汰" }
];

export const PRODUCT_LEVEL_FLOW_RULES = {
  "P0 战略级": {
    usage: "走完整五阶段流程",
    stages: ["必走", "必走", "必走", "必走", "必走", "每月复盘"]
  },
  "P1 增长级": {
    usage: "保留完整主流程，但简化部分会议和资料深度",
    stages: ["建议", "必走", "关键节点", "核心测试", "必走", "每两月"]
  },
  "P2 验证级": {
    usage: "重点走立项、验证和试销复盘",
    stages: ["轻量", "简化", "可选", "内部验证", "线上同步", "季度复盘"]
  },
  "P3 常规级": {
    usage: "走轻量化开发流程",
    stages: ["轻量", "线上确认", "不涉及", "不涉及", "不涉及", "季度复盘"]
  }
};

const DEFAULT_PRODUCTS = [
  { id: "p1", name: "鹦鹉谷物棒", level: "P1 增长级", referenceLevel: "P1 增长级", levelConfirmed: true, monthlyGmvTarget: 150000, grading: { answers: { strategy: 4, salesScale: 3, commercialValue: 3, resourceDemand: 4, risks: {} } }, requester: "周荣庆", productManager: "赵雨涵", owner: "赵雨涵", source: "产品部", status: "开发中", stage: 2, desc: "围绕鹦鹉零食做内容化卖点，当前正在打样和包装确认。", image: "https://images.unsplash.com/photo-1552728089-57bdde30beb3?auto=format&fit=crop&w=240&q=80" },
  { id: "p2", name: "仓鼠冻干零食", level: "P0 战略级", referenceLevel: "P0 战略级", levelConfirmed: true, monthlyGmvTarget: 400000, grading: { answers: { strategy: 5, salesScale: 4, commercialValue: 4, resourceDemand: 5, risks: {} } }, requester: "陈菲", productManager: "叶津成", owner: "叶津成", source: "运营", status: "维持观察", stage: 5, desc: "已上市，首月数据较好，等待季度复盘决定是否加大推广。", image: "https://images.unsplash.com/photo-1425082661705-1834bfd09dca?auto=format&fit=crop&w=240&q=80" }
];

export const REVIEW_MEETINGS = [
  { id: "project", name: "立项评审会", stage: 1, fileName: "立项评审会议纪要" },
  { id: "sample", name: "样品评审会", stage: 2, fileName: "样品评审会议纪要" },
  { id: "launch", name: "上市启动会", stage: 4, fileName: "上市启动会纪要" },
  { id: "review", name: "产品复盘会", stage: 5, fileName: "产品复盘决策记录" }
];

const DEFAULT_DEMANDS = [
  { id: "d1", name: "鹦鹉站杆升级版", level: "P1 增长级", requester: "叶津成", owner: "叶津成", source: "客服", status: "待讨论", productId: "", createdAt: "2026-07-02T16:00:00.000Z", desc: "用户反馈站杆稳定性和清洁便利性有优化空间，需要判断是否做结构升级。", discussion: "待讨论：补充用户痛点、现有差评、供应链可行性和预估成本。" },
  { id: "d2", name: "仓鼠夏季降温窝", level: "P3 常规级", requester: "赵雨涵", owner: "赵雨涵", source: "运营", status: "讨论中", productId: "", createdAt: "2026-07-02T16:00:00.000Z", desc: "夏季搜索和内容热度上升，运营希望提前评估应季窗口。", discussion: "讨论中：需要确认开发周期、上市窗口、首批铺货和过季库存预案。" },
  { id: "d3", name: "兔用草架旧款包装微调", level: "P2 验证级", requester: "赵雨涵", owner: "赵雨涵", source: "品牌", status: "暂缓", productId: "", createdAt: "2026-06-29T16:00:00.000Z", desc: "品牌提出包装视觉老旧，但当前清仓优先级更高。", discussion: "暂缓：等库存处理后再判断是否升级包装。" }
];

export function normalizeProductLevel(level = "") {
  const text = String(level || "").toUpperCase();
  return PRODUCT_LEVELS.find(item => text.includes(item.slice(0, 2))) || "P1 增长级";
}

function gradingManagement(level, riskBand) {
  const base = level === "P0 战略级"
    ? { management: "部门负责人牵头，完整PRD、排期、风险预案和测试方案", reviewFrequency: "每月" }
    : level === "P1 增长级"
      ? { management: "产品经理主导，标准PRD和上市资料", reviewFrequency: "每两月" }
      : level === "P2 验证级"
        ? { management: "产品与运营共同验证，控制测试规模和库存", reviewFrequency: "每季度" }
        : level === "P3 常规级"
          ? { management: "简版需求单和基础核验，控制库存与周期", reviewFrequency: "每季度" }
          : { management: "退回需求池，只保留调研与机会判断", reviewFrequency: "每月集中筛选" };
  if (riskBand !== "高风险" || level === RESERVE_LEVEL) return base;
  return {
    ...base,
    management: `高风险管理：等级不降低；设置风险预案和阶段闸门，必要时缩小验证或上提评审。${base.management}`
  };
}

export function calculateProductGrade(input = {}) {
  const answers = {
    strategy: Number(input.strategy) || 0,
    salesScale: Number(input.salesScale) || 0,
    commercialValue: Number(input.commercialValue) || 0,
    resourceDemand: Number(input.resourceDemand) || 0,
    risks: { ...(input.risks || {}) }
  };
  const complete = [answers.strategy, answers.salesScale, answers.commercialValue, answers.resourceDemand]
    .every(score => score >= 1 && score <= 5);
  if (!complete) return { complete: false, answers, level: "" };

  const valueScore = answers.strategy + answers.salesScale + answers.commercialValue;
  const riskAdjustment = Math.min(2, PRODUCT_GRADING_RISKS.reduce((total, risk) => (
    total + (answers.risks[risk.key] ? risk.adjustment : 0)
  ), 0));
  const riskScore = riskAdjustment === 0 ? 1 : riskAdjustment <= 1 ? 3 : 5;
  const resourceScore = answers.resourceDemand;
  const valueBand = valueScore >= 13 ? "S级" : valueScore >= 10 ? "A级" : valueScore >= 7 ? "B级" : "C级";
  const resourceBand = resourceScore >= 5 ? "高投入" : resourceScore >= 3 ? "中投入" : "低投入";
  const riskBand = riskScore >= 5 ? "高风险" : riskScore >= 3 ? "中风险" : "低风险";

  let level;
  if (valueScore >= 13) level = "P0 战略级";
  else if (valueScore >= 10) level = "P1 增长级";
  else if (valueScore >= 7) level = "P2 验证级";
  else level = resourceScore >= 5 ? RESERVE_LEVEL : "P3 常规级";

  let rule = "矩阵定级";
  if (answers.strategy === 5) {
    level = "P0 战略级";
    rule = "A=5：直接P0";
  } else if (answers.strategy === 1 && answers.salesScale <= 2 && answers.commercialValue <= 2) {
    level = RESERVE_LEVEL;
    rule = "A=1且B1/B2较低：退回O级储备";
  } else if (answers.salesScale >= 4 && answers.commercialValue >= 4 && answers.strategy >= 3) {
    if (!["P0 战略级", "P1 增长级"].includes(level)) level = "P1 增长级";
    rule = "高销售与高商业价值：P1保底";
  }

  const highRisk = riskBand === "高风险";
  let route = level === "P0 战略级"
    ? "必须推进"
    : level === "P1 增长级"
      ? (resourceBand === "低投入" ? "快速通道" : "标准推进")
      : level === "P2 验证级"
        ? "小成本验证"
        : level === "P3 常规级"
          ? "轻量推进"
          : "机会储备";
  if (highRisk && ["P0 战略级", "P1 增长级"].includes(level)) route = "分阶段推进";
  if (highRisk && ["P2 验证级", "P3 常规级"].includes(level)) route = "缩小验证";
  const riskNote = highRisk ? "高风险不降低产品等级，提升管理强度并设置阶段闸门" : `${riskBand}，按对应流程管理`;

  return {
    complete: true,
    answers,
    valueScore,
    riskAdjustment,
    riskScore,
    riskDisplayScore: riskScore,
    resourceScore,
    investmentScore: resourceScore,
    valueBand,
    resourceBand,
    riskBand,
    level,
    route,
    rule,
    riskNote,
    ...gradingManagement(level, riskBand)
  };
}

export function hasFormalProductGrading(product) {
  return Boolean(product?.levelConfirmed && calculateProductGrade(product?.grading?.answers || {}).complete);
}

export function orgDepartments(orgCache = DEFAULT_ORG_CACHE) {
  const departments = Array.isArray(orgCache?.departments) && orgCache.departments.length
    ? orgCache.departments
    : DEFAULT_ORG_CACHE.departments;
  return departments
    .map(department => typeof department === "string" ? department : department?.name)
    .filter(Boolean);
}

function departmentNameKey(value) {
  return String(value || "")
    .replace(/\s+/g, "")
    .replace(/部门$/, "")
    .replace(/部$/, "")
    .replace(/团队$/, "");
}

export function normalizeDepartmentSelection(value, orgCache = DEFAULT_ORG_CACHE) {
  const names = orgDepartments(orgCache);
  const tokens = String(value || "")
    .replaceAll("供应链/采购", "供应链")
    .split(/[\/、,，;；|]/)
    .map(item => item.trim())
    .filter(Boolean);
  return [...new Set(tokens.map(token => (
    names.find(name => name === token)
      || names.find(name => departmentNameKey(name) === departmentNameKey(token))
      || token
  )))].join(" / ");
}

export function orgUsers(orgCache = DEFAULT_ORG_CACHE) {
  const users = Array.isArray(orgCache?.users) && orgCache.users.length
    ? orgCache.users
    : DEFAULT_ORG_CACHE.users;
  return users
    .map(user => ({
      userid: user.userid || user.userId || user.id || user.name,
      unionid: user.unionid || user.unionId || "",
      name: user.name,
      title: user.title || user.position || user.jobTitle || "成员",
      department: user.department || user.deptName || user.departmentNames?.[0] || user.departments?.[0] || "未分组",
      departments: user.departments || user.departmentNames || [user.department || user.deptName].filter(Boolean)
    }))
    .filter(user => user.name);
}

export function visibleDemandPool(demands = []) {
  return demands.filter(item => !item.productId && DEMAND_POOL_STATUSES.includes(item.status));
}

export function canConvertDemandToProject(demand) {
  return Boolean(demand && demand.status === "已讨论" && !demand.productId);
}

export function updateDemandRecord(state, demandId, patch) {
  return {
    ...state,
    demands: state.demands.map(demand => {
      if (demand.id !== demandId) return demand;
      const next = { ...demand, ...patch };
      if (Object.hasOwn(patch, "requester")) next.owner = patch.requester;
      if (patch.status && !stripHtml(demand.discussion)) {
        next.discussion = DEMAND_STATUS_SUMMARIES[patch.status] || demand.discussion;
      }
      return next;
    })
  };
}

export function stagePolicy(product, stageIndex) {
  const rule = PRODUCT_LEVEL_FLOW_RULES[normalizeProductLevel(product?.level)];
  const mode = rule.stages[stageIndex] || "不涉及";
  return { mode, applies: mode !== "不涉及", usage: rule.usage };
}

const TASK_TEMPLATE_BLUEPRINTS = {
  "P0 战略级": [
    [1, "会前准备", "准备完整立项评审材料，确认产品等级、投入和参与部门", "产品部", "完整立项材料"],
    [1, "会议", "召开立项评审会并形成正式决策", "总经办", "立项评审纪要"],
    [2, "会前准备", "完成完整 PRD、排期、风险预案和标准样要求", "产品部", "完整 PRD 与打样标准"],
    [3, "会前准备", "完成内部、外部及第三方测试验证", "产品部", "完整测试报告"],
    [4, "会议", "完成上市终审并召开上市启动会", "运营", "上市启动会纪要"],
    [5, "决策", "按月复盘经营数据并形成去留决策", "运营", "月度产品复盘" ]
  ],
  "P1 增长级": [
    [1, "会前准备", "准备立项评审材料，正式确认产品等级、投入和参与部门", "产品部", "立项材料"],
    [1, "会议", "完成立项评审会并补齐会议纪要", "产品部", "立项纪要"],
    [2, "会前准备", "样品确认和打样标准", "产品部", "样品确认和打样标准"],
    [3, "会前准备", "核心测试记录", "产品部", "核心测试记录"],
    [4, "会前准备", "上市资料准备", "运营", "上市资料准备"],
    [5, "决策", "产品经营复盘与去留决策", "运营", "双月产品复盘"]
  ],
  "P2 验证级": [
    [1, "会前准备", "完成精简 PRD、验证假设和投入上限", "产品部", "精简立项材料"],
    [2, "会前准备", "产品部确认验证样品和基础标准", "产品部", "验证样品记录"],
    [3, "会前准备", "组织内部 3-5 人验证并记录结果", "产品部", "内部验证记录"],
    [4, "待办任务", "完成线上上市信息同步", "运营", "线上同步记录"],
    [5, "决策", "按季度复盘验证结果并做去留决策", "运营", "季度验证复盘"]
  ],
  "P3 常规级": [
    [1, "会前准备", "一页纸概念和线上确认记录即可进入常规开发", "产品部", "产品概念页"],
    [5, "决策", "完成 30 天简版复盘并控制库存和周期", "运营", "30 天简版复盘"]
  ]
};

export const DEFAULT_TASK_TEMPLATES = Object.entries(TASK_TEMPLATE_BLUEPRINTS).flatMap(([level, rows]) => rows.map((row, index) => {
  const [stage, category, title, ownerDept, deliverable] = row;
  return {
    id: `${level.slice(0, 2).toLowerCase()}-s${stage}-${index + 1}`,
    level,
    stage,
    category,
    title,
    ownerDept,
    deliverable,
    required: false,
    deliverableTemplates: []
  };
}));

function normalizeDeliverableTemplates(templates = []) {
  return (Array.isArray(templates) ? templates : []).map((template, index) => ({
    id: template.id || `doc-template-${index + 1}`,
    name: String(template.name || "").trim(),
    url: String(template.url || "").trim()
  })).filter(template => template.name && template.url);
}

function normalizeTaskTemplate(template, index = 0) {
  const level = normalizeProductLevel(template?.level);
  const stage = Math.min(STAGES.length - 1, Math.max(1, Number(template?.stage) || 1));
  return {
    id: template?.id || `task-template-${Date.now()}-${index}`,
    level,
    stage,
    category: normalizeTaskCategory(template?.category),
    title: String(template?.title || "新任务").trim() || "新任务",
    ownerDept: String(template?.ownerDept || "产品部").trim() || "产品部",
    deliverable: String(template?.deliverable || "待补充").trim() || "待补充",
    required: Boolean(template?.required),
    deliverableTemplates: normalizeDeliverableTemplates(template?.deliverableTemplates)
  };
}

export function taskTemplatesForProductStage(state, product, stageIndex) {
  const templates = Array.isArray(state?.settings?.taskTemplates) ? state.settings.taskTemplates : DEFAULT_TASK_TEMPLATES;
  const level = normalizeProductLevel(product?.level);
  return templates.filter(template => template.level === level && Number(template.stage) === Number(stageIndex));
}

function defaultStageTasks(state, product, stageIndex) {
  return taskTemplatesForProductStage(state, product, stageIndex).map(template => ({
    id: `${product.id}-template-${template.id}`,
    templateId: template.id,
    productId: product.id,
    stage: stageIndex,
    systemDefault: true,
    category: template.category,
    title: template.title,
    ownerDept: template.ownerDept,
    deliverable: template.deliverable,
    required: Boolean(template.required),
    deliverableTemplates: normalizeDeliverableTemplates(template.deliverableTemplates),
    due: "",
    done: false
  }));
}

export function syncDefaultTasksForProduct(state, product, { applyTemplateFields = false } = {}) {
  const generated = STAGES.filter(stage => stage.index > 0).flatMap(stage => defaultStageTasks(state, product, stage.index));
  const existingDefaults = (state.tasks || []).filter(task => task.productId === product.id && task.systemDefault);
  const usedExistingIds = new Set();
  const synced = generated.map(task => {
    const existing = existingDefaults.find(item => !usedExistingIds.has(item.id) && item.templateId === task.templateId)
      || existingDefaults.find(item => !usedExistingIds.has(item.id) && Number(item.stage) === Number(task.stage) && item.title === task.title);
    if (!existing) return task;
    usedExistingIds.add(existing.id);
    return {
      ...task,
      ...existing,
      id: existing.id || task.id,
      templateId: task.templateId,
      productId: task.productId,
      stage: task.stage,
      systemDefault: true,
      ...(applyTemplateFields ? {
        category: task.category,
        title: task.title,
        ownerDept: task.ownerDept,
        deliverable: task.deliverable,
        required: task.required,
        deliverableTemplates: task.deliverableTemplates
      } : {}),
      due: existing.due || "",
      done: Boolean(existing.done),
      ...(existing.dingTodo ? { dingTodo: existing.dingTodo } : {}),
      ...(existing.dingMeeting ? { dingMeeting: existing.dingMeeting } : {})
    };
  });
  const custom = (state.tasks || []).filter(task => task.productId !== product.id || !task.systemDefault);
  return { ...state, tasks: [...custom, ...synced] };
}

export function updateWorkflowTaskTemplates(state, templates) {
  const taskTemplates = (Array.isArray(templates) ? templates : []).map(normalizeTaskTemplate);
  let next = { ...state, settings: { ...(state.settings || {}), taskTemplates } };
  (next.products || []).forEach(product => {
    next = syncDefaultTasksForProduct(next, product, { applyTemplateFields: true });
  });
  return next;
}

export function updateProductRecord(state, productId, patch) {
  const currentProduct = state.products.find(product => product.id === productId);
  if (!currentProduct) return state;
  const updatedProduct = {
    ...currentProduct,
    ...patch,
    level: patch.level ? normalizeProductLevel(patch.level) : currentProduct.level,
    owner: Object.hasOwn(patch, "productManager") ? patch.productManager : currentProduct.owner
  };
  const updatedState = {
    ...state,
    products: state.products.map(product => product.id === productId ? updatedProduct : product)
  };
  return patch.level && normalizeProductLevel(patch.level) !== normalizeProductLevel(currentProduct.level)
    ? syncDefaultTasksForProduct(updatedState, updatedProduct)
    : updatedState;
}

export function moveProductToStage(state, productId, stage) {
  const product = state.products.find(item => item.id === productId);
  if (!product) return state;
  if (Number(stage) > 1 && !product.productManager) return state;
  if (Number(stage) > 1 && !product.levelConfirmed) return state;
  const movingBackward = Number(stage) < Number(product.stage || 0);
  return {
    ...state,
    products: state.products.map(item => item.id === productId ? { ...item, stage } : item),
    tasks: (state.tasks || []).map(task => {
      if (!movingBackward || task.productId !== productId || Number(task.stage) <= Number(stage)) return task;
      const { todoSyncedAt, ...rest } = task;
      return { ...rest, done: false };
    }),
    reviews: (state.reviews || []).map(review => (
      movingBackward && review.productId === productId && Number(review.stage) > Number(stage)
        ? { ...review, minutes: "" }
        : review
    ))
  };
}

export function advanceProductToNextStage(state, productId) {
  const product = state.products.find(item => item.id === productId);
  if (!product) return state;
  const currentStage = Math.max(1, Number(product.stage) || 1);
  if (currentStage >= STAGES.length - 1) return state;
  return moveProductToStage(state, productId, currentStage + 1);
}

export function applyProductGrading(state, productId, grading, options = {}) {
  const product = state.products.find(item => item.id === productId);
  if (!product || !grading?.complete) return state;
  const decidedAt = options.decidedAt || new Date().toISOString().slice(0, 10);
  const gradingRecord = { ...grading, gradedBy: options.gradedBy || product.productManager || "", decidedAt };
  const matchedDemand = state.demands.find(item => item.productId === productId);

  if (grading.level === RESERVE_LEVEL) {
    const reason = `立项评分结果为${RESERVE_LEVEL}，已自动退回需求池并清除产品进度。${grading.rule}`;
    const returnedDemand = {
      id: matchedDemand?.id || `d-reserve-${Date.now()}`,
      name: product.name,
      level: RESERVE_LEVEL,
      requester: matchedDemand?.requester || product.requester || "",
      owner: matchedDemand?.requester || product.requester || "",
      source: matchedDemand?.source || product.source || "",
      status: "暂缓",
      productId: "",
      createdAt: matchedDemand?.createdAt || new Date().toISOString(),
      desc: matchedDemand?.desc || product.desc || "",
      discussion: [matchedDemand?.discussion, reason].filter(Boolean).join("\n"),
      grading: gradingRecord,
      reserveReason: reason
    };
    const demands = matchedDemand
      ? state.demands.map(item => item.id === matchedDemand.id ? returnedDemand : item)
      : [returnedDemand, ...state.demands];
    const products = state.products.filter(item => item.id !== productId);
    return {
      ...state,
      currentId: products[0]?.id || "",
      demands,
      products,
      tasks: (state.tasks || []).filter(item => item.productId !== productId),
      deliverables: (state.deliverables || []).filter(item => item.productId !== productId),
      reviews: (state.reviews || []).filter(item => item.productId !== productId),
      decisions: (state.decisions || []).filter(item => item.productId !== productId),
      dingMeetings: (state.dingMeetings || []).filter(item => item.productId !== productId)
    };
  }

  const updatedProduct = {
    ...product,
    level: grading.level,
    levelConfirmed: true,
    levelReason: grading.rule,
    levelDecidedAt: decidedAt,
    ...(Object.prototype.hasOwnProperty.call(options, "monthlyGmvTarget")
      ? { monthlyGmvTarget: normalizeMonthlyGmvTarget(options.monthlyGmvTarget) }
      : {}),
    grading: gradingRecord
  };
  const updatedState = {
    ...state,
    products: state.products.map(item => item.id === productId ? updatedProduct : item),
    demands: state.demands.map(item => item.productId === productId ? { ...item, level: grading.level, grading: gradingRecord } : item),
    decisions: [{
      id: `decision-${productId}-grading`,
      productId,
      title: "产品正式定级",
      summary: `${product.name} 正式定级为 ${grading.level} + ${grading.riskBand} + ${grading.route}。${grading.rule}`,
      created: decidedAt
    }, ...(state.decisions || []).filter(item => item.id !== `decision-${productId}-grading`)]
  };
  return syncDefaultTasksForProduct(updatedState, updatedProduct);
}

export function tasksForProductStage(state, product, stageIndex) {
  return (state.tasks || []).filter(task => task.productId === product?.id && task.stage === stageIndex);
}

export function deliverablesForTask(state, taskId) {
  return (state.deliverables || []).filter(file => file.taskId === taskId);
}

export function createDefaultState() {
  let state = {
    version: "react-v2",
    currentId: "p1",
    demands: DEFAULT_DEMANDS,
    products: DEFAULT_PRODUCTS,
    tasks: [],
    deliverables: DEFAULT_PRODUCTS.flatMap(product => defaultDeliverables(product)),
    reviews: DEFAULT_PRODUCTS.flatMap(product => defaultReviews(product)),
    decisions: [],
    dingMeetings: [],
    feedbackIssues: [],
    productPlans: [],
    config: {
      productLevels: PRODUCT_LEVELS,
      stageRules: PRODUCT_LEVEL_FLOW_RULES
    },
    orgCache: DEFAULT_ORG_CACHE,
    settings: { permissions: normalizePermissions(DEFAULT_PERMISSIONS), taskTemplates: DEFAULT_TASK_TEMPLATES.map(template => ({ ...template, deliverableTemplates: [...template.deliverableTemplates] })) }
  };
  state.products.forEach(product => {
    state = syncDefaultTasksForProduct(state, product);
  });
  return state;
}

function defaultDeliverables(product) {
  return [
    { id: `${product.id}-brief`, productId: product.id, name: `${product.name} 立项材料`, url: "#", type: "doc", created: "今天" },
    { id: `${product.id}-cover`, productId: product.id, name: `${product.name} 封面图`, url: product.image || "#", type: "image", created: "今天" }
  ];
}

function defaultReviews(product) {
  return REVIEW_MEETINGS.map(meeting => ({
    id: `${product.id}-${meeting.id}`,
    productId: product.id,
    meetingId: meeting.id,
    title: meeting.name,
    stage: meeting.stage,
    minutes: meeting.stage <= product.stage ? `${meeting.name}纪要待补充。` : "",
    owner: "产品部"
  }));
}

export function convertDemandToProject(state, demandId, options = {}) {
  const demand = state.demands.find(item => item.id === demandId);
  if (!canConvertDemandToProject(demand)) return state;
  const productId = options.productId || `p-${Date.now()}`;
  const product = {
    id: productId,
    name: demand.name,
    level: normalizeProductLevel(demand.level),
    referenceLevel: normalizeProductLevel(demand.level),
    requester: demand.requester || demand.owner || "",
    productManager: "",
    owner: "",
    source: demand.source,
    status: "开发中",
    stage: 1,
    desc: demand.desc,
    image: demand.image || generateProductCover(demand.name),
    levelConfirmed: false
  };
  const demands = state.demands.map(item => item.id === demandId ? { ...item, productId, status: "已转开发" } : item);
  return syncDefaultTasksForProduct({
    ...state,
    demands,
    products: [product, ...state.products],
    deliverables: [...defaultDeliverables(product), ...(state.deliverables || [])],
    reviews: [...defaultReviews(product), ...(state.reviews || [])],
    decisions: [{
      id: `decision-${productId}-created`,
      productId,
      title: "需求池进入立项",
      summary: `${demand.name} 已完成需求池讨论，生成产品档案并进入立项阶段。`,
      created: "今天"
    }, ...(state.decisions || [])],
    currentId: productId
  }, product);
}

export function reviewRowsForProduct(state, product) {
  return (state.reviews || []).filter(review => review.productId === product?.id);
}

export function stripHtml(value = "") {
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
