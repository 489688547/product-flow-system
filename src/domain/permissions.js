export const NAV_PERMISSION_ITEMS = [
  { key: "home", label: "公司首页" },
  { key: "strategy", label: "战略中心" },
  { key: "projects", label: "重点项目" },
  { key: "incentives", label: "部门激励" },
  { key: "reviews", label: "经营检查" },
  { key: "collaboration", label: "部门协同" },
  { key: "apps", label: "业务 Apps" },
  { key: "supply-chain", label: "供应链管理" },
  { key: "data-center", label: "数据中心" },
  { key: "ecommerce-operations", label: "电商店铺运营" },
  { key: "performance-management", label: "绩效管理" },
  { key: "dashboard", label: "总览" },
  { key: "demands", label: "需求池" },
  { key: "planning", label: "产品规划" },
  { key: "progress", label: "产品进度" },
  { key: "archive", label: "产品档案" },
  { key: "content-overview", label: "内容总览" },
  { key: "content-workbench", label: "内容作战台" },
  { key: "content-assets", label: "素材资产" },
  { key: "content-review", label: "投放复盘" },
  { key: "brand-accounts", label: "品牌账号" },
  { key: "content-decisions", label: "补充决策" },
  { key: "content-team", label: "团队效能" },
  { key: "content-issues", label: "品牌数据问题" },
  { key: "content-settings", label: "品牌内容设置" },
  { key: "issues", label: "问题反馈" },
  { key: "settings", label: "设置" }
];

export const FEATURE_PERMISSION_ITEMS = [
  { key: "taskTemplates", label: "产品任务模板", description: "维护不同产品等级、阶段的默认任务与交付物模板。" },
  { key: "salesData", label: "销售数据源", description: "导入销售明细 Excel，维护产品档案单品数据页的数据来源。" },
  { key: "supplyChain", label: "供应链管理", description: "查看或维护供应商、采购付款、库存资金和质量问题。" },
  { key: "dataCenter", label: "数据中心", description: "查看统一经营指标，维护数据接入、质量规则和应用订阅。" }
  ,{ key: "ecommerceOperations", label: "电商店铺运营", description: "管理重点产品方案、执行复盘、跨部门协同和运营团队责任。" }
  ,{ key: "performanceManagement", label: "绩效管理", description: "管理考核方案、自评、主管评估、复核和人事归档。" }
];

export const DEFAULT_PERMISSIONS = {
  navigation: {
    home: { departments: ["*"] },
    strategy: { departments: ["*"] },
    projects: { departments: ["*"] },
    incentives: { departments: ["*"] },
    reviews: { departments: ["*"] },
    collaboration: { departments: ["*"] },
    apps: { departments: ["*"] },
    "supply-chain": { departments: ["总经办", "供应链部", "供应链", "供应链团队", "采购部", "财务部", "质量管理部", "产品部", "运营部"] },
    "data-center": { departments: ["总经办", "运营部", "财务部", "产品部", "供应链部", "供应链", "供应链团队", "采购部"] },
    "ecommerce-operations": { departments: ["总经办", "运营部", "财务部", "产品部", "品牌部", "供应链部", "供应链", "供应链团队", "采购部"] },
    "performance-management": { departments: ["*"] },
    dashboard: { departments: ["*"] },
    demands: { departments: ["*"] },
    planning: { departments: ["*"] },
    progress: { departments: ["*"] },
    archive: { departments: ["*"] },
    "content-overview": { departments: ["*"] },
    "content-workbench": { departments: ["*"] },
    "content-assets": { departments: ["*"] },
    "content-review": { departments: ["*"] },
    "brand-accounts": { departments: ["*"] },
    "content-decisions": { departments: ["*"] },
    "content-team": { departments: ["*"] },
    "content-issues": { departments: ["*"] },
    "content-settings": { departments: ["总经办", "品牌", "品牌部", "运营", "运营部"] },
    issues: { departments: ["总经办"] },
    settings: { departments: ["总经办", "产品部", "产品团队"] }
  },
  features: {
    taskTemplates: {
      viewDepartments: ["总经办", "产品部", "产品团队"],
      viewTitles: ["总经理", "产品经理", "产品负责人"],
      editDepartments: ["总经办"],
      editTitles: ["总经理", "产品经理", "产品负责人"]
    },
    salesData: {
      viewDepartments: ["总经办", "产品部", "产品团队", "财务部"],
      viewTitles: ["总经理", "产品经理", "产品负责人"],
      editDepartments: ["总经办", "产品部"],
      editTitles: ["总经理", "产品经理", "产品负责人"]
    },
    supplyChain: {
      viewDepartments: ["总经办", "供应链部", "供应链", "供应链团队", "采购部", "财务部", "质量管理部", "产品部", "运营部"],
      viewTitles: ["总经理", "供应链负责人", "采购负责人", "财务负责人", "质量负责人", "产品负责人", "运营负责人"],
      editDepartments: ["总经办", "供应链部", "供应链", "供应链团队", "采购部", "财务部", "质量管理部"],
      editTitles: ["总经理", "供应链负责人", "采购负责人", "财务负责人", "质量负责人"]
    },
    dataCenter: {
      viewDepartments: ["总经办", "运营部", "财务部", "产品部", "供应链部", "供应链", "供应链团队", "采购部"],
      viewTitles: ["总经理", "运营负责人", "财务负责人", "产品负责人", "供应链负责人"],
      editDepartments: ["总经办", "运营部"],
      editTitles: ["总经理", "运营负责人"]
    },
    ecommerceOperations: {
      viewDepartments: ["总经办", "运营部", "财务部", "产品部", "品牌部", "供应链部", "供应链", "供应链团队", "采购部"],
      viewTitles: ["总经理", "运营负责人"],
      editDepartments: ["总经办", "运营部"],
      editTitles: ["总经理", "运营负责人", "运营主管"]
    },
    performanceManagement: {
      viewDepartments: ["*"],
      viewTitles: [],
      editDepartments: ["人事行政部", "人事部", "总经办"],
      editTitles: ["主管", "经理", "总监", "负责人"]
    }
  }
};

function cleanArray(value, fallback = []) {
  const items = Array.isArray(value) ? value : fallback;
  return [...new Set(items
    .map(item => String(item || "").trim().replaceAll("产品团队", "产品部"))
    .filter(Boolean))];
}

export function normalizePermissions(input = {}) {
  return {
    navigation: Object.fromEntries(NAV_PERMISSION_ITEMS.map(item => [item.key, {
      departments: cleanArray(input.navigation?.[item.key]?.departments, DEFAULT_PERMISSIONS.navigation[item.key].departments)
    }])),
    features: Object.fromEntries(FEATURE_PERMISSION_ITEMS.map(item => {
      const fallback = DEFAULT_PERMISSIONS.features[item.key];
      const incoming = input.features?.[item.key] || {};
      return [item.key, {
        viewDepartments: cleanArray(incoming.viewDepartments, fallback.viewDepartments),
        viewTitles: cleanArray(incoming.viewTitles, fallback.viewTitles),
        editDepartments: cleanArray(incoming.editDepartments, fallback.editDepartments),
        editTitles: cleanArray(incoming.editTitles, fallback.editTitles)
      }];
    }))
  };
}

function userDepartments(user) {
  return [...new Set([user?.department, ...(user?.departments || []), ...(user?.departmentNames || [])]
    .flatMap(item => String(item || "").split(/\s*(?:\/|、|,|，|;|；|\|)\s*/))
    .map(item => item.trim().replaceAll("产品团队", "产品部"))
    .filter(Boolean))];
}

export function canAccessCompanyPlatform(user) {
  return userDepartments(user).includes("总经办");
}

export function canAccessSupplyChain(user) {
  return matchesScope(
    user,
    DEFAULT_PERMISSIONS.features.supplyChain.viewDepartments,
    DEFAULT_PERMISSIONS.features.supplyChain.viewTitles
  );
}

export function canAccessDataCenter(user) {
  return matchesScope(
    user,
    DEFAULT_PERMISSIONS.features.dataCenter.viewDepartments,
    DEFAULT_PERMISSIONS.features.dataCenter.viewTitles
  );
}

export function canAccessEcommerceOperations(user) {
  return matchesScope(user, DEFAULT_PERMISSIONS.features.ecommerceOperations.viewDepartments, DEFAULT_PERMISSIONS.features.ecommerceOperations.viewTitles);
}

export function canAccessPerformanceManagement(user) {
  return Boolean(user) && matchesScope(user, DEFAULT_PERMISSIONS.features.performanceManagement.viewDepartments, DEFAULT_PERMISSIONS.features.performanceManagement.viewTitles);
}

export function canEditProductPlanning(user) {
  return userDepartments(user).some(department => ["产品部", "总经办"].includes(department));
}

export function canManagePermissions(user) {
  return canAccessCompanyPlatform(user);
}

function matchesScope(user, departments = [], titles = []) {
  if (canManagePermissions(user)) return true;
  const userDepts = userDepartments(user);
  const departmentMatch = departments.includes("*") || departments.some(department => userDepts.includes(department));
  const title = String(user?.title || "").trim();
  const titleMatch = titles.some(item => title === item || title.includes(item));
  return departmentMatch || titleMatch;
}

export function canViewNavigation(permissions, user, key) {
  if (key === "handbook") return Boolean(user);
  if (canManagePermissions(user)) return true;
  if (key === "settings" && FEATURE_PERMISSION_ITEMS.some(item => canViewFeature(permissions, user, item.key))) return true;
  const normalized = normalizePermissions(permissions);
  return matchesScope(user, normalized.navigation[key]?.departments || []);
}

export function canViewFeature(permissions, user, key) {
  const normalized = normalizePermissions(permissions);
  const feature = normalized.features[key];
  return Boolean(feature && matchesScope(user, feature.viewDepartments, feature.viewTitles));
}

export function canEditFeature(permissions, user, key) {
  const normalized = normalizePermissions(permissions);
  const feature = normalized.features[key];
  return Boolean(feature && matchesScope(user, feature.editDepartments, feature.editTitles));
}
