export const SUPPLY_CHAIN_WORKSPACES = Object.freeze([
  { section: "workbench", screen: "supply-workbench", label: "我的工作台" },
  { section: "planning", screen: "supply-planning", label: "计划与采购" },
  { section: "suppliers", screen: "supply-suppliers", label: "供应商" },
  { section: "transit", screen: "supply-transit", label: "生产与在途" },
  { section: "inventory", screen: "supply-inventory", label: "库存与盘点" },
  { section: "quality", screen: "supply-quality", label: "质量闭环" },
  { section: "finance", screen: "supply-finance", label: "成本与财务" },
  { section: "rules", screen: "supply-rules", label: "数据与规则" }
]);

export const GOODS_FLOW_STAGES = Object.freeze([
  { key: "purchase_request", label: "采购申请" },
  { key: "approval", label: "审批通过" },
  { key: "purchase_order", label: "采购下单" },
  { key: "production", label: "生产 / 备货" },
  { key: "shipment", label: "发运" },
  { key: "arrival", label: "到仓" },
  { key: "inspection", label: "质检" },
  { key: "receipt", label: "收货入库" },
  { key: "closed", label: "结案" }
]);

const SECTION_ALIASES = Object.freeze({
  overview: "workbench",
  demand: "planning",
  procurement: "planning",
  fulfillment: "transit",
  cash: "finance",
  records: "rules",
  settings: "rules"
});

const VALID_SECTIONS = new Set(SUPPLY_CHAIN_WORKSPACES.map(item => item.section));
const VALID_STAGE_STATUS = new Set(["complete", "active", "overdue", "not_applicable"]);

export function normalizeSupplyChainSection(section) {
  const normalized = String(section || "").trim();
  const resolved = SECTION_ALIASES[normalized] || normalized;
  return VALID_SECTIONS.has(resolved) ? resolved : "workbench";
}

function timestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function stageStatus(milestone, nowTimestamp) {
  if (!milestone) return "waiting_data";
  if (milestone.status === "not_applicable" || milestone.status === "skipped") return "not_applicable";
  if (milestone.status === "complete" || milestone.actualAt) return "complete";
  if (milestone.status === "overdue") return "overdue";
  const plannedTimestamp = timestamp(milestone.plannedAt);
  if (milestone.status === "active" && plannedTimestamp !== null && plannedTimestamp < nowTimestamp) return "overdue";
  return VALID_STAGE_STATUS.has(milestone.status) ? milestone.status : "waiting_data";
}

export function buildGoodsFlowProgress({ milestones = [], now = new Date().toISOString() } = {}) {
  const milestoneByStage = new Map(
    milestones
      .filter(item => item && GOODS_FLOW_STAGES.some(stage => stage.key === item.stage))
      .map(item => [item.stage, item])
  );
  const nowTimestamp = timestamp(now) ?? Date.now();
  const stages = GOODS_FLOW_STAGES.map(stage => {
    const milestone = milestoneByStage.get(stage.key);
    return {
      ...stage,
      status: stageStatus(milestone, nowTimestamp),
      plannedAt: milestone?.plannedAt || null,
      actualAt: milestone?.actualAt || null,
      ownerName: milestone?.ownerName || "",
      source: milestone?.source || null,
      note: milestone?.note || ""
    };
  });
  const currentStage = stages.find(item => item.status === "overdue")
    || stages.find(item => item.status === "active")
    || stages.find(item => item.status === "waiting_data")
    || stages.at(-1);
  const completeCount = stages.filter(item => item.status === "complete").length;
  const coveredCount = stages.filter(item => item.status !== "waiting_data").length;
  const qualityStatus = coveredCount === 0
    ? "unavailable"
    : coveredCount < stages.length
      ? "partial"
      : "trusted";
  return {
    stages,
    currentStage,
    completeCount,
    qualityStatus
  };
}

function normalizedActor(actor = {}) {
  const departments = Array.isArray(actor.departments)
    ? actor.departments
    : [actor.department].filter(Boolean);
  const roles = Array.isArray(actor.roles) ? actor.roles : [actor.role, actor.title].filter(Boolean);
  const supervisor = Boolean(actor.executive)
    || roles.some(role => /(主管|总监|厂长|负责人|经理)/.test(String(role)));
  return {
    id: String(actor.id || ""),
    departments: new Set(departments.map(value => String(value).trim()).filter(Boolean)),
    supervisor,
    executive: Boolean(actor.executive)
  };
}

function isClosed(item) {
  return ["closed", "complete", "completed", "cancelled", "canceled"].includes(String(item?.status || "").toLowerCase());
}

function taskAttention(item, nowTimestamp) {
  const dueTimestamp = timestamp(item.dueAt);
  if (dueTimestamp !== null && dueTimestamp < nowTimestamp) return "overdue";
  if (dueTimestamp !== null && dueTimestamp - nowTimestamp <= 3 * 24 * 60 * 60 * 1000) return "due_soon";
  if ((!item.ownerId && !item.ownerDepartment) || item.assignmentConflict) return "needs_assignment";
  if (item.kind === "data_quality") return "data_issue";
  return "normal";
}

const ATTENTION_PRIORITY = Object.freeze({
  overdue: 0,
  due_soon: 1,
  needs_assignment: 2,
  data_issue: 3,
  normal: 4
});

function visibleToActor(item, actor) {
  if (actor.executive || actor.supervisor) return true;
  if (item.ownerId && String(item.ownerId) === actor.id) return true;
  return Boolean(item.ownerDepartment && actor.departments.has(String(item.ownerDepartment).trim()));
}

export function buildRoleWorkbench({ actor: inputActor = {}, items = [], now = new Date().toISOString() } = {}) {
  const actor = normalizedActor(inputActor);
  const nowTimestamp = timestamp(now) ?? Date.now();
  const visibleItems = items
    .filter(item => item?.id && !isClosed(item) && visibleToActor(item, actor))
    .map(item => {
      const attentionState = taskAttention(item, nowTimestamp);
      return {
        ...item,
        attentionState,
        canAct: actor.executive
          || actor.supervisor
          || Boolean(item.ownerId && String(item.ownerId) === actor.id)
          || Boolean(item.ownerDepartment && actor.departments.has(String(item.ownerDepartment).trim()))
      };
    })
    .sort((left, right) => {
      const attentionOrder = ATTENTION_PRIORITY[left.attentionState] - ATTENTION_PRIORITY[right.attentionState];
      if (attentionOrder !== 0) return attentionOrder;
      const leftDue = timestamp(left.dueAt) ?? Number.POSITIVE_INFINITY;
      const rightDue = timestamp(right.dueAt) ?? Number.POSITIVE_INFINITY;
      if (leftDue !== rightDue) return leftDue - rightDue;
      return String(left.id).localeCompare(String(right.id), "zh-CN");
    });
  return {
    items: visibleItems,
    summary: {
      total: visibleItems.length,
      overdue: visibleItems.filter(item => item.attentionState === "overdue").length,
      dueSoon: visibleItems.filter(item => item.attentionState === "due_soon").length,
      dataIssues: visibleItems.filter(item => item.attentionState === "data_issue").length,
      needsAssignment: visibleItems.filter(item => item.attentionState === "needs_assignment").length
    },
    scope: actor.executive || actor.supervisor ? "all" : "mine"
  };
}

function finiteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const PROCUREMENT_COVERAGE_LABELS = Object.freeze({
  inventory: "ERP库存",
  demand: "近期销量",
  seasonal: "往年同期",
  promotions: "促销活动",
  leadTime: "最长备货周期",
  moq: "起订量",
  capacity: "供应商产能"
});

export function calculateProcurementSuggestion({
  inventoryQuantity,
  averageDailySales,
  seasonalDailySales,
  promotionDailySales,
  promotionDays,
  longestLeadTimeDays,
  minimumOrderQuantity,
  capacityPerBatch,
  batchIntervalDays = 2,
  coverage = {},
  workflowAvailable = false
} = {}) {
  const inventory = Math.max(0, finiteNumber(inventoryQuantity));
  const averageDemand = Math.max(0, finiteNumber(averageDailySales));
  const seasonalDemand = positiveNumber(seasonalDailySales);
  const dailyDemand = Math.max(averageDemand, seasonalDemand || 0);
  const leadTime = positiveNumber(longestLeadTimeDays);
  const targetCoverageDays = Math.min(30, Math.max(15, Math.ceil(leadTime || 15)));
  const promotionDemand = positiveNumber(promotionDailySales);
  const activePromotionDays = Math.max(0, Math.ceil(finiteNumber(promotionDays)));
  const promotionExtra = promotionDemand
    ? Math.ceil(Math.max(0, promotionDemand - dailyDemand) * activePromotionDays)
    : 0;
  const rawQuantity = Math.max(0, Math.ceil(dailyDemand * targetCoverageDays + promotionExtra - inventory));
  const moq = positiveNumber(minimumOrderQuantity);
  const suggestedQuantity = rawQuantity > 0 && moq
    ? Math.ceil(rawQuantity / moq) * moq
    : rawQuantity;
  const capacity = positiveNumber(capacityPerBatch);
  const rollout = [];
  if (suggestedQuantity > 0) {
    if (capacity && suggestedQuantity > capacity) {
      let remaining = suggestedQuantity;
      let sequence = 1;
      while (remaining > 0) {
        const quantity = Math.min(capacity, remaining);
        rollout.push({
          sequence,
          quantity,
          offsetDays: (sequence - 1) * Math.max(1, Math.ceil(finiteNumber(batchIntervalDays, 2)))
        });
        remaining -= quantity;
        sequence += 1;
      }
    } else {
      rollout.push({ sequence: 1, quantity: suggestedQuantity, offsetDays: 0 });
    }
  }
  const missing = Object.entries(PROCUREMENT_COVERAGE_LABELS)
    .filter(([key]) => coverage[key] !== true)
    .map(([, label]) => label);
  const basis = [
    `现有库存 ${inventory.toLocaleString("zh-CN")}`,
    `近期日销 ${averageDemand.toLocaleString("zh-CN")}`,
    seasonalDemand ? `往年同期日销 ${seasonalDemand.toLocaleString("zh-CN")}` : "往年同期待接入",
    `覆盖 ${targetCoverageDays} 天`,
    promotionDemand ? `促销额外需求 ${promotionExtra.toLocaleString("zh-CN")}` : "促销活动待接入",
    moq ? `起订量 ${moq.toLocaleString("zh-CN")}` : "起订量待维护",
    capacity ? `单批产能 ${capacity.toLocaleString("zh-CN")}` : "供应商产能待维护"
  ];
  return {
    inventoryQuantity: inventory,
    averageDailySales: averageDemand,
    targetCoverageDays,
    demandQuantity: Math.ceil(dailyDemand * targetCoverageDays + promotionExtra),
    promotionExtra,
    rawQuantity,
    suggestedQuantity,
    projectedInventory: inventory + suggestedQuantity,
    projectedDaysOfSupply: dailyDemand > 0 ? Math.round((inventory + suggestedQuantity) / dailyDemand * 10) / 10 : null,
    rollout,
    basis,
    quality: {
      status: missing.length ? "partial" : "trusted",
      missing
    },
    canConfirm: workflowAvailable && missing.length === 0
  };
}

export function calculateBundleRequirements({ plans = [], bom = [] } = {}) {
  const quantityByProduct = new Map(
    plans
      .filter(item => item?.productId)
      .map(item => [String(item.productId), Math.max(0, finiteNumber(item.quantity))])
  );
  const requirements = new Map();
  for (const component of bom) {
    if (!component?.productId || !component?.inventoryUnitId || component.providedByUs === false) continue;
    const productId = String(component.productId);
    const plannedQuantity = quantityByProduct.get(productId) || 0;
    const ratio = Math.max(0, finiteNumber(component.ratio));
    if (!plannedQuantity || !ratio) continue;
    const inventoryUnitId = String(component.inventoryUnitId);
    const current = requirements.get(inventoryUnitId) || {
      inventoryUnitId,
      requiredQuantity: 0,
      shared: Boolean(component.shared),
      productIds: []
    };
    current.requiredQuantity += plannedQuantity * ratio;
    current.shared = current.shared || Boolean(component.shared);
    if (!current.productIds.includes(productId)) current.productIds.push(productId);
    requirements.set(inventoryUnitId, current);
  }
  return [...requirements.values()].map(item => ({
    ...item,
    requiredQuantity: Math.round(item.requiredQuantity * 10000) / 10000,
    shared: item.shared || item.productIds.length > 1
  }));
}

const RESPONSIBILITY_DIMENSIONS = Object.freeze([
  "inventoryUnitId",
  "productId",
  "supplierId",
  "materialType",
  "category"
]);

function ruleMatchesItem(rule, item) {
  const dimensions = RESPONSIBILITY_DIMENSIONS.filter(key => rule?.[key] !== null && rule?.[key] !== undefined && String(rule[key]).trim());
  return dimensions.length > 0 && dimensions.every(key => String(rule[key]) === String(item?.[key] ?? ""));
}

export function resolveProcurementResponsibility({ item = {}, rules = [], availablePurchasers = [] } = {}) {
  const matched = rules
    .filter(rule => rule?.id && ruleMatchesItem(rule, item))
    .map(rule => {
      const matchedDimensions = RESPONSIBILITY_DIMENSIONS.filter(
        key => rule?.[key] !== null && rule?.[key] !== undefined && String(rule[key]).trim()
      );
      return {
        rule,
        matchedDimensions,
        specificityRank: Math.max(...matchedDimensions.map(key => RESPONSIBILITY_DIMENSIONS.length - RESPONSIBILITY_DIMENSIONS.indexOf(key)))
      };
    });
  const highestRank = matched.length ? Math.max(...matched.map(row => row.specificityRank)) : null;
  const candidates = highestRank === null ? [] : matched.filter(row => row.specificityRank === highestRank);
  const ownerIds = [...new Set(candidates.map(row => String(row.rule.ownerId || "")).filter(Boolean))];
  if (ownerIds.length > 1) {
    return {
      status: "conflict",
      ownerId: "",
      ownerName: "",
      ruleIds: candidates.map(row => String(row.rule.id)),
      specificity: candidates[0]?.matchedDimensions[0] || null
    };
  }
  if (ownerIds.length === 1) {
    const selected = candidates.find(row => String(row.rule.ownerId || "") === ownerIds[0]);
    return {
      status: "assigned",
      ownerId: ownerIds[0],
      ownerName: String(selected.rule.ownerName || ""),
      ruleId: String(selected.rule.id),
      specificity: selected.matchedDimensions[0]
    };
  }
  if (availablePurchasers.length === 1 && availablePurchasers[0]?.id) {
    return {
      status: "assigned",
      ownerId: String(availablePurchasers[0].id),
      ownerName: String(availablePurchasers[0].name || ""),
      ruleId: "single-purchaser-default",
      specificity: "default"
    };
  }
  return {
    status: "unassigned",
    ownerId: "",
    ownerName: "",
    ruleId: null,
    specificity: null
  };
}

export function buildProductionMaterialPlan({ plans = [], bom = [] } = {}) {
  const planByProduct = new Map();
  for (const plan of plans) {
    if (!plan?.productId) continue;
    const key = String(plan.productId);
    const current = planByProduct.get(key) || { quantity: 0, factoryIds: new Set() };
    current.quantity += Math.max(0, finiteNumber(plan.quantity));
    if (plan.factoryId) current.factoryIds.add(String(plan.factoryId));
    planByProduct.set(key, current);
  }
  const materialById = new Map();
  for (const component of bom) {
    if (!component?.productId || !component?.inventoryUnitId) continue;
    const productPlan = planByProduct.get(String(component.productId));
    if (!productPlan?.quantity) continue;
    const inventoryUnitId = String(component.inventoryUnitId);
    const requiredQuantity = productPlan.quantity * Math.max(0, finiteNumber(component.ratio));
    const current = materialById.get(inventoryUnitId) || {
      inventoryUnitId,
      title: String(component.title || component.name || inventoryUnitId),
      requiredQuantity: 0,
      productIds: new Set(),
      factoryIds: new Set(),
      inventoryManaged: false,
      providerOwned: false
    };
    current.requiredQuantity += requiredQuantity;
    current.productIds.add(String(component.productId));
    productPlan.factoryIds.forEach(factoryId => current.factoryIds.add(factoryId));
    if (component.providedByUs === false) current.providerOwned = true;
    else current.inventoryManaged = true;
    materialById.set(inventoryUnitId, current);
  }
  const materials = [...materialById.values()].map(row => ({
    ...row,
    requiredQuantity: Math.round(row.requiredQuantity * 10000) / 10000,
    productIds: [...row.productIds],
    factoryIds: [...row.factoryIds],
    shared: row.productIds.size > 1
  }));
  return {
    plans: [...planByProduct.entries()].map(([productId, row]) => ({
      productId,
      quantity: row.quantity,
      factoryIds: [...row.factoryIds]
    })),
    materials,
    quality: {
      status: plans.length && materials.length ? "complete" : "missing",
      missing: [
        ...(!plans.length ? ["生产计划"] : []),
        ...(!materials.length ? ["原料BOM"] : [])
      ]
    }
  };
}

function shanghaiDate(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(parsed);
}

function subtractCalendarDays(value, days) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() - days);
  return shanghaiDate(parsed);
}

export function buildPurchaseReminderPlan({
  expectedArrivalAt,
  logisticsDays,
  customDaysBefore = []
} = {}) {
  if (!shanghaiDate(expectedArrivalAt)) {
    return {
      expectedArrivalAt: null,
      shipmentDueAt: null,
      reminders: [],
      quality: { status: "missing", missing: ["预计到货时间"] }
    };
  }
  const reminderDays = [...new Set([
    3,
    1,
    ...customDaysBefore.map(value => Math.ceil(finiteNumber(value))).filter(value => value > 0)
  ])].sort((left, right) => right - left);
  const safeLogisticsDays = positiveNumber(logisticsDays);
  return {
    expectedArrivalAt: shanghaiDate(expectedArrivalAt),
    shipmentDueAt: safeLogisticsDays ? subtractCalendarDays(expectedArrivalAt, safeLogisticsDays) : null,
    reminders: reminderDays.map(daysBefore => ({
      daysBefore,
      dueAt: subtractCalendarDays(expectedArrivalAt, daysBefore),
      label: `到货前 ${daysBefore} 天`
    })),
    quality: {
      status: safeLogisticsDays ? "complete" : "partial",
      missing: safeLogisticsDays ? [] : ["物流时间"]
    }
  };
}

export function evaluateRollingReplenishmentRecovery({
  dailySales = [],
  currentInventory,
  safetyInventory,
  stableDays = 5,
  toleranceRate = 0.2
} = {}) {
  const requiredDays = Math.max(1, Math.ceil(finiteNumber(stableDays, 5)));
  const recentSales = dailySales.slice(-requiredDays).map(Number).filter(Number.isFinite);
  const inventoryKnown = currentInventory !== null && currentInventory !== undefined && Number.isFinite(Number(currentInventory));
  const safetyKnown = safetyInventory !== null && safetyInventory !== undefined && Number.isFinite(Number(safetyInventory));
  const enoughDays = recentSales.length === requiredDays;
  const average = enoughDays ? recentSales.reduce((sum, value) => sum + value, 0) / requiredDays : null;
  const stable = average !== null && (average === 0
    ? recentSales.every(value => value === 0)
    : recentSales.every(value => Math.abs(value - average) / average <= Math.max(0, finiteNumber(toleranceRate, 0.2))));
  const inventorySafe = inventoryKnown && safetyKnown && Number(currentInventory) >= Number(safetyInventory);
  const inventoryCoverage = inventoryKnown && safetyKnown;
  return {
    status: enoughDays && inventoryCoverage && stable && inventorySafe
      ? "recovered"
      : inventoryCoverage
        ? "tracking"
        : "partial",
    stable,
    inventorySafe,
    observedDays: recentSales.length,
    requiredDays,
    averageDailySales: average === null ? null : Math.round(average * 10) / 10,
    missing: [
      ...(!enoughDays ? [`连续 ${requiredDays} 天销量`] : []),
      ...(!inventoryKnown ? ["当前库存"] : []),
      ...(!safetyKnown ? ["安全库存"] : [])
    ]
  };
}

const ERP_INVENTORY_SOURCES = new Set([
  "kuaimai-import",
  "dingtalk-stocktake-import",
  "dingtalk-finished-inventory"
]);

function inventoryIdentityCodes(product) {
  return [
    ...(product?.skuCodes || []).flatMap(value => {
      if (typeof value === "object") return [value?.code, value?.barcode, value?.merchantSkuCode];
      return [value];
    }),
    ...(product?.skus || []).flatMap(sku => [sku?.barcode, sku?.merchantSkuCode])
  ].map(value => String(value || "").trim()).filter(Boolean);
}

export function summarizeInventorySnapshotCoverage({ snapshots = [], products = [] } = {}) {
  const productCodes = new Set(products.flatMap(inventoryIdentityCodes));
  const inventoryRows = snapshots.filter(row => ERP_INVENTORY_SOURCES.has(String(row?.sourceType || "").trim()));
  const matchedRows = inventoryRows.filter(row => productCodes.has(String(row?.skuCode || "").trim())).length;
  const dates = inventoryRows
    .map(row => String(row?.stocktakeDate || row?.snapshotDate || row?.date || "").slice(0, 10))
    .filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return {
    totalRows: inventoryRows.length,
    matchedRows,
    unmatchedRows: inventoryRows.length - matchedRows,
    latestDate: dates.at(-1) || null
  };
}

export function classifyStockRisk({
  daysOfSupply,
  longestLeadTimeDays,
  todaySales,
  averageDailySales,
  seasonalExpired = false
} = {}) {
  const days = positiveNumber(daysOfSupply);
  if (days === null) return { kind: "unknown", severity: "neutral", reason: "可售天数待接入" };
  const leadTime = positiveNumber(longestLeadTimeDays);
  if (leadTime && days < leadTime) {
    return { kind: "replenish", severity: "danger", reason: `可售 ${days} 天，低于最长备货周期 ${leadTime} 天` };
  }
  const today = positiveNumber(todaySales);
  const average = positiveNumber(averageDailySales);
  if (today && average && today > average * 2) {
    return { kind: "spike", severity: "warning", reason: `今日销量为近期日均的 ${(today / average).toFixed(1)} 倍` };
  }
  if (days > 45 || seasonalExpired || (average !== null && average < 20)) {
    return {
      kind: "clearance",
      severity: "warning",
      reason: seasonalExpired ? "商品已过季或过节" : days > 45 ? `预计可售 ${days} 天，高于 45 天` : `日动销 ${average} 件，低于 20 件`
    };
  }
  return { kind: "healthy", severity: "success", reason: "当前库存覆盖与销量处于常规范围" };
}

export function calculateBomCost({ components = [], lossRate = 0.1 } = {}) {
  const ownedComponents = components.filter(component => component?.providedByUs !== false);
  const missingInventoryUnitIds = ownedComponents
    .filter(component => component?.unitCost === null
      || component?.unitCost === undefined
      || !Number.isFinite(Number(component.unitCost)))
    .map(component => String(component.inventoryUnitId || "unknown"));
  if (missingInventoryUnitIds.length) {
    return {
      materialCost: null,
      lossRate: Math.max(0, finiteNumber(lossRate)),
      lossAmount: null,
      totalCost: null,
      status: "partial",
      missingInventoryUnitIds
    };
  }
  const materialCost = ownedComponents.reduce(
    (sum, component) => sum + Math.max(0, finiteNumber(component.ratio)) * Math.max(0, finiteNumber(component.unitCost)),
    0
  );
  const safeLossRate = Math.max(0, finiteNumber(lossRate));
  const lossAmount = materialCost * safeLossRate;
  return {
    materialCost: Math.round(materialCost * 10000) / 10000,
    lossRate: safeLossRate,
    lossAmount: Math.round(lossAmount * 10000) / 10000,
    totalCost: Math.round((materialCost + lossAmount) * 10000) / 10000,
    status: "complete",
    missingInventoryUnitIds: []
  };
}

export function classifyStocktakeVariance({
  theoreticalQuantity,
  countedQuantity,
  threshold = 0.05
} = {}) {
  if (countedQuantity === null || countedQuantity === undefined || theoreticalQuantity === null || theoreticalQuantity === undefined) {
    return {
      status: "uninspected",
      varianceQuantity: null,
      varianceRate: null,
      requiresDiscussion: false
    };
  }
  const theoretical = finiteNumber(theoreticalQuantity);
  const counted = finiteNumber(countedQuantity);
  const varianceQuantity = counted - theoretical;
  const varianceRate = theoretical === 0
    ? varianceQuantity === 0 ? 0 : null
    : Math.abs(varianceQuantity) / Math.abs(theoretical);
  const requiresDiscussion = varianceRate === null
    ? varianceQuantity !== 0
    : varianceRate > Math.max(0, finiteNumber(threshold, 0.05));
  return {
    status: requiresDiscussion ? "discussion_required" : "acceptable",
    varianceQuantity,
    varianceRate,
    requiresDiscussion
  };
}

export function summarizeInventoryFunds(rows = []) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  const amountVisible = sourceRows.some(row => Object.prototype.hasOwnProperty.call(row || {}, "inventoryCashTied"));
  const costVisible = sourceRows.some(row => Object.prototype.hasOwnProperty.call(row || {}, "unitCost"));
  if (!amountVisible && !costVisible) {
    return { status: "hidden", amount: null };
  }
  const knownAmounts = sourceRows
    .map(row => row?.inventoryCashTied)
    .filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)));
  if (!knownAmounts.length) {
    return { status: "uncalibrated", amount: null };
  }
  return {
    status: "available",
    amount: knownAmounts.reduce((sum, value) => sum + Number(value), 0)
  };
}

export function linkInventoryFactsToCatalog(rows = [], catalogItems = []) {
  const candidatesByCode = new Map();
  for (const product of Array.isArray(catalogItems) ? catalogItems : []) {
    for (const sku of Array.isArray(product?.skus) ? product.skus : []) {
      const reference = { productId: product.id, inventoryUnitId: sku.id };
      const identity = `${reference.productId}|${reference.inventoryUnitId}`;
      for (const rawCode of [sku.barcode, sku.merchantSkuCode, sku.sourceSkuId]) {
        const code = String(rawCode || "").trim();
        if (!code) continue;
        if (!candidatesByCode.has(code)) candidatesByCode.set(code, new Map());
        candidatesByCode.get(code).set(identity, reference);
      }
    }
  }

  return (Array.isArray(rows) ? rows : []).map(row => {
    const code = String(row?.skuCode || row?.inventoryUnitCode || row?.code || "").trim();
    const candidates = candidatesByCode.get(code);
    const matched = candidates?.size === 1 ? [...candidates.values()][0] : null;
    const sourceProductId = row?.productId || null;
    const compatibleMatch = matched && (!sourceProductId || sourceProductId === matched.productId) ? matched : null;
    return {
      ...row,
      productId: sourceProductId || compatibleMatch?.productId || null,
      inventoryUnitId: row?.inventoryUnitId || compatibleMatch?.inventoryUnitId || null,
      sourceInventoryUnitId: row?.sourceInventoryUnitId || row?.skuId || null
    };
  });
}

export function canonicalizeFactProductIds(rows = [], products = []) {
  const productIdByCatalogId = new Map(
    (Array.isArray(products) ? products : [])
      .map(product => [String(product?.catalogProductId || "").trim(), product?.id])
      .filter(([catalogProductId, productId]) => catalogProductId && productId)
  );
  return (Array.isArray(rows) ? rows : []).map(row => {
    const currentProductId = String(row?.productId || "").trim();
    const productId = productIdByCatalogId.get(currentProductId);
    if (!productId || productId === currentProductId) return row;
    return {
      ...row,
      sourceProductId: row?.sourceProductId || currentProductId,
      productId
    };
  });
}

function normalizedRatingValues(perspectives) {
  return Object.values(perspectives || {})
    .flatMap(value => value && typeof value === "object" ? Object.values(value) : [])
    .map(Number)
    .filter(value => Number.isFinite(value) && value >= 1 && value <= 5);
}

export function evaluateSupplierPerformance({ objective = {}, perspectives = {} } = {}) {
  const qualificationRate = Number(objective.qualificationRate);
  const onTimeRate = Number(objective.onTimeRate);
  const incidentCount = Number(objective.incidentCount);
  const priceChangeRate = Number(objective.priceChangeRate);
  const objectiveComplete = [qualificationRate, onTimeRate, incidentCount, priceChangeRate].every(Number.isFinite);
  const objectiveScore = objectiveComplete
    ? Math.max(0, Math.min(100,
      qualificationRate * 100 * 0.35
      + onTimeRate * 100 * 0.25
      + Math.max(0, 100 - incidentCount * 15) * 0.15
      + Math.max(0, 100 - Math.abs(priceChangeRate) * 500) * 0.25))
    : null;
  const ratings = normalizedRatingValues(perspectives);
  const perspectiveScore = ratings.length
    ? ratings.reduce((sum, value) => sum + value, 0) / ratings.length / 5 * 100
    : null;
  const combinedScore = objectiveScore !== null && perspectiveScore !== null
    ? objectiveScore * 0.7 + perspectiveScore * 0.3
    : null;
  return {
    objective,
    perspectives,
    objectiveScore: objectiveScore === null ? null : Math.round(objectiveScore * 10) / 10,
    perspectiveScore: perspectiveScore === null ? null : Math.round(perspectiveScore * 10) / 10,
    combinedScore: combinedScore === null ? null : Math.round(combinedScore * 10) / 10,
    grade: combinedScore === null ? null : combinedScore >= 85 ? "A" : combinedScore >= 70 ? "B" : "C",
    status: objectiveComplete && ["procurement", "quality", "product"].every(key => perspectives?.[key])
      ? "complete"
      : "partial"
  };
}

export function classifyFinancialPosition({ orderedAmount, paidAmount, receivedAmount } = {}) {
  const orderedKnown = orderedAmount !== null && orderedAmount !== undefined && Number.isFinite(Number(orderedAmount));
  const paidKnown = paidAmount !== null && paidAmount !== undefined && Number.isFinite(Number(paidAmount));
  const receivedKnown = receivedAmount !== null && receivedAmount !== undefined && Number.isFinite(Number(receivedAmount));
  const ordered = Math.max(0, finiteNumber(orderedAmount));
  const paid = Math.max(0, finiteNumber(paidAmount));
  const received = Math.max(0, finiteNumber(receivedAmount));
  return {
    orderedAmount: orderedKnown ? ordered : null,
    paidAmount: paidKnown ? paid : null,
    receivedAmount: receivedKnown ? received : null,
    inTransitAsset: orderedKnown && paidKnown && receivedKnown
      ? received >= ordered ? 0 : Math.min(paid, Math.max(0, ordered - received))
      : null,
    payable: orderedKnown && paidKnown ? Math.max(0, ordered - paid) : null,
    status: orderedKnown && paidKnown && receivedKnown ? "complete" : "partial",
    missing: [
      ...(!orderedKnown ? ["采购金额"] : []),
      ...(!paidKnown ? ["付款金额"] : []),
      ...(!receivedKnown ? ["收货金额"] : [])
    ]
  };
}

export function reconcileFreightCharge({
  theoreticalAmount,
  billedAmount,
  absoluteThreshold = 5,
  rateThreshold = 0.05,
  evidenceIds = []
} = {}) {
  const theoretical = Math.max(0, finiteNumber(theoreticalAmount));
  const billed = Math.max(0, finiteNumber(billedAmount));
  const differenceAmount = Math.round((billed - theoretical) * 100) / 100;
  const differenceRate = theoretical > 0
    ? Math.round(differenceAmount / theoretical * 10000) / 10000
    : differenceAmount === 0 ? 0 : null;
  const materialDifference = Math.abs(differenceAmount) > Math.max(0, finiteNumber(absoluteThreshold))
    && (differenceRate === null || Math.abs(differenceRate) > Math.max(0, finiteNumber(rateThreshold)));
  return {
    theoreticalAmount: theoretical,
    billedAmount: billed,
    differenceAmount,
    differenceRate,
    status: materialDifference ? differenceAmount > 0 ? "dispute" : "review" : "matched",
    evidenceIds: Array.isArray(evidenceIds) ? evidenceIds : []
  };
}
