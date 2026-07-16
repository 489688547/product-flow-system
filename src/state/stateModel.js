import { calculateProductGrade, createDefaultState, generateProductCover, normalizeDepartmentSelection, normalizeProductLevel, normalizeTaskCategory, reviewRowsForProduct, STAGES, syncDefaultTasksForProduct } from "../domain/productFlow.js";
import { normalizeMonthlyGmvTarget } from "../domain/productGmv.js";
import { normalizeTaskDueDate } from "../domain/taskTodo.js";
import { normalizePermissions } from "../domain/permissions.js";
import { normalizeSkuCodes } from "../domain/salesData.js";
import { normalizeDemandCreatedAt } from "../domain/demandDate.js";
import { normalizeProductPlans } from "../domain/productPlanning.js";

function normalizeOrganizationLabels(value) {
  if (typeof value === "string") {
    return value
      .replaceAll(["高", "层"].join(""), "总经办")
      .replaceAll("产品团队", "产品部");
  }
  if (Array.isArray(value)) return value.map(normalizeOrganizationLabels);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, normalizeOrganizationLabels(item)]));
  }
  return value;
}

function normalizeWorkflowStage(value) {
  return Math.min(STAGES.length - 1, Math.max(1, Number(value) || 1));
}

function isLegacyGeneratedTask(task) {
  return task?.systemDefault == null && /^(?:id|idea)[a-f0-9]+$/i.test(String(task?.id || ""));
}

function stableTemplateId(signature) {
  let hash = 2166136261;
  for (const character of signature) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `legacy-template-${(hash >>> 0).toString(16)}`;
}

function primaryOwnerDepartment(value, orgCache) {
  return normalizeDepartmentSelection(value, orgCache) || "产品部";
}

function deriveLegacyTaskTemplates(state, fallbackTemplates) {
  const productsById = new Map((state.products || []).map(product => [product.id, product]));
  const derived = new Map();
  (state.tasks || []).filter(task => task.systemDefault).forEach(task => {
    const product = productsById.get(task.productId);
    if (!product) return;
    const level = normalizeProductLevel(product.level);
    const signature = [level, task.stage, task.category, task.title, task.ownerDept, task.deliverable].join("|");
    const id = task.templateId || stableTemplateId(signature);
    if (!derived.has(id)) {
      derived.set(id, {
        id,
        level,
        stage: normalizeWorkflowStage(task.stage),
        category: normalizeTaskCategory(task.category),
        title: task.title || "默认任务",
        ownerDept: primaryOwnerDepartment(task.ownerDept, state.orgCache),
        deliverable: task.deliverable || "待补充",
        deliverableTemplates: Array.isArray(task.deliverableTemplates) ? task.deliverableTemplates : []
      });
    }
  });
  const levelsWithLegacyTasks = new Set([...derived.values()].map(template => template.level));
  const fallback = (fallbackTemplates || [])
    .filter(template => !levelsWithLegacyTasks.has(template.level))
    .map(template => ({ ...template, ownerDept: primaryOwnerDepartment(template.ownerDept, state.orgCache) }));
  return [...fallback, ...derived.values()];
}

export function normalizeClientState(input) {
  const defaults = createDefaultState();
  const state = { ...defaults, ...normalizeOrganizationLabels(input || {}) };
  state.demands = (Array.isArray(state.demands) ? state.demands : defaults.demands).map(demand => {
    const requester = demand.requester || demand.owner || "";
    const { created: _legacyCreated, ...record } = demand;
    return { ...record, image: demand.image || generateProductCover(demand.name), createdAt: normalizeDemandCreatedAt(demand), requester, owner: requester };
  });
  state.products = (Array.isArray(state.products) ? state.products : defaults.products).map(product => {
    const matchedDemand = state.demands.find(demand => demand.productId === product.id);
    const defaultProduct = defaults.products.find(item => item.id === product.id || item.name === product.name);
    const requester = product.requester || matchedDemand?.requester || defaultProduct?.requester || "";
    const productManager = product.productManager || product.owner || "";
    const stage = normalizeWorkflowStage(product.stage);
    const referenceLevel = normalizeProductLevel(product.referenceLevel || matchedDemand?.level || product.level);
    const gradingResult = calculateProductGrade(product.grading?.answers || {});
    const levelConfirmed = Boolean(product.levelConfirmed && gradingResult.complete);
    const level = levelConfirmed ? gradingResult.level : normalizeProductLevel(product.level || referenceLevel);
    return { ...product, image: product.image || generateProductCover(product.name), level, referenceLevel, stage, levelConfirmed, requester, productManager, owner: productManager, skuCodes: normalizeSkuCodes(product.skuCodes), monthlyGmvTarget: normalizeMonthlyGmvTarget(product.monthlyGmvTarget) };
  });
  state.tasks = (Array.isArray(state.tasks) ? state.tasks : defaults.tasks)
    .filter(task => Number(task.stage) > 0)
    .map(task => ({ ...task, category: normalizeTaskCategory(task.category), ownerDept: normalizeDepartmentSelection(task.ownerDept, state.orgCache) || "产品部", required: Boolean(task.required), stage: normalizeWorkflowStage(task.stage), due: normalizeTaskDueDate(task.due), systemDefault: task.systemDefault ?? isLegacyGeneratedTask(task) }));
  state.deliverables = Array.isArray(state.deliverables) ? state.deliverables : [];
  state.reviews = (Array.isArray(state.reviews) ? state.reviews : []).map(review => ({ ...review, stage: normalizeWorkflowStage(review.stage) }));
  state.decisions = Array.isArray(state.decisions) ? state.decisions : [];
  state.dingMeetings = (Array.isArray(state.dingMeetings) ? state.dingMeetings : []).map(meeting => ({ ...meeting, stage: normalizeWorkflowStage(meeting.stage) }));
  state.feedbackIssues = Array.isArray(state.feedbackIssues) ? state.feedbackIssues : [];
  state.productPlans = normalizeProductPlans(state.productPlans);
  state.config = state.config && typeof state.config === "object" ? state.config : defaults.config;
  const incomingOrg = state.orgCache && typeof state.orgCache === "object" ? state.orgCache : {};
  state.orgCache = {
    ...defaults.orgCache,
    ...incomingOrg,
    departments: Array.isArray(incomingOrg.departments) && incomingOrg.departments.length ? incomingOrg.departments : defaults.orgCache.departments,
    users: Array.isArray(incomingOrg.users) && incomingOrg.users.length ? incomingOrg.users : defaults.orgCache.users
  };
  const incomingSettings = state.settings && typeof state.settings === "object" ? state.settings : {};
  state.settings = {
    ...defaults.settings,
    ...incomingSettings,
    permissions: normalizePermissions(incomingSettings.permissions),
    taskTemplates: Array.isArray(incomingSettings.taskTemplates)
      ? incomingSettings.taskTemplates.map(template => ({ ...template, category: normalizeTaskCategory(template.category), ownerDept: normalizeDepartmentSelection(template.ownerDept, state.orgCache) || "产品部", required: Boolean(template.required) }))
      : deriveLegacyTaskTemplates(state, defaults.settings.taskTemplates)
  };
  state.products.forEach(product => {
    state.tasks = syncDefaultTasksForProduct(state, product).tasks;
  });
  state.products.forEach(product => {
    if (!reviewRowsForProduct(state, product).length) {
      const seeded = defaults.reviews.filter(review => review.productId === product.id);
      state.reviews.push(...seeded);
    }
  });
  return state;
}
