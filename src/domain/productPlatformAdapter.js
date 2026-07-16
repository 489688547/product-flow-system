import { buildProductScheduleSummary, calculateProductTaskProgress } from "./dashboardSummary.js";
import { STAGES } from "./productFlow.js";
import { riskMetaForTask } from "./taskTodo.js";

function todayIso(today) {
  if (typeof today === "string") return `${today.slice(0, 10)}T00:00:00.000Z`;
  const date = today instanceof Date ? today : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function eventRecord(input) {
  const idempotencyKey = [input.appId, input.entityType, input.entityId, input.kind, input.signature].join(":");
  return { ...input, id: idempotencyKey, idempotencyKey };
}

function productHealth(product, schedule, risks) {
  if (risks.some(risk => risk.days < 0) || schedule.state === "overdue") return "off_track";
  if (risks.length || schedule.state === "upcoming") return "at_risk";
  if (Number(product.stage) >= STAGES.length - 1) return "completed";
  return "normal";
}

export function productAppLink(product) {
  return {
    appId: "product-flow",
    entityType: "product",
    entityId: product?.id || "",
    label: product?.name || "产品",
    route: "progress",
    href: "#progress"
  };
}

export function buildProductPlatformEvents(state = {}, today = new Date()) {
  const syncedAt = todayIso(today);
  const products = Array.isArray(state.products) ? state.products : [];
  const tasks = Array.isArray(state.tasks) ? state.tasks : [];
  const plans = Array.isArray(state.productPlans) ? state.productPlans : [];
  const demands = Array.isArray(state.demands) ? state.demands : [];
  return products.flatMap(product => {
    const productTasks = tasks.filter(task => task.productId === product.id);
    const risks = productTasks.map(task => ({ task, risk: riskMetaForTask(task, new Date(syncedAt)) })).filter(item => item.risk);
    const summary = buildProductScheduleSummary(product, plans, demands, today, tasks);
    const progress = calculateProductTaskProgress(product, tasks);
    const health = productHealth(product, summary.schedule, risks.map(item => item.risk));
    const stage = STAGES.find(item => item.index === Number(product.stage));
    const base = { appId: "product-flow", entityType: "product", entityId: product.id, occurredAt: syncedAt, syncedAt };
    const events = [
      eventRecord({
        ...base,
        kind: "progress_changed",
        signature: `${progress}-${product.stage}-${health}`,
        health,
        progress,
        summary: `${product.name} 当前${stage?.title || "产品流程"}，任务完成度 ${progress}%`
      }),
      eventRecord({
        ...base,
        kind: "milestone_changed",
        signature: `${product.stage}-${summary.schedule.launchDate || "unplanned"}`,
        health,
        milestone: stage?.title || "产品流程",
        dueDate: summary.schedule.launchDate || "",
        summary: `${product.name} 当前阶段：${stage?.title || "待确认"}`
      }),
      eventRecord({
        ...base,
        kind: "owner_changed",
        signature: product.productManager || product.owner || "unassigned",
        owner: product.productManager || product.owner || "",
        summary: `${product.name} 产品负责人：${product.productManager || product.owner || "待指定"}`
      })
    ];
    risks.forEach(({ task, risk }) => {
      events.push(eventRecord({
        ...base,
        kind: "risk_opened",
        signature: `${task.id}-${task.due}-${risk.days}`,
        sourceRecordId: task.id,
        health: risk.days < 0 ? "off_track" : "at_risk",
        owner: task.ownerDept || "",
        dueDate: task.due || "",
        summary: `${task.title}${risk.days < 0 ? `已逾期 ${Math.abs(risk.days)} 天` : risk.label}`
      }));
    });
    return events;
  });
}
