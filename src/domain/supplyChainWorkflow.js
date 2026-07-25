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
