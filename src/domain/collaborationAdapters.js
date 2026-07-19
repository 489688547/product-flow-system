function text(value, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function dateOnly(value, fallbackDays = 7) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(String(value || "")) ? String(value) : "";
  if (parsed) return parsed;
  const date = new Date(Date.now() + fallbackDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

function dueAt(value, days) {
  return `${dateOnly(value, days)}T18:00:00+08:00`;
}

function department(value, fallback) {
  const name = text(value, 120).split(/\s*(?:\/|、|,|，|;|；|\|)\s*/).filter(Boolean)[0] || fallback;
  return { name };
}

function source(appId, entityType, entityId, sourceRecordId, sourceRoute, sourceLabel) {
  return { appId, entityType, entityId: text(entityId, 160), sourceRecordId: text(sourceRecordId, 160), sourceRoute, sourceLabel: text(sourceLabel, 160) };
}

function evidence(label, value, basis) {
  return { label, value: text(value, 300), basis, asOf: dateOnly(new Date().toISOString().slice(0, 10), 0) };
}

export function collaborationDraftFromProductTask(product = {}, task = {}) {
  const productId = text(product.id, 160);
  const taskId = text(task.id, 160);
  const productName = text(product.name, 120) || "未命名产品";
  const title = text(task.title, 160) || "确认产品阶段任务";
  return {
    idempotencyKey: `product-flow:product:${productId}:task:${taskId}:handoff`,
    kind: task.done ? "task" : "handoff",
    title: `${productName} · ${title}`.slice(0, 160),
    description: `产品当前处于第 ${Number(product.stage || 0)} 阶段，该任务需要跨部门明确责任和交付结果。`,
    requestedAction: `请主责部门确认“${title}”的负责人、完成时间和可验收结果。`,
    impactLevel: task.required ? "high" : "medium",
    businessImpact: task.required ? "必需任务未闭环会阻塞产品阶段推进或上市准备。" : "任务未闭环会影响产品计划和跨部门排期。",
    ownerDepartment: department(task.ownerDept, "产品部"),
    ownerUser: null,
    partnerDepartments: [],
    dueAt: dueAt(task.due, 7),
    source: source("product-flow", "product", productId, taskId, `#/progress/${encodeURIComponent(productId)}`, `${productName} · ${title}`),
    strategyLinks: {},
    evidence: [evidence("产品阶段", `第 ${Number(product.stage || 0)} 阶段`, "产品全周期"), evidence("任务属性", task.required ? "必需任务" : "普通任务", "任务配置")]
  };
}

export function collaborationDraftFromSupplyIssue(issue = {}, context = {}) {
  const id = text(issue.id, 160);
  const productName = text(context.productName || issue.productName || issue.skuCode, 120) || "供应链事项";
  const summary = text(issue.content || issue.title || issue.message, 160) || "待处理供应链异常";
  const category = text(issue.category || issue.type, 80) || "供应链异常";
  return {
    idempotencyKey: `supply-chain:quality-issue:${id}:risk`,
    kind: "risk",
    title: `${productName} · ${category}`.slice(0, 160),
    description: summary,
    requestedAction: "请供应链明确处置负责人、整改动作、验证口径和预计闭环时间。",
    impactLevel: ["严重", "critical", "high"].includes(issue.severity) || issue.status !== "closed" ? "high" : "medium",
    businessImpact: "未闭环的质量或供应异常会影响交付稳定性、库存判断和客户体验。",
    ownerDepartment: department(issue.ownerDepartment, "供应链"),
    ownerUser: null,
    partnerDepartments: [{ name: "质量管理部" }],
    dueAt: dueAt(issue.dueAt || issue.due, 5),
    source: source("supply-chain", "quality_issue", id, id, "#/supply-quality", `${productName} · ${category}`),
    strategyLinks: {},
    evidence: [evidence("问题摘要", summary, "供应链质量记录"), evidence("供应商", issue.supplierName || "待补充", "供应链主档")]
  };
}

export function collaborationDraftFromDataIssue(issue = {}) {
  const id = text(issue.id, 160);
  const title = text(issue.title || issue.message, 160) || "待处理数据问题";
  return {
    idempotencyKey: `data-center:quality-issue:${id}:data_issue`,
    kind: "data_issue",
    title,
    description: text(issue.message || issue.description, 1000) || "数据中心检测到需要业务部门确认的质量问题。",
    requestedAction: "请数据负责人确认问题范围、修复动作、数据恢复时间和影响报表。",
    impactLevel: ["critical", "high", "failed"].includes(issue.severity || issue.status) ? "high" : "medium",
    businessImpact: "数据异常会导致经营判断、跨 App 指标或同步结果不可信。",
    ownerDepartment: department(issue.ownerDepartment || issue.owner, "运营部"),
    ownerUser: null,
    partnerDepartments: [],
    dueAt: dueAt(issue.dueAt, 3),
    source: source("data-center", "quality_issue", id, id, "#/data-quality", title),
    strategyLinks: {},
    evidence: [evidence("问题类型", issue.type || "数据校验", "数据质量规则"), evidence("当前状态", issue.status || "待处理", "数据中心")]
  };
}

export function collaborationDraftFromBrandIssue(issue = {}) {
  const id = text(issue.id || issue.contentId || `${issue.type}-${issue.title}`, 160);
  const title = text(issue.title, 160) || "待处理品牌内容数据问题";
  const high = ["critical", "high"].includes(issue.severity);
  return {
    idempotencyKey: `brand-content:data-issue:${id}:data_issue`,
    kind: "data_issue",
    title,
    description: text(issue.scope || issue.contentId || issue.type, 1000) || "品牌内容协同检测到数据缺口。",
    requestedAction: text(issue.action, 1000) || "请责任角色补齐数据并确认恢复结果。",
    impactLevel: high ? "high" : "medium",
    businessImpact: high ? "问题会影响素材归因、复盘判断或生产任务推进。" : "问题会降低内容数据的完整性和可追溯性。",
    ownerDepartment: { name: "品牌部" },
    ownerUser: null,
    partnerDepartments: issue.type?.includes("data") ? [{ name: "运营部" }] : [],
    dueAt: dueAt(issue.dueAt, high ? 2 : 5),
    source: source("brand-content", "data_issue", id, issue.contentId || id, "#/content-issues", title),
    strategyLinks: {},
    evidence: [evidence("严重度", issue.severity || "medium", "品牌内容规则"), evidence("影响范围", issue.scope || "待核对", "品牌内容 App")]
  };
}
