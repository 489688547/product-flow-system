import { readSupplyState } from "../../../../supply-chain/_shared/storage.js";
import { listGoodsFlowEvents } from "./storage.js";

function text(value, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function amount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function latest(values) {
  return values.filter(Boolean).sort().at(-1) || null;
}

function supplierFacts(state) {
  return state.suppliers.map(row => ({
    id: text(row.id),
    name: text(row.name || row.supplierName),
    category: text(row.category || row.supplierCategory),
    status: text(row.status) || "active",
    source: "supply-chain-state"
  })).filter(row => row.id);
}

function purchaseFacts(events, state) {
  const eventRows = events
    .filter(event => ["purchase_order", "purchase_approved"].includes(event.eventType))
    .map(event => ({
      id: text(event.purchaseId || event.sourceReference),
      supplierId: text(event.supplierId) || null,
      status: text(event.payload?.status) || (event.eventType === "purchase_approved" ? "approved" : "unknown"),
      amount: amount(event.payload?.amount ?? event.payload?.approvedAmount),
      occurredAt: event.occurredAt,
      source: event.source,
      sourceVersion: event.sourceVersion
    })).filter(row => row.id);
  if (eventRows.length) return eventRows;
  return state.purchaseApprovals.map(row => ({
    id: text(row.id || row.processInstanceId),
    supplierId: text(row.supplierId) || null,
    status: text(row.status) || "unknown",
    amount: amount(row.approvedAmount ?? row.amount),
    occurredAt: text(row.completedAt || row.approvedAt || row.createTime) || null,
    source: "supply-chain-state",
    sourceVersion: text(row.version || row.updatedAt) || "legacy"
  })).filter(row => row.id);
}

function paymentFacts(events, state) {
  const eventRows = events.filter(event => event.eventType === "purchase_paid").map(event => ({
    id: text(event.payload?.paymentProcessInstanceId || event.sourceReference),
    purchaseId: text(event.purchaseId || event.payload?.purchaseProcessInstanceId) || null,
    supplierId: text(event.supplierId) || null,
    status: "paid",
    amount: amount(event.payload?.amount),
    occurredAt: event.occurredAt,
    source: event.source,
    sourceVersion: event.sourceVersion
  })).filter(row => row.id);
  if (eventRows.length) return eventRows;
  return state.paymentApprovals.map(row => ({
    id: text(row.id || row.processInstanceId),
    purchaseId: text(row.purchaseProcessInstanceId || row.relatedPurchaseProcessInstanceId) || null,
    supplierId: null,
    status: text(row.status) || "unknown",
    amount: amount(row.amount ?? row.paidAmount),
    occurredAt: text(row.completedAt || row.paidAt || row.createTime) || null,
    source: "supply-chain-state",
    sourceVersion: text(row.version || row.updatedAt) || "legacy"
  })).filter(row => row.id);
}

function qualityFacts(state) {
  return state.qualityIssues.map(row => ({
    id: text(row.id),
    supplierId: text(row.supplierId) || null,
    productId: text(row.productId) || null,
    batchId: text(row.batchId) || null,
    severity: text(row.severity) || "unknown",
    status: text(row.status) || "open",
    summary: text(row.summary || row.content || row.title, 500),
    createdAt: text(row.createdAt || row.occurredAt) || null,
    updatedAt: text(row.updatedAt) || null,
    source: "supply-chain-state"
  })).filter(row => row.id);
}

function aftersalesFacts(events) {
  return events.filter(event => event.eventType === "aftersale").map(event => ({
    id: text(event.sourceReference || event.id),
    productId: text(event.payload?.productId) || null,
    inventoryUnitId: text(event.skuId) || null,
    status: text(event.payload?.status) || "unknown",
    amount: amount(event.payload?.amount),
    occurredAt: event.occurredAt,
    source: event.source,
    sourceVersion: event.sourceVersion
  })).filter(row => row.id);
}

export async function readGoodsFlowFactCollection(db, resource) {
  const [{ state, updatedAt }, events] = await Promise.all([
    readSupplyState(db),
    listGoodsFlowEvents(db)
  ]);
  const collections = {
    suppliers: supplierFacts(state),
    purchases: purchaseFacts(events, state),
    payments: paymentFacts(events, state),
    "quality-incidents": qualityFacts(state),
    aftersales: aftersalesFacts(events)
  };
  const items = collections[resource] || [];
  const eventBacked = ["purchases", "payments", "aftersales"].includes(resource);
  const missing = [];
  if (resource === "suppliers") missing.push("erpSupplierMaster");
  if (resource === "quality-incidents") missing.push("standardizedQualitySource");
  if (eventBacked && !items.length) missing.push(resource);
  const lastSuccessfulSyncAt = latest([
    updatedAt,
    ...events.map(event => event.createdAt)
  ]);
  return {
    items,
    quality: {
      status: items.length ? (missing.length ? "partial" : "trusted") : "unavailable",
      lastSuccessfulSyncAt,
      coverage: items.length ? (missing.length ? null : 1) : 0,
      confidence: items.length ? (missing.length ? "partial" : "complete") : "insufficient",
      missing
    }
  };
}
