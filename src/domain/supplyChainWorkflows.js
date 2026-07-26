export const SUPPLY_CHAIN_WORKFLOW_RESOURCES = Object.freeze([
  "responsibility-rules",
  "procurement-rules",
  "procurement-suggestions",
  "purchase-plans",
  "purchase-batches",
  "purchase-payment-links",
  "suppliers",
  "bom-definitions",
  "business-rules",
  "quality-standards",
  "inspection-plans",
  "inspection-records",
  "quality-incidents",
  "clearance-suggestions",
  "freight-rate-rules",
  "freight-reconciliations"
]);

const RESOURCE_SET = new Set(SUPPLY_CHAIN_WORKFLOW_RESOURCES);
const SERVER_FIELDS = /^(?:actor|actorId|userId|department|ownerDepartment|createdBy|updatedBy|createdAt|updatedAt|version|status)$/i;
const SENSITIVE_FIELDS = /(?:password|passwd|secret|token|cookie|authorization|credential(?!VaultEntryId)|bankAccount|identityCard|idCard|mobile|phone)/i;

const OWNERS = Object.freeze({
  "responsibility-rules": "总经办",
  "procurement-rules": "供应链部",
  "procurement-suggestions": "供应链部",
  "purchase-plans": "供应链部",
  "purchase-batches": "供应链部",
  "purchase-payment-links": "财务部",
  suppliers: "供应链部",
  "bom-definitions": "产品部",
  "business-rules": "供应链部",
  "quality-standards": "质量管理部",
  "inspection-plans": "质量管理部",
  "inspection-records": "质量管理部",
  "quality-incidents": "质量管理部",
  "clearance-suggestions": "供应链部",
  "freight-rate-rules": "财务部",
  "freight-reconciliations": "财务部"
});

const INITIAL = Object.freeze({
  suppliers: "active",
  "inspection-plans": "planned",
  "inspection-records": "pending",
  "quality-incidents": "discovered",
  "purchase-payment-links": "unlinked",
  "freight-reconciliations": "pending",
  default: "draft"
});

const COMMON = Object.freeze({
  draft: { publish: "published", confirm: "confirmed", submit: "submitted", archive: "archived" },
  published: { revise: "draft", archive: "archived" },
  confirmed: { revise: "draft", archive: "archived" },
  submitted: { approve: "approved", reject: "draft", archive: "archived" },
  approved: { close: "closed", archive: "archived" },
  active: { revise: "active", archive: "archived" },
  archived: {}
});

const RESOURCE_TRANSITIONS = Object.freeze({
  "procurement-suggestions": {
    draft: { adjust: "draft", confirm: "confirmed", archive: "archived" },
    confirmed: { revise: "draft", archive: "archived" },
    archived: {}
  },
  "purchase-plans": {
    ...COMMON,
    approved: { order: "ordered", archive: "archived" },
    ordered: { close: "closed", archive: "archived" }
  },
  "purchase-batches": {
    draft: { apply: "applied", archive: "archived" },
    applied: { approve: "approved", archive: "archived" },
    approved: { order: "ordered", archive: "archived" },
    ordered: { start_production: "producing", archive: "archived" },
    producing: { ship: "shipped", archive: "archived" },
    shipped: { arrive: "arrived", archive: "archived" },
    arrived: { inspect: "inspecting", archive: "archived" },
    inspecting: { receive: "received", archive: "archived" },
    received: { close: "closed", archive: "archived" }
  },
  "purchase-payment-links": {
    unlinked: { link: "linked", archive: "archived" },
    linked: { unlink: "unlinked", confirm: "confirmed", archive: "archived" },
    confirmed: { archive: "archived" }
  },
  "inspection-plans": {
    planned: { start: "in_progress", archive: "archived" },
    in_progress: { complete: "completed", archive: "archived" },
    completed: { archive: "archived" }
  },
  "inspection-records": {
    pending: { record: "recorded", archive: "archived" },
    recorded: { pass: "passed", fail: "failed", archive: "archived" },
    passed: { archive: "archived" },
    failed: { create_incident: "incident_created", archive: "archived" },
    incident_created: { archive: "archived" }
  },
  "quality-incidents": {
    discovered: { classify: "classified", archive: "archived" },
    classified: { handle: "handled", archive: "archived" },
    handled: { remediate: "remediated", archive: "archived" },
    remediated: { verify: "verified", archive: "archived" },
    verified: { close: "closed", reopen: "discovered", archive: "archived" },
    closed: { reopen: "discovered", archive: "archived" }
  },
  "clearance-suggestions": {
    draft: { adjust: "draft", confirm: "confirmed", archive: "archived" },
    confirmed: { revise: "draft", archive: "archived" },
    archived: {}
  },
  "freight-reconciliations": {
    pending: { reconcile: "reconciled", dispute: "disputed", archive: "archived" },
    disputed: { reconcile: "reconciled", archive: "archived" },
    reconciled: { confirm: "confirmed", dispute: "disputed", archive: "archived" },
    confirmed: { archive: "archived" }
  },
  suppliers: {
    active: { revise: "active", request_rectification: "rectification", archive: "archived" },
    rectification: { verify: "active", archive: "archived" },
    archived: {}
  }
});

function workflowError(code, message) {
  return Object.assign(new Error(message), { code });
}

export function assertSupplyChainWorkflowResource(resource) {
  const value = String(resource || "").trim();
  if (!RESOURCE_SET.has(value)) throw workflowError("SUPPLY_WORKFLOW_RESOURCE_INVALID", "供应链工作流资源无效。");
  return value;
}

export function ownerDepartmentForResource(resource) {
  return OWNERS[assertSupplyChainWorkflowResource(resource)];
}

export function supplyChainWorkflowInitialStatus(resource) {
  const value = assertSupplyChainWorkflowResource(resource);
  return INITIAL[value] || INITIAL.default;
}

function safeClone(value, depth = 0) {
  if (depth > 8) throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "工作流字段嵌套过深。");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "工作流数值无效。");
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > 500) throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "工作流字段数量超过限制。");
    return value.map(item => safeClone(item, depth + 1));
  }
  if (!value || typeof value !== "object") throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "工作流字段格式无效。");
  const output = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SERVER_FIELDS.test(key)) throw workflowError("SUPPLY_WORKFLOW_SERVER_FIELD_DENIED", "服务端字段不能由客户端提交。");
    if (SENSITIVE_FIELDS.test(key)) throw workflowError("SUPPLY_WORKFLOW_SENSITIVE_FIELD_DENIED", "敏感信息必须保存到平台连接保险箱。");
    output[key] = safeClone(nested, depth + 1);
  }
  return output;
}

export function normalizeSupplyChainWorkflowFields(fields) {
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) {
    throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "工作流 fields 必须是对象。");
  }
  const normalized = safeClone(fields);
  if (JSON.stringify(normalized).length > 64_000) {
    throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "工作流字段超过安全上限。");
  }
  return normalized;
}

export function assertSupplyChainWorkflowAction({ resource, status, action }) {
  const safeResource = assertSupplyChainWorkflowResource(resource);
  const safeStatus = String(status || "").trim();
  const safeAction = String(action || "").trim();
  if (!/^[a-z][a-z0-9_]{1,63}$/.test(safeAction) || safeAction === "delete") {
    throw workflowError("SUPPLY_WORKFLOW_ACTION_INVALID", "供应链工作流动作无效。");
  }
  const transitions = RESOURCE_TRANSITIONS[safeResource] || COMMON;
  const toStatus = transitions[safeStatus]?.[safeAction];
  if (!toStatus) throw workflowError("SUPPLY_WORKFLOW_TRANSITION_INVALID", "当前状态不允许执行该动作。");
  return { fromStatus: safeStatus, toStatus };
}
