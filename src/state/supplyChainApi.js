export function supplyChainApiUrl() {
  return "/api/supply-chain";
}

export function supplyChainApprovalSyncUrl() {
  return "/api/supply-chain/approvals/sync";
}

const WORKFLOW_BASE = "/api/platform/v1/supply-chain-workflows";
const WORKFLOW_RESOURCES = new Set([
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
const SERVER_OWNED_FIELDS = new Set([
  "actor",
  "actorId",
  "userId",
  "department",
  "ownerDepartment",
  "createdBy",
  "updatedBy"
]);

function workflowError(code, message) {
  return Object.assign(new Error(message), {
    status: 400,
    code,
    retryable: false,
    requestId: ""
  });
}

function workflowResource(resource) {
  const normalized = String(resource || "").trim();
  if (!WORKFLOW_RESOURCES.has(normalized)) {
    throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "供应链工作流资源无效。");
  }
  return normalized;
}

function workflowEntityId(id) {
  const value = String(id || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9:_-]{0,159}$/.test(value)) {
    throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "供应链工作流 ID 无效。");
  }
  return value;
}

function compactSearch(values = {}) {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function parsedWorkflowError(response, payload) {
  const source = payload?.error && typeof payload.error === "object" ? payload.error : {};
  return Object.assign(
    new Error(source.message || payload?.message || "供应链工作流暂不可用。"),
    {
      status: response.status,
      code: String(source.code || "SUPPLY_WORKFLOW_STORAGE_UNAVAILABLE"),
      requestId: String(source.requestId || ""),
      retryable: Boolean(source.retryable)
    }
  );
}

async function workflowRequest(url, options, fetchImpl) {
  const response = await fetchImpl(url, {
    ...options,
    credentials: "include",
    headers: { accept: "application/json", ...(options.headers || {}) }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.synced === false) throw parsedWorkflowError(response, payload);
  return payload;
}

export async function loadSupplyChainWorkflowCollection({
  resource,
  filters = {},
  fetchImpl = fetch,
  signal
} = {}) {
  const safeResource = workflowResource(resource);
  const payload = await workflowRequest(
    `${WORKFLOW_BASE}/${safeResource}${compactSearch(filters)}`,
    { method: "GET", signal },
    fetchImpl
  );
  const coverage = payload?.coverage && typeof payload.coverage === "object"
    ? payload.coverage
    : { status: "missing", asOf: null, sourceVersions: [] };
  return {
    synced: true,
    items: Array.isArray(payload?.items) ? payload.items : [],
    nextCursor: String(payload?.nextCursor || ""),
    scope: payload?.scope && typeof payload.scope === "object" ? payload.scope : {},
    coverage: {
      ...coverage,
      status: String(coverage.status || "missing"),
      asOf: coverage.asOf || null,
      sourceVersions: Array.isArray(coverage.sourceVersions) ? coverage.sourceVersions : []
    }
  };
}

function containsServerOwnedField(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(containsServerOwnedField);
  return Object.entries(value).some(([key, nested]) => SERVER_OWNED_FIELDS.has(key) || containsServerOwnedField(nested));
}

export async function loadSupplyChainWorkflowResources({
  resources = [],
  filters = {},
  fetchImpl = fetch,
  signal
} = {}) {
  const normalizedResources = [...new Set(resources.map(workflowResource))];
  const settled = await Promise.allSettled(normalizedResources.map(resource => loadSupplyChainWorkflowCollection({
    resource,
    filters: filters[resource] || {},
    fetchImpl,
    signal
  })));
  const result = {};
  const errors = [];
  settled.forEach((entry, index) => {
    const resource = normalizedResources[index];
    if (entry.status === "fulfilled") {
      result[resource] = {
        ...entry.value,
        available: true
      };
      return;
    }
    const error = entry.reason;
    result[resource] = {
      synced: false,
      items: [],
      nextCursor: "",
      scope: {},
      coverage: {
        status: "missing",
        asOf: null,
        sourceVersions: []
      },
      available: false
    };
    errors.push({
      resource,
      code: String(error?.code || "SUPPLY_WORKFLOW_STORAGE_UNAVAILABLE"),
      message: String(error?.message || "供应链工作流暂不可用。"),
      requestId: String(error?.requestId || ""),
      retryable: Boolean(error?.retryable)
    });
  });
  return { resources: result, errors };
}

export async function createSupplyChainWorkflowEntity({
  resource,
  id,
  fields = {},
  idempotencyKey,
  fetchImpl = fetch,
  signal
} = {}) {
  const safeResource = workflowResource(resource);
  const safeId = workflowEntityId(id);
  const safeKey = String(idempotencyKey || "").trim();
  if (!safeKey) {
    throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "工作流创建缺少 ID 或幂等键。");
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || containsServerOwnedField(fields)) {
    throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "操作者和责任范围由服务端会话记录，客户端不得提交。");
  }
  return workflowRequest(
    `${WORKFLOW_BASE}/${safeResource}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": safeKey
      },
      body: JSON.stringify({ id: safeId, fields }),
      signal
    },
    fetchImpl
  );
}

export async function executeSupplyChainWorkflowAction({
  resource,
  id,
  action,
  expectedVersion,
  reason,
  fields = {},
  idempotencyKey,
  fetchImpl = fetch,
  signal
} = {}) {
  const safeResource = workflowResource(resource);
  const safeId = workflowEntityId(id);
  const safeAction = String(action || "").trim();
  const safeKey = String(idempotencyKey || "").trim();
  if (!safeId || !safeAction || !safeKey || !Number.isInteger(Number(expectedVersion))) {
    throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "工作流动作缺少 ID、版本或幂等键。");
  }
  if (!fields || typeof fields !== "object" || Array.isArray(fields) || containsServerOwnedField(fields)) {
    throw workflowError("SUPPLY_WORKFLOW_INPUT_INVALID", "操作者和责任范围由服务端会话记录，客户端不得提交。");
  }
  const body = {
    expectedVersion: Number(expectedVersion),
    action: safeAction,
    ...(String(reason || "").trim() ? { reason: String(reason).trim() } : {}),
    fields
  };
  return workflowRequest(
    `${WORKFLOW_BASE}/${safeResource}/${safeId}/actions`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "Idempotency-Key": safeKey
      },
      body: JSON.stringify(body),
      signal
    },
    fetchImpl
  );
}

const EXTERNAL_ACTION_LABELS = Object.freeze({
  dingtalk_approval: {
    title: "采购计划已保存",
    message: "钉钉审批仍需人工完成，系统未标记为外部成功。"
  },
  erp_purchase_order: {
    title: "采购单状态已保存",
    message: "ERP 下单仍需人工完成，系统未标记为外部成功。"
  }
});

export function supplyChainWorkflowResultNotice(payload = {}) {
  const externalAction = payload?.entity?.fields?.externalAction;
  if (externalAction?.status === "pending_manual") {
    const labels = EXTERNAL_ACTION_LABELS[externalAction.type] || {
      title: "业务状态已保存",
      message: "外部操作仍需人工完成，系统未标记为外部成功。"
    };
    return {
      tone: "warning",
      ...labels,
      pendingManual: true
    };
  }
  return {
    tone: "success",
    title: "操作已保存",
    message: "版本与审计记录已更新。",
    pendingManual: false
  };
}

export async function syncSupplyApprovalPages({ input = {}, fetchImpl = fetch, now = Date.now(), url = supplyChainApprovalSyncUrl() } = {}) {
  const startTime = Number(input.startTime) || now - 30 * 24 * 60 * 60 * 1000;
  const endTime = Number(input.endTime) || now;
  const counts = { purchase: 0, payment: 0, unmapped: 0, skipped: 0 };

  for (const kind of ["purchase", "payment"]) {
    let cursor = 0;
    const seenCursors = new Set();
    while (!seenCursors.has(cursor)) {
      seenCursors.add(cursor);
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...input, startTime, endTime, batch: { kind, cursor, size: 18 } })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload.synced === false) throw new Error(payload.message || "钉钉审批同步失败。");
      for (const key of Object.keys(counts)) counts[key] += Number(payload.counts?.[key] || 0);
      const nextCursor = payload.continuation?.nextCursor;
      if (nextCursor === null || nextCursor === undefined || nextCursor === "") break;
      cursor = Math.max(0, Number(nextCursor) || 0);
    }
  }

  return { synced: true, counts };
}
