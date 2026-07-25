const PLATFORM_BASE = "/api/platform/v1";
const AUTH_ERROR_CODES = new Set(["AUTH_SESSION_REQUIRED", "PERMISSION_VIEW_DENIED"]);

function compactSearch(values) {
  const search = new URLSearchParams();
  Object.entries(values).forEach(([key, value]) => {
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      search.set(key, String(value));
    }
  });
  const query = search.toString();
  return query ? `?${query}` : "";
}

function apiError(response, payload, fallbackCode) {
  const source = payload?.error && typeof payload.error === "object" ? payload.error : {};
  return Object.assign(
    new Error(source.message || payload?.message || "供应链共享数据暂不可用。"),
    {
      status: response.status,
      code: String(source.code || fallbackCode),
      requestId: String(source.requestId || ""),
      retryable: Boolean(source.retryable)
    }
  );
}

async function requestJson(url, { fetchImpl = fetch, signal } = {}) {
  const response = await fetchImpl(url, {
    method: "GET",
    credentials: "include",
    headers: { accept: "application/json" },
    signal
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw apiError(response, payload, "SUPPLY_CHAIN_SHARED_DATA_UNAVAILABLE");
  return payload;
}

function normalizedQuality(payload, fallbackStatus = "partial") {
  const source = payload?.quality || payload?.meta?.quality || {};
  const status = ["trusted", "partial", "stale", "unavailable"].includes(source.status)
    ? source.status
    : payload?.synced === false
      ? "unavailable"
      : fallbackStatus;
  return {
    ...source,
    status,
    lastSuccessfulSyncAt: source.lastSuccessfulSyncAt || payload?.lastSuccessfulSyncAt || payload?.meta?.lastSuccessfulSyncAt || null,
    coverage: source.coverage ?? payload?.meta?.coverage ?? null,
    confidence: source.confidence ?? payload?.meta?.confidence ?? null,
    missing: Array.isArray(source.missing) ? source.missing : []
  };
}

function normalizedCollection(payload, keys = ["items", "data"]) {
  const key = keys.find(candidate => Array.isArray(payload?.[candidate]));
  return {
    items: key ? payload[key] : [],
    quality: normalizedQuality(payload),
    page: payload?.page && typeof payload.page === "object" ? payload.page : { nextCursor: null },
    meta: payload?.meta && typeof payload.meta === "object" ? payload.meta : {}
  };
}

export async function loadSupplyChainInventory({
  mode = "current",
  asOf,
  skuId,
  warehouseId,
  cursor,
  fetchImpl = fetch,
  signal
} = {}) {
  const query = compactSearch({ mode, asOf, skuId, warehouseId, cursor });
  const payload = await requestJson(`${PLATFORM_BASE}/goods-flow/inventory${query}`, { fetchImpl, signal });
  return normalizedCollection(payload);
}

function validSalesContract(contract) {
  return contract?.timeBasis === "create_time"
    && contract?.timezone === "Asia/Shanghai"
    && contract?.excludeOther === true
    && Array.isArray(contract?.grain)
    && contract.grain.join("|") === "date|inventoryUnitId|platform";
}

export async function loadSupplyChainSalesDaily({
  from,
  to,
  productId,
  inventoryUnitId,
  platform,
  cursor,
  fetchImpl = fetch,
  signal
} = {}) {
  const query = compactSearch({ from, to, productId, inventoryUnitId, platform, cursor });
  const payload = await requestJson(`${PLATFORM_BASE}/data-services/sales/daily${query}`, { fetchImpl, signal });
  if (!validSalesContract(payload.contract)) {
    throw Object.assign(new Error("销售需求数据口径与公司标准不一致。"), {
      status: 502,
      code: "SUPPLY_CHAIN_CONTRACT_INVALID",
      retryable: false
    });
  }
  return {
    ...normalizedCollection(payload),
    contract: payload.contract
  };
}

async function loadGoodsFlowCollection(resource, { filters = {}, fetchImpl = fetch, signal } = {}) {
  const query = compactSearch(filters);
  const payload = await requestJson(`${PLATFORM_BASE}/goods-flow/${resource}${query}`, { fetchImpl, signal });
  return normalizedCollection(payload);
}

export const loadSupplyChainSuppliers = options => loadGoodsFlowCollection("suppliers", options);
export const loadSupplyChainPurchases = options => loadGoodsFlowCollection("purchases", options);
export const loadSupplyChainPayments = options => loadGoodsFlowCollection("payments", options);
export const loadSupplyChainQualityIncidents = options => loadGoodsFlowCollection("quality-incidents", options);
export const loadSupplyChainAftersales = options => loadGoodsFlowCollection("aftersales", options);

export async function loadSupplyChainDataTasks({ filters = {}, fetchImpl = fetch, signal } = {}) {
  const query = compactSearch(filters);
  const payload = await requestJson(`${PLATFORM_BASE}/data-tasks${query}`, { fetchImpl, signal });
  return normalizedCollection(payload);
}

function workspaceRequests(workspace, filters, fetchImpl, signal) {
  const common = { fetchImpl, signal };
  const inventoryFilters = {
    mode: filters.inventoryMode || "current",
    asOf: filters.asOf,
    skuId: filters.inventoryUnitId,
    warehouseId: filters.warehouseId,
    cursor: filters.inventoryCursor
  };
  const salesFilters = {
    from: filters.from,
    to: filters.to,
    productId: filters.productId,
    inventoryUnitId: filters.inventoryUnitId,
    platform: filters.platform,
    cursor: filters.salesCursor
  };
  const requests = {
    workbench: {
      inventory: () => loadSupplyChainInventory({ ...inventoryFilters, ...common }),
      sales: () => loadSupplyChainSalesDaily({ ...salesFilters, ...common })
    },
    planning: {
      inventory: () => loadSupplyChainInventory({ ...inventoryFilters, ...common }),
      sales: () => loadSupplyChainSalesDaily({ ...salesFilters, ...common }),
      purchases: () => loadSupplyChainPurchases({ filters, ...common })
    },
    suppliers: {
      suppliers: () => loadSupplyChainSuppliers({ filters, ...common })
    },
    transit: {
      purchases: () => loadSupplyChainPurchases({ filters, ...common }),
      payments: () => loadSupplyChainPayments({ filters, ...common })
    },
    inventory: {
      inventory: () => loadSupplyChainInventory({ ...inventoryFilters, ...common })
    },
    quality: {
      qualityIncidents: () => loadSupplyChainQualityIncidents({ filters, ...common }),
      aftersales: () => loadSupplyChainAftersales({ filters, ...common })
    },
    finance: {
      purchases: () => loadSupplyChainPurchases({ filters, ...common }),
      payments: () => loadSupplyChainPayments({ filters, ...common })
    },
    rules: {
      tasks: () => loadSupplyChainDataTasks({ filters, ...common })
    }
  };
  return requests[workspace] || requests.workbench;
}

function workspaceQuality(data, errors) {
  const entries = Object.entries(data);
  if (!entries.length) {
    return {
      status: "unavailable",
      lastSuccessfulSyncAt: null,
      coverage: null,
      confidence: null,
      missing: errors.map(error => error.resource)
    };
  }
  const qualities = entries.map(([, value]) => value.quality || {});
  const missing = [
    ...errors.map(error => error.resource),
    ...qualities.flatMap(quality => quality.missing || [])
  ];
  const timestamps = qualities.map(quality => quality.lastSuccessfulSyncAt).filter(Boolean).sort();
  const hasPartial = errors.length > 0 || qualities.some(quality => quality.status === "partial");
  const hasStale = qualities.some(quality => quality.status === "stale");
  return {
    status: hasPartial ? "partial" : hasStale ? "stale" : "trusted",
    lastSuccessfulSyncAt: timestamps.at(-1) || null,
    coverage: qualities.every(quality => typeof quality.coverage === "number")
      ? Math.min(...qualities.map(quality => quality.coverage))
      : null,
    confidence: null,
    missing: [...new Set(missing)]
  };
}

export async function loadSupplyChainWorkspaceData({
  workspace = "workbench",
  filters = {},
  fetchImpl = fetch,
  signal
} = {}) {
  const requests = Object.entries(workspaceRequests(workspace, filters, fetchImpl, signal));
  const settled = await Promise.allSettled(requests.map(([, operation]) => operation()));
  const data = {};
  const errors = [];
  settled.forEach((result, index) => {
    const resource = requests[index][0];
    if (result.status === "fulfilled") {
      data[resource] = result.value;
      return;
    }
    const error = result.reason;
    if (AUTH_ERROR_CODES.has(error?.code) || Number(error?.status) === 401) throw error;
    errors.push({
      resource,
      code: String(error?.code || "SUPPLY_CHAIN_SHARED_DATA_UNAVAILABLE"),
      requestId: String(error?.requestId || ""),
      retryable: Boolean(error?.retryable),
      message: String(error?.message || "共享数据暂不可用。")
    });
  });
  return {
    data,
    quality: workspaceQuality(data, errors),
    errors
  };
}
