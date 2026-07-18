export const NAV_PERMISSION_ITEMS = [
  { key: "home", label: "公司首页" },
  { key: "strategy", label: "战略中心" },
  { key: "projects", label: "重点项目" },
  { key: "incentives", label: "部门激励" },
  { key: "reviews", label: "经营检查" },
  { key: "apps", label: "业务 Apps" },
  { key: "dashboard", label: "总览" },
  { key: "demands", label: "需求池" },
  { key: "planning", label: "产品规划" },
  { key: "progress", label: "产品进度" },
  { key: "archive", label: "产品档案" },
  { key: "issues", label: "问题反馈" },
  { key: "settings", label: "设置" }
];

export const FEATURE_PERMISSION_ITEMS = [
  { key: "taskTemplates", label: "产品任务模板", description: "维护不同产品等级、阶段的默认任务与交付物模板。" },
  { key: "salesData", label: "销售数据源", description: "导入销售明细 Excel，维护产品档案单品数据页的数据来源。" }
];

export const DEFAULT_PERMISSIONS = {
  navigation: {
    home: { departments: ["*"] },
    strategy: { departments: ["*"] },
    projects: { departments: ["*"] },
    incentives: { departments: ["*"] },
    reviews: { departments: ["*"] },
    apps: { departments: ["*"] },
    dashboard: { departments: ["*"] },
    demands: { departments: ["*"] },
    planning: { departments: ["*"] },
    progress: { departments: ["*"] },
    archive: { departments: ["*"] },
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
