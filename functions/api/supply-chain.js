import { jsonResponse, optionsResponse } from "./dingtalk/_shared/dingtalk.js";
import { SUPPLY_COLLECTIONS, normalizeSupplyChainState } from "../../src/domain/supplyChain.js";
import { readSupplyState, supplyDatabase, writeSupplyState } from "./supply-chain/_shared/storage.js";

const VIEW_DEPARTMENTS = new Set(["总经办", "供应链", "供应链部", "供应链团队", "采购部", "财务部", "质量管理部", "产品部", "运营部"]);
const SUPPLY_DEPARTMENTS = new Set(["供应链", "供应链部", "供应链团队", "采购部"]);
const QUALITY_COLLECTIONS = new Set(["qualityImportBatches", "qualityIssues"]);
const FINANCE_COLLECTIONS = new Set(["purchaseApprovals", "purchaseLines", "paymentApprovals", "syncRuns"]);
const SUPPLY_EDIT_COLLECTIONS = new Set([
  "suppliers", "productSupplierLinks", "purchaseApprovals", "purchaseLines",
  "inventoryBatches", "inventorySnapshots", "materialInventorySnapshots", "inventoryRisks", "inventoryAdjustments", "syncRuns"
]);

function department(session = {}) {
  return String(session.department || session.departmentName || "").trim();
}

function isExecutive(session) {
  return session?.role === "executive" || department(session).split("/").map(value => value.trim()).includes("总经办");
}

function canView(session) {
  return isExecutive(session) || VIEW_DEPARTMENTS.has(department(session));
}

function editableCollections(session) {
  if (isExecutive(session)) return new Set(SUPPLY_COLLECTIONS);
  if (SUPPLY_DEPARTMENTS.has(department(session))) return SUPPLY_EDIT_COLLECTIONS;
  if (department(session) === "财务部") return FINANCE_COLLECTIONS;
  if (department(session) === "质量管理部") return QUALITY_COLLECTIONS;
  return new Set();
}

function publicSupplier(supplier) {
  const { paymentTerms, bankAccount, taxNumber, contactPhone, ...visible } = supplier;
  return visible;
}

export function filterSupplyStateForSession(input, session = {}) {
  const state = normalizeSupplyChainState(input);
  const dept = department(session);
  if (isExecutive(session) || SUPPLY_DEPARTMENTS.has(dept) || dept === "财务部") return state;

  const filtered = normalizeSupplyChainState({
    ...state,
    suppliers: state.suppliers.map(publicSupplier),
    paymentApprovals: [],
    purchaseApprovals: state.purchaseApprovals.map(({ approvedAmount, requestedAmount, rawPayload, ...record }) => record),
    purchaseLines: state.purchaseLines.map(({ amount, unitPrice, rawPayload, ...record }) => record),
    inventorySnapshots: state.inventorySnapshots.map(({ inventoryAmount, unitCost, rawPayload, ...record }) => record),
    materialInventorySnapshots: state.materialInventorySnapshots.map(({ inventoryAmount, unitCost, rawPayload, ...record }) => record),
    inventoryAdjustments: state.inventoryAdjustments.map(({ adjustmentAmount, rawPayload, ...record }) => record),
    settings: {}
  });
  if (dept !== "质量管理部") {
    filtered.qualityImportBatches = [];
    filtered.qualityIssues = filtered.qualityIssues.map(({ orderId, customerName, rawPayload, ...record }) => record);
  }
  return filtered;
}

function mergeAuthorizedState(current, incoming, session) {
  const allowed = editableCollections(session);
  if (!allowed.size) {
    const error = new Error("当前部门没有供应链数据编辑权限。");
    error.status = 403;
    throw error;
  }
  const next = normalizeSupplyChainState(current);
  const submitted = normalizeSupplyChainState(incoming);
  for (const collection of allowed) next[collection] = submitted[collection];
  if (isExecutive(session) || SUPPLY_DEPARTMENTS.has(department(session))) next.settings = submitted.settings;
  return next;
}

export async function onRequest({ request, env, data = {} }) {
  if (request.method === "OPTIONS") return optionsResponse();
  if (!["GET", "POST"].includes(request.method)) return jsonResponse({ message: "Method not allowed" }, 405);
  const session = data.session || {};
  if (!canView(session)) return jsonResponse({ synced: false, message: "当前部门无权访问供应链管理。" }, 403);
  if (request.method === "POST" && session.role === "readonly") {
    return jsonResponse({ synced: false, message: "只读账号不能修改供应链数据。" }, 403);
  }
  const db = supplyDatabase(env, data);
  if (!db) {
    return jsonResponse({ synced: false, message: "缺少 Cloudflare D1 数据库绑定 PRODUCT_FLOW_DB，当前只能使用本地浏览器缓存。" }, 501);
  }
  try {
    const stored = await readSupplyState(db);
    if (request.method === "GET") {
      return jsonResponse({ ...stored, synced: Boolean(stored.updatedAt), state: filterSupplyStateForSession(stored.state, session) });
    }
    const body = await request.json().catch(() => ({}));
    if (!body.state || typeof body.state !== "object" || Array.isArray(body.state)) {
      return jsonResponse({ synced: false, message: "缺少有效的供应链数据。" }, 400);
    }
    const next = mergeAuthorizedState(stored.state, body.state, session);
    const saved = await writeSupplyState(db, next, String(session.name || "").slice(0, 80));
    return jsonResponse({ synced: true, ...saved });
  } catch (error) {
    return jsonResponse({ synced: false, message: error.message || "供应链数据同步失败。" }, error.status || 500);
  }
}
